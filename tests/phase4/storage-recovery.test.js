import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createJsonFileStore, readJsonFile, writeJsonFile } from "../../storage/jsonFile.js";
import { createPendingActionsStorage } from "../../storage/pendingActionsStorage.js";
import { createConfirmationService } from "../../services/confirmationService.js";
import { createBackupService } from "../../services/backupService.js";
import { MemoryManager } from "../../features/memory/MemoryManager.js";

async function withTempDir(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "samgpt-phase4-"));
  try { await run(dir); } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

function makePending(id, overrides = {}) {
  return {
    id, tool: "test_tool", action: "send", payload: { to: "synthetic@example.test" },
    expiresAt: new Date(Date.now() + 60_000).toISOString(), status: "pending", ...overrides,
  };
}

test("shared JSON store distinguishes missing/corrupt data and preserves legacy JSON shapes", async () => {
  await withTempDir(async dir => {
    const file = path.join(dir, "tasks.json");
    const store = createJsonFileStore(file, { fallbackValue: [], validate: Array.isArray, mode: 0o600 });
    assert.deepEqual(await store.read(), []);
    const legacyTasks = [{ id: 12, title: "Existing format" }];
    await fs.writeFile(file, JSON.stringify(legacyTasks));
    assert.deepEqual(await store.read(), legacyTasks);
    await fs.writeFile(file, "{bad-json");
    await assert.rejects(store.read(), err => err.code === "JSON_STORAGE_CORRUPT");
    await fs.writeFile(file, JSON.stringify({ wrong: true }));
    await assert.rejects(store.read(), err => err.code === "JSON_STORAGE_CORRUPT");
  });
});

test("atomic JSON writes preserve the prior file on serialization failure and keep private mode", async () => {
  await withTempDir(async dir => {
    const file = path.join(dir, "sensitive.json");
    await writeJsonFile(file, { valid: true }, { mode: 0o600 });
    const cyclic = {}; cyclic.self = cyclic;
    await assert.rejects(writeJsonFile(file, cyclic, { mode: 0o600 }));
    await assert.rejects(writeJsonFile(file, { replacement: true }, {
      mode: 0o600,
      renameFile: async () => { throw Object.assign(new Error("synthetic rename failure"), { code: "EIO" }); },
    }), err => err.code === "EIO");
    assert.deepEqual(await readJsonFile(file, null), { valid: true });
    assert.deepEqual((await fs.readdir(dir)).sort(), ["sensitive.json"]);
    if (process.platform !== "win32") assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
    await writeJsonFile(file, { next: true }, { mode: 0o600 });
    assert.deepEqual(await readJsonFile(file, null), { next: true });
  });
});

test("serialized JSON store updates do not lose concurrent increments", async () => {
  await withTempDir(async dir => {
    const store = createJsonFileStore(path.join(dir, "counter.json"), {
      fallbackValue: { count: 0 }, validate: value => Number.isInteger(value?.count),
    });
    await Promise.all(Array.from({ length: 50 }, () => store.update(async value => {
      await new Promise(resolve => setImmediate(resolve));
      return { count: value.count + 1 };
    })));
    assert.deepEqual(await store.read(), { count: 50 });

    const profile = createJsonFileStore(path.join(dir, "profile.json"), {
      fallbackValue: { contacts: {} },
      validate: value => value?.contacts && typeof value.contacts === "object" && !Array.isArray(value.contacts),
    });
    await Promise.all(Array.from({ length: 20 }, (_, index) => profile.update(current => ({
      ...current,
      contacts: { ...current.contacts, [`contact-${index}`]: { email: `${index}@example.test` } },
    }))));
    assert.equal(Object.keys((await profile.read()).contacts).length, 20);
  });
});

test("a claimed action from a prior process becomes outcome-unknown and cannot execute again", async () => {
  await withTempDir(async dir => {
    const file = path.join(dir, "pending.json");
    const originalProcessStore = createPendingActionsStorage(file);
    await originalProcessStore.addPendingAction(makePending("uncertain"));
    assert.equal((await originalProcessStore.claimPendingAction("uncertain")).status, "claimed");
    const persisted = await originalProcessStore.loadPendingActions();
    persisted[0].executionPid = 2_147_483_647;
    await originalProcessStore.savePendingActions(persisted);

    const restartedProcessStore = createPendingActionsStorage(file);
    await restartedProcessStore.cleanExpired();
    const record = (await restartedProcessStore.loadPendingActions())[0];
    assert.equal(record.status, "outcome_unknown");
    assert.ok(record.recoveredAt);
    await restartedProcessStore.addPendingAction(makePending("later"));
    assert.equal((await restartedProcessStore.loadPendingActions()).some(action => action.id === "uncertain"), true);
    assert.equal(await restartedProcessStore.getPendingAction("uncertain"), null);

    let executions = 0;
    const confirmation = createConfirmationService({
      storage: restartedProcessStore,
      executeTool: async () => { executions++; return { success: true }; },
    });
    const result = await confirmation.confirmAction("uncertain");
    assert.equal(result.status, "outcome_unknown");
    assert.match(result.message, /external service/i);
    assert.equal(executions, 0);
  });
});

test("expiry cleanup removes expired pending entries but retains live claims and uncertainty", async () => {
  await withTempDir(async dir => {
    const storage = createPendingActionsStorage(path.join(dir, "pending.json"));
    await storage.addPendingAction(makePending("expired", { expiresAt: new Date(Date.now() - 10).toISOString() }));
    await storage.addPendingAction(makePending("running", { expiresAt: new Date(Date.now() + 60_000).toISOString() }));
    await storage.claimPendingAction("running");
    const claimed = await storage.loadPendingActions();
    claimed.find(action => action.id === "running").expiresAt = new Date(Date.now() - 1).toISOString();
    await storage.savePendingActions(claimed);
    await storage.cleanExpired();
    const actions = await storage.loadPendingActions();
    assert.equal(actions.some(action => action.id === "expired"), false);
    assert.equal(actions.find(action => action.id === "running")?.status, "executing");
    assert.equal((await storage.cancelPendingAction("running")).status, "already_claimed");
  });
});

function makeBackupFixture(dir) {
  const data = {
    tasks: [{ id: 1 }], notes: [{ id: 2 }], memory: { name: "old" },
    history: [{ role: "user" }], settings: { model: "auto" }, stats: { messages: 1 },
  };
  const storage = {};
  for (const key of Object.keys(data)) {
    storage[`load${key[0].toUpperCase()}${key.slice(1)}`] = async () => structuredClone(data[key]);
    const saveName = key === "memory" ? "replaceMemory" : `save${key[0].toUpperCase()}${key.slice(1)}`;
    storage[saveName] = async value => { data[key] = structuredClone(value); };
  }
  return { data, service: createBackupService(storage, { journalDirectory: path.join(dir, "journal") }) };
}

test("backup export omits credentials and restore validates before changing any store", async () => {
  await withTempDir(async dir => {
  const { data, service } = makeBackupFixture(dir);
  const backup = await service.createBackup();
  assert.deepEqual(backup.memory, { name: "old" });
  assert.equal("gmail_token" in backup, false);
  assert.equal("pendingActions" in backup, false);

  await assert.rejects(service.restoreBackup({ tasks: "not-an-array", memory: { safe: true } }), err => err.code === "BACKUP_INVALID");
  assert.deepEqual(data.tasks, [{ id: 1 }]);
  assert.deepEqual(data.memory, { name: "old" });
  });
});

test("restore rolls back files already written when a later store fails", async () => {
  await withTempDir(async dir => {
  const { data } = makeBackupFixture(dir);
  let failNotes = true;
  const service = createBackupService({
    loadTasks: baseStorageLoad(data, "tasks"),
    saveTasks: async value => { data.tasks = structuredClone(value); },
    loadNotes: baseStorageLoad(data, "notes"),
    saveNotes: async value => {
      if (failNotes && value?.[0]?.id === 22) { failNotes = false; throw new Error("synthetic write failure"); }
      data.notes = structuredClone(value);
    },
    loadMemory: baseStorageLoad(data, "memory"),
    replaceMemory: async value => { data.memory = structuredClone(value); },
    loadHistory: baseStorageLoad(data, "history"),
    saveHistory: async value => { data.history = structuredClone(value); },
    loadSettings: baseStorageLoad(data, "settings"),
    saveSettings: async value => { data.settings = structuredClone(value); },
    loadStats: baseStorageLoad(data, "stats"),
    saveStats: async value => { data.stats = structuredClone(value); },
  }, { journalDirectory: path.join(dir, "journal") });
  await assert.rejects(service.restoreBackup({ version: "1.0", tasks: [{ id: 11 }], notes: [{ id: 22 }] }), err => {
    assert.equal(err.code, "BACKUP_RESTORE_FAILED");
    assert.equal(err.rollbackComplete, true);
    return true;
  });
  assert.deepEqual(data.tasks, [{ id: 1 }]);
  assert.deepEqual(data.notes, [{ id: 2 }]);
  });
});

test("semantic memory deletion also removes its derived relationship edge", async () => {
  let profile = { preferred_name: "Sam" };
  const calls = [];
  const manager = Object.create(MemoryManager.prototype);
  manager.registry = { getStore: () => ({ delete: async key => {
    const normalized = key.replace(/^sem_/, "");
    const existed = Object.hasOwn(profile, normalized);
    delete profile[normalized];
    return existed;
  } }) };
  manager.graph = { removeRelationship: async (...args) => { calls.push(args); return true; } };
  assert.equal(await manager.delete("sem_preferred_name"), true);
  assert.deepEqual(profile, {});
  assert.deepEqual(calls, [["user", "preferred_name", "has_property"]]);
});

function baseStorageLoad(data, key) {
  return async () => structuredClone(data[key]);
}
