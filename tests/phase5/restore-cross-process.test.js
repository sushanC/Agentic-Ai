import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createJsonFileStore, withJsonFileLock, writeJsonFile, readJsonFile } from "../../storage/jsonFile.js";
import { createBackupService } from "../../services/backupService.js";
import { createPendingActionsStorage } from "../../storage/pendingActionsStorage.js";

const worker = fileURLToPath(new URL("./restore-worker.js", import.meta.url));

async function tempDir(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "samgpt-phase5-"));
  try { await run(dir); } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

function runWorker(mode, dir) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [worker, mode, dir], { stdio: "ignore" });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

function makeService(dir, { failSave } = {}) {
  const values = {
    tasks: [{ id: 1 }], notes: [{ id: 2 }], memory: { old: true },
    history: [{ role: "user", content: "old" }], settings: { model: "old" }, stats: { n: 1 },
  };
  const storage = {};
  for (const key of Object.keys(values)) {
    storage[`load${key[0].toUpperCase()}${key.slice(1)}`] = async () => structuredClone(values[key]);
    storage[key === "memory" ? "replaceMemory" : `save${key[0].toUpperCase()}${key.slice(1)}`] = async next => {
      if (failSave?.(key, next)) throw Object.assign(new Error("synthetic permission denied"), { code: "EACCES" });
      values[key] = structuredClone(next);
    };
  }
  return { values, service: createBackupService(storage, { journalDirectory: path.join(dir, "journal") }) };
}

async function initializeCrashStores(dir) {
  await writeJsonFile(path.join(dir, "tasks.json"), [{ id: 1 }]);
  await writeJsonFile(path.join(dir, "notes.json"), [{ id: 2 }]);
}

test("invalid backup and legacy backup formats validate before live changes", async () => {
  await tempDir(async dir => {
    const { values, service } = makeService(dir);
    await assert.rejects(service.restoreBackup({ tasks: "bad", notes: [{ id: 22 }] }), e => e.code === "BACKUP_INVALID");
    assert.deepEqual(values.tasks, [{ id: 1 }]);
    assert.deepEqual(values.notes, [{ id: 2 }]);
    const result = await service.restoreBackup({ tasks: [{ id: 11 }] });
    assert.equal(result.success, true);
    assert.deepEqual(values.tasks, [{ id: 11 }]);
    assert.deepEqual(values.notes, [{ id: 2 }]);
  });
});

test("crash after staging but before first replacement discards the orphan stage", async () => {
  await tempDir(async dir => {
    await initializeCrashStores(dir);
    assert.equal((await runWorker("stage-only", dir)).code, 75);
    const store = createJsonFileStore(path.join(dir, "tasks.json"), { fallbackValue: [], validate: Array.isArray });
    const service = createBackupService({
      loadTasks: () => store.read(), saveTasks: value => store.write(value),
      loadNotes: async () => [{ id: 2 }], saveNotes: async () => {},
      loadMemory: async () => ({}), replaceMemory: async () => {}, loadHistory: async () => [], saveHistory: async () => {},
      loadSettings: async () => ({}), saveSettings: async () => {}, loadStats: async () => ({}), saveStats: async () => {},
    }, { journalDirectory: path.join(dir, "journal") });
    assert.deepEqual(await service.recoverPendingRestore(), { recovered: false, discardedStage: true });
    assert.deepEqual(await store.read(), [{ id: 1 }]);
  });
});

test("crash after a live replacement rolls back and repeated recovery is idempotent", async () => {
  await tempDir(async dir => {
    await initializeCrashStores(dir);
    assert.equal((await runWorker("crash-on-restore-notes", dir)).code, 73);
    assert.deepEqual(await readJsonFile(path.join(dir, "tasks.json"), []), [{ id: 11 }]);
    assert.deepEqual(await readJsonFile(path.join(dir, "notes.json"), []), [{ id: 22 }]);
    assert.equal((await runWorker("recover-crash", dir)).code, 74);
    assert.equal((await runWorker("recover", dir)).code, 0);
    assert.deepEqual(await readJsonFile(path.join(dir, "tasks.json"), []), [{ id: 1 }]);
    assert.deepEqual(await readJsonFile(path.join(dir, "notes.json"), []), [{ id: 2 }]);
    assert.deepEqual(await runWorker("recover", dir), { code: 0, signal: null });
  });
});

test("missing and corrupt snapshots fail closed without further live writes", async () => {
  await tempDir(async dir => {
    await initializeCrashStores(dir);
    assert.equal((await runWorker("crash-on-restore-notes", dir)).code, 73);
    await fs.unlink(path.join(dir, "journal", "snapshot-notes.json"));
    const taskFile = createJsonFileStore(path.join(dir, "tasks.json"), { fallbackValue: [], validate: Array.isArray });
    const svc = createBackupService({
      loadTasks: () => taskFile.read(), saveTasks: value => taskFile.write(value),
      loadNotes: async () => [{ id: 2 }], saveNotes: async () => {},
      loadMemory: async () => ({}), replaceMemory: async () => {}, loadHistory: async () => [], saveHistory: async () => {},
      loadSettings: async () => ({}), saveSettings: async () => {}, loadStats: async () => ({}), saveStats: async () => {},
    }, { journalDirectory: path.join(dir, "journal") });
    await assert.rejects(svc.recoverPendingRestore(), e => e.code === "RESTORE_SNAPSHOT_MISSING");
    assert.deepEqual(await taskFile.read(), [{ id: 11 }]);
  });
});

test("a corrupt manifest or snapshot fails closed and retains the journal", async () => {
  await tempDir(async dir => {
    await initializeCrashStores(dir);
    assert.equal((await runWorker("crash-on-restore-notes", dir)).code, 73);
    await fs.writeFile(path.join(dir, "journal", "snapshot-notes.json"), "{broken", { mode: 0o600 });
    const store = createJsonFileStore(path.join(dir, "tasks.json"), { fallbackValue: [], validate: Array.isArray });
    const service = createBackupService({
      loadTasks: () => store.read(), saveTasks: value => store.write(value),
      loadNotes: async () => [{ id: 22 }], saveNotes: async () => {},
      loadMemory: async () => ({}), replaceMemory: async () => {}, loadHistory: async () => [], saveHistory: async () => {},
      loadSettings: async () => ({}), saveSettings: async () => {}, loadStats: async () => ({}), saveStats: async () => {},
    }, { journalDirectory: path.join(dir, "journal") });
    await assert.rejects(service.recoverPendingRestore(), e => e.code === "RESTORE_SNAPSHOT_CORRUPT");
    assert.deepEqual(await store.read(), [{ id: 11 }]);
    await fs.writeFile(path.join(dir, "journal", "manifest.json"), "{broken", { mode: 0o600 });
    await assert.rejects(service.recoverPendingRestore(), e => e.code === "RESTORE_JOURNAL_CORRUPT");
    assert.equal(await fs.stat(path.join(dir, "journal")).then(() => true), true);
    assert.deepEqual(await store.read(), [{ id: 11 }]);
  });
});

test("two independent processes preserve all concurrent JSON increments", async () => {
  await tempDir(async dir => {
    const outcomes = await Promise.all([runWorker("increment", dir), runWorker("increment", dir)]);
    assert.deepEqual(outcomes.map(x => x.code), [0, 0]);
    assert.deepEqual(await readJsonFile(path.join(dir, "counter.json"), null), { count: 80 });
  });
});

test("cross-process locks enforce bounded waiting and reclaim a dead same-host owner", async () => {
  await tempDir(async dir => {
    const file = path.join(dir, "locked.json");
    const lock = `${file}.lock`;
    await fs.mkdir(lock);
    await fs.writeFile(path.join(lock, "owner.json"), JSON.stringify({ pid: process.pid, host: os.hostname(), token: "held" }));
    await assert.rejects(withJsonFileLock(file, async () => {}, { timeoutMs: 80 }), e => e.code === "JSON_STORAGE_LOCK_TIMEOUT");
    await fs.rm(lock, { recursive: true, force: true });
    await fs.mkdir(lock);
    await fs.writeFile(path.join(lock, "owner.json"), JSON.stringify({ pid: 2_147_483_647, host: os.hostname(), token: "dead" }));
    const store = createJsonFileStore(file, { fallbackValue: { count: 0 }, validate: x => Number.isInteger(x?.count) });
    await store.update(x => ({ count: x.count + 1 }));
    assert.deepEqual(await store.read(), { count: 1 });
  });
});

test("a live confirmation claim stays claimed across processes, then becomes outcome_unknown after death", async () => {
  await tempDir(async dir => {
    const file = path.join(dir, "pending.json");
    const pending = createPendingActionsStorage(file);
    await pending.addPendingAction({ id: "held-action", tool: "mock", action: "mock", payload: {}, status: "pending", expiresAt: new Date(Date.now() + 60_000).toISOString() });
    const child = spawn(process.execPath, [worker, "hold-claim", dir], { stdio: ["pipe", "pipe", "ignore"] });
    await new Promise((resolve, reject) => {
      let output = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", chunk => {
        output += chunk;
        if (output.includes("claimed\n")) resolve();
      });
      child.once("error", reject);
      child.once("exit", code => reject(new Error(`claim worker exited before acquiring: ${code}`)));
    });
    try {
      assert.equal((await pending.claimPendingAction("held-action")).status, "already_claimed");
      await pending.cleanExpired();
      assert.equal((await pending.loadPendingActions())[0].status, "executing");
    } finally {
      child.kill("SIGKILL");
      await new Promise(resolve => child.once("exit", resolve));
    }
    const restarted = createPendingActionsStorage(file);
    await restarted.cleanExpired();
    assert.equal((await restarted.loadPendingActions())[0].status, "outcome_unknown");
  });
});

test("write permission failure keeps the snapshot and rolls back earlier category changes", async () => {
  await tempDir(async dir => {
    const { values, service } = makeService(dir, { failSave: (key, next) => key === "notes" && next?.[0]?.id === 22 });
    await assert.rejects(service.restoreBackup({ tasks: [{ id: 11 }], notes: [{ id: 22 }] }), e => {
      assert.equal(e.code, "BACKUP_RESTORE_FAILED");
      assert.equal(e.rollbackComplete, true);
      return true;
    });
    assert.deepEqual(values.tasks, [{ id: 1 }]);
    assert.deepEqual(values.notes, [{ id: 2 }]);
  });
});
