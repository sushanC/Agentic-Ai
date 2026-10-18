const BACKUP_VERSION = "1.0";
const MAX_BACKUP_BYTES = 1_000_000;
const MAX_BACKUP_DEPTH = 64;
const MAX_BACKUP_NODES = 100_000;

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateBackup(input) {
  if (!isRecord(input)) throw fail("BACKUP_INVALID", "Backup must be a JSON object.");
  if (input.version !== undefined && input.version !== BACKUP_VERSION) {
    throw fail("BACKUP_VERSION_UNSUPPORTED", "Backup version is not supported.");
  }

  let serialized;
  try { serialized = JSON.stringify(input); }
  catch { throw fail("BACKUP_INVALID", "Backup is not valid JSON data."); }
  if (Buffer.byteLength(serialized, "utf8") > MAX_BACKUP_BYTES) {
    throw fail("BACKUP_TOO_LARGE", "Backup exceeds the supported size.");
  }

  let nodes = 0;
  const stack = [{ value: input, depth: 0 }];
  while (stack.length) {
    const { value, depth } = stack.pop();
    if (++nodes > MAX_BACKUP_NODES || depth > MAX_BACKUP_DEPTH) {
      throw fail("BACKUP_TOO_COMPLEX", "Backup structure exceeds supported limits.");
    }
    if (value && typeof value === "object") {
      for (const child of Object.values(value)) stack.push({ value: child, depth: depth + 1 });
    }
  }

  for (const key of ["tasks", "notes", "history"]) {
    if (input[key] !== undefined && !Array.isArray(input[key])) {
      throw fail("BACKUP_INVALID", `Backup field '${key}' must be an array.`);
    }
  }
  for (const key of ["memory", "settings", "stats"]) {
    if (input[key] !== undefined && !isRecord(input[key])) {
      throw fail("BACKUP_INVALID", `Backup field '${key}' must be an object.`);
    }
  }
  return input;
}

export function createBackupService(storage) {
  const definitions = [
    ["tasks", storage.loadTasks, storage.saveTasks],
    ["notes", storage.loadNotes, storage.saveNotes],
    ["memory", storage.loadMemory, storage.replaceMemory],
    ["history", storage.loadHistory, storage.saveHistory],
    ["settings", storage.loadSettings, storage.replaceSettings || storage.saveSettings],
    ["stats", storage.loadStats, storage.saveStats],
  ];

  async function createBackup() {
    const [tasks, notes, memory, history, settings, stats] = await Promise.all(
      definitions.map(([, load]) => load())
    );
    return {
      version: BACKUP_VERSION,
      timestamp: new Date().toISOString(),
      tasks, notes, memory, history, settings, stats,
    };
  }

  async function restoreBackup(rawInput) {
    const input = validateBackup(rawInput);
    const selected = definitions.filter(([key]) => Object.hasOwn(input, key));
    const snapshots = new Map();
    for (const [key, load] of selected) snapshots.set(key, await load());

    const attempted = [];
    try {
      for (const [key, , save] of selected) {
        attempted.push(key);
        await save(input[key]);
      }
    } catch (cause) {
      const rollbackErrors = [];
      for (const [key, , save] of selected.filter(([name]) => attempted.includes(name)).reverse()) {
        try { await save(snapshots.get(key)); }
        catch (error) { rollbackErrors.push(error); }
      }
      const error = fail("BACKUP_RESTORE_FAILED", "Restore failed; previously written files were rolled back where possible.");
      error.rollbackComplete = rollbackErrors.length === 0;
      error.cause = cause;
      throw error;
    }

    return {
      success: true,
      restored: Object.fromEntries(selected.map(([key]) => [key,
        Array.isArray(input[key]) ? input[key].length : Object.keys(input[key]).length
      ])),
    };
  }

  return { createBackup, restoreBackup };
}
