import fs from "fs/promises";
import path from "path";
import { getStoragePath } from "../storage/storagePath.js";
import { readJsonFile, withJsonFileLock, writeJsonFile } from "../storage/jsonFile.js";

const BACKUP_VERSION = "1.0";
const RESTORE_JOURNAL_VERSION = 1;
const MAX_BACKUP_BYTES = 1_000_000;
const MAX_BACKUP_DEPTH = 64;
const MAX_BACKUP_NODES = 100_000;

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

function validateBackup(input) {
  if (!isRecord(input)) throw fail("BACKUP_INVALID", "Backup must be a JSON object.");
  if (input.version !== undefined && input.version !== BACKUP_VERSION) {
    throw fail("BACKUP_VERSION_UNSUPPORTED", "Backup version is not supported.");
  }
  let serialized;
  try { serialized = JSON.stringify(input); }
  catch { throw fail("BACKUP_INVALID", "Backup is not valid JSON data."); }
  if (Buffer.byteLength(serialized, "utf8") > MAX_BACKUP_BYTES) throw fail("BACKUP_TOO_LARGE", "Backup exceeds the supported size.");
  let nodes = 0;
  const stack = [{ value: input, depth: 0 }];
  while (stack.length) {
    const { value, depth } = stack.pop();
    if (++nodes > MAX_BACKUP_NODES || depth > MAX_BACKUP_DEPTH) throw fail("BACKUP_TOO_COMPLEX", "Backup structure exceeds supported limits.");
    if (value && typeof value === "object") for (const child of Object.values(value)) stack.push({ value: child, depth: depth + 1 });
  }
  for (const key of ["tasks", "notes", "history"]) if (input[key] !== undefined && !Array.isArray(input[key])) throw fail("BACKUP_INVALID", `Backup field '${key}' must be an array.`);
  for (const key of ["memory", "settings", "stats"]) if (input[key] !== undefined && !isRecord(input[key])) throw fail("BACKUP_INVALID", `Backup field '${key}' must be an object.`);
  return input;
}

function equalJson(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => equalJson(value, right[index]));
  }
  if (isRecord(left) || isRecord(right)) {
    if (!isRecord(left) || !isRecord(right)) return false;
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && equalJson(left[key], right[key]));
  }
  return false;
}

function containsJson(actual, expected) {
  if (isRecord(expected)) return isRecord(actual) && Object.entries(expected).every(([key, value]) => containsJson(actual[key], value));
  if (Array.isArray(expected)) return equalJson(actual, expected);
  return equalJson(actual, expected);
}

function matchesRestoredValue(key, actual, expected) {
  // Settings/stats loaders add documented defaults to older partial files/backups.
  return key === "settings" || key === "stats" ? containsJson(actual, expected) : equalJson(actual, expected);
}

/**
 * Durable restore journal. Before any live replacement, the transaction directory
 * contains every staged value, every pre-restore snapshot, and a flushed manifest.
 * Recovery always rolls back unless the manifest says `completed`.
 */
export function createBackupService(storage, { journalDirectory = getStoragePath("restore-journal") } = {}) {
  const journalDir = path.resolve(journalDirectory);
  const manifestPath = path.join(journalDir, "manifest.json");
  const transactionLock = `${journalDir}.transaction`;
  const definitions = [
    ["tasks", storage.loadTasks, storage.saveTasks],
    ["notes", storage.loadNotes, storage.saveNotes],
    ["memory", storage.loadMemory, storage.replaceMemory],
    ["history", storage.loadHistory, storage.saveHistory],
    ["settings", storage.loadSettings, storage.replaceSettings || storage.saveSettings],
    ["stats", storage.loadStats, storage.saveStats],
  ];

  async function readManifest() {
    try { return await readJsonFile(manifestPath, undefined); }
    catch (cause) {
      if (cause.code === "ENOENT") return undefined;
      throw fail("RESTORE_JOURNAL_CORRUPT", `Restore journal is unreadable (${cause.code || "I/O error"}).`);
    }
  }

  function assertManifest(manifest) {
    if (!isRecord(manifest) || manifest.version !== RESTORE_JOURNAL_VERSION ||
        !["prepared", "applying", "rolling_back", "completed"].includes(manifest.state) ||
        !Array.isArray(manifest.categories) || !manifest.categories.length ||
        manifest.categories.some(key => !definitions.some(([name]) => name === key))) {
      throw fail("RESTORE_JOURNAL_CORRUPT", "Restore journal manifest has an invalid shape.");
    }
  }

  async function loadJournalValues(manifest, kind) {
    const values = new Map();
    for (const key of manifest.categories) {
      const valuePath = path.join(journalDir, `${kind}-${key}.json`);
      let value;
      try { value = await readJsonFile(valuePath, undefined); }
      catch (cause) { throw fail("RESTORE_SNAPSHOT_CORRUPT", `Restore ${kind} data is unreadable for ${key} (${cause.code || "I/O error"}).`); }
      if (value === undefined) throw fail("RESTORE_SNAPSHOT_MISSING", `Restore ${kind} data is missing for ${key}.`);
      values.set(key, value);
    }
    return values;
  }

  async function cleanupJournal() { await fs.rm(journalDir, { recursive: true, force: true }); }

  async function recoverUnlocked() {
    let exists = true;
    try { await fs.access(journalDir); } catch (error) { if (error.code === "ENOENT") exists = false; else throw error; }
    if (!exists) return { recovered: false };
    const manifest = await readManifest();
    // An interrupted stage has no manifest and cannot have touched live stores.
    if (manifest === undefined) { await cleanupJournal(); return { recovered: false, discardedStage: true }; }
    assertManifest(manifest);
    if (manifest.state === "completed") {
      await cleanupJournal().catch(() => {});
      return { recovered: false, completed: true };
    }
    const snapshots = await loadJournalValues(manifest, "snapshot");
    // Read and validate every required journal file before the first recovery write.
    for (const key of manifest.categories) {
      const expected = key === "tasks" || key === "notes" || key === "history" ? Array.isArray : isRecord;
      if (!expected(snapshots.get(key))) throw fail("RESTORE_JOURNAL_CORRUPT", `Restore journal data has an invalid shape for ${key}.`);
    }
    const rollingBack = { ...manifest, state: "rolling_back" };
    await writeJsonFile(manifestPath, rollingBack, { mode: 0o600 });
    for (const key of [...manifest.categories].reverse()) {
      const [, , save] = definitions.find(([name]) => name === key);
      await save(snapshots.get(key));
      const load = definitions.find(([name]) => name === key)[1];
      if (!equalJson(await load(), snapshots.get(key))) throw fail("RESTORE_RECOVERY_VERIFY_FAILED", `Restore recovery could not verify the original ${key} data.`);
    }
    await cleanupJournal();
    return { recovered: true, strategy: "rollback" };
  }

  async function recoverPendingRestore() {
    return withJsonFileLock(transactionLock, recoverUnlocked);
  }

  async function createBackup() {
    return withJsonFileLock(transactionLock, async () => {
      const [tasks, notes, memory, history, settings, stats] = await Promise.all(definitions.map(([, load]) => load()));
      return { version: BACKUP_VERSION, timestamp: new Date().toISOString(), tasks, notes, memory, history, settings, stats };
    });
  }

  async function restoreUnlocked(input) {
    const selected = definitions.filter(([key]) => Object.hasOwn(input, key));
    if (!selected.length) throw fail("BACKUP_INVALID", "Backup contains no restorable categories.");
    await recoverUnlocked();
    const staged = new Map();
    const snapshots = new Map();
    for (const [key, load] of selected) {
      staged.set(key, structuredClone(input[key]));
      snapshots.set(key, await load());
    }
    await cleanupJournal();
    await fs.mkdir(journalDir, { recursive: true, mode: 0o700 });
    for (const [key] of selected) {
      await writeJsonFile(path.join(journalDir, `staged-${key}.json`), staged.get(key), { mode: 0o600 });
      await writeJsonFile(path.join(journalDir, `snapshot-${key}.json`), snapshots.get(key), { mode: 0o600 });
    }
    const journalShape = { categories: selected.map(([key]) => key) };
    const [stagedReadback, snapshotReadback] = await Promise.all([
      loadJournalValues(journalShape, "staged"),
      loadJournalValues(journalShape, "snapshot"),
    ]);
    for (const [key] of selected) {
      const expectedShape = key === "tasks" || key === "notes" || key === "history" ? Array.isArray : isRecord;
      if (!expectedShape(stagedReadback.get(key)) || !expectedShape(snapshotReadback.get(key)) ||
          Buffer.byteLength(JSON.stringify(stagedReadback.get(key)), "utf8") > MAX_BACKUP_BYTES ||
          !equalJson(stagedReadback.get(key), staged.get(key)) || !equalJson(snapshotReadback.get(key), snapshots.get(key))) {
        throw fail("BACKUP_STAGE_VERIFY_FAILED", `Restore staging verification failed for ${key}.`);
      }
    }
    for (const [key, value] of stagedReadback) staged.set(key, value);
    let manifest = {
      version: RESTORE_JOURNAL_VERSION,
      transactionId: `${process.pid}-${Date.now()}`,
      state: "prepared",
      categories: selected.map(([key]) => key),
      applied: [],
      createdAt: new Date().toISOString(),
    };
    await writeJsonFile(manifestPath, manifest, { mode: 0o600 });
    manifest = { ...manifest, state: "applying" };
    await writeJsonFile(manifestPath, manifest, { mode: 0o600 });
    for (const [key, , save] of selected) {
      await save(staged.get(key));
      const load = selected.find(([name]) => name === key)[1];
      if (!matchesRestoredValue(key, await load(), staged.get(key))) throw fail("BACKUP_RESTORE_VERIFY_FAILED", `Restore could not verify ${key}.`);
      manifest = { ...manifest, applied: [...manifest.applied, key] };
      await writeJsonFile(manifestPath, manifest, { mode: 0o600 });
    }
    manifest = { ...manifest, state: "completed", completedAt: new Date().toISOString() };
    await writeJsonFile(manifestPath, manifest, { mode: 0o600 });
    await cleanupJournal().catch(() => {});
    return { success: true, restored: Object.fromEntries(selected.map(([key]) => [key, Array.isArray(input[key]) ? input[key].length : Object.keys(input[key]).length])) };
  }

  async function restoreBackup(rawInput) {
    const input = validateBackup(rawInput);
    return withJsonFileLock(transactionLock, async () => {
      try { return await restoreUnlocked(input); }
      catch (cause) {
        // Keep the journal for startup recovery. Roll back immediately when possible.
        let recoveryError;
        try { await recoverUnlocked(); } catch (error) { recoveryError = error; }
        const error = fail("BACKUP_RESTORE_FAILED", "Restore failed; the durable recovery journal was retained if rollback could not complete.");
        error.rollbackComplete = !recoveryError;
        error.cause = cause;
        if (recoveryError) error.recoveryErrorCode = recoveryError.code;
        throw error;
      }
    });
  }

  return { createBackup, restoreBackup, recoverPendingRestore };
}
