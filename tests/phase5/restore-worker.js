import fs from "node:fs/promises";
import path from "node:path";
import { createBackupService } from "../../services/backupService.js";
import { readJsonFile, writeJsonFile, createJsonFileStore } from "../../storage/jsonFile.js";
import { createPendingActionsStorage } from "../../storage/pendingActionsStorage.js";

const [mode, root] = process.argv.slice(2);
const journalDirectory = path.join(root, "journal");
const tasksFile = path.join(root, "tasks.json");
const notesFile = path.join(root, "notes.json");
const tasksStore = createJsonFileStore(tasksFile, { fallbackValue: [], validate: Array.isArray });
const notesStore = createJsonFileStore(notesFile, { fallbackValue: [], validate: Array.isArray });

const storage = {
  loadTasks: () => tasksStore.read(),
  saveTasks: value => tasksStore.write(value),
  loadNotes: () => notesStore.read(),
  saveNotes: async value => {
    await notesStore.write(value);
    if (mode === "crash-on-restore-notes" && value?.[0]?.id === 22) process.exit(73);
    if (mode === "recover-crash" && value?.[0]?.id === 2) process.exit(74);
  },
  loadMemory: async () => ({}), replaceMemory: async () => {},
  loadHistory: async () => [], saveHistory: async () => {},
  loadSettings: async () => ({}), saveSettings: async () => {},
  loadStats: async () => ({}), saveStats: async () => {},
};
const service = createBackupService(storage, { journalDirectory });

if (mode === "restore" || mode === "crash-on-restore-notes") await service.restoreBackup({ version: "1.0", tasks: [{ id: 11 }], notes: [{ id: 22 }] });
else if (mode === "recover") await service.recoverPendingRestore();
else if (mode === "recover-crash") await service.recoverPendingRestore();
else if (mode === "stage-only") {
  await fs.mkdir(journalDirectory, { recursive: true, mode: 0o700 });
  await writeJsonFile(path.join(journalDirectory, "staged-tasks.json"), [{ id: 11 }], { mode: 0o600 });
  process.exit(75);
} else if (mode === "increment") {
  const counter = createJsonFileStore(path.join(root, "counter.json"), { fallbackValue: { count: 0 }, validate: x => Number.isInteger(x?.count) });
  for (let i = 0; i < 40; i++) await counter.update(async x => {
    await new Promise(resolve => setTimeout(resolve, 1));
    return { count: x.count + 1 };
  });
} else if (mode === "noop") {
  const data = await readJsonFile(tasksFile, []);
  if (!Array.isArray(data)) process.exit(2);
} else if (mode === "hold-claim") {
  const pending = createPendingActionsStorage(path.join(root, "pending.json"));
  const result = await pending.claimPendingAction("held-action");
  if (result.status !== "claimed") process.exit(3);
  process.stdout.write("claimed\n");
  process.stdin.resume();
}
