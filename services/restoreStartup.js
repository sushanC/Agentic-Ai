import { createBackupService } from "./backupService.js";
import { loadTasks, saveTasks } from "../features/tasks/taskStorage.js";
import { loadNotes, saveNotes } from "../features/notes/noteStorage.js";
import { loadMemory, replaceMemory } from "../features/memory/index.js";
import { loadHistory, saveHistory } from "../storage/historyStorage.js";
import { loadSettings, saveSettings, replaceSettings } from "../features/settings/settingsStorage.js";
import { loadStats, saveStats } from "../storage/statsStorage.js";

const recoveryService = createBackupService({
  loadTasks, saveTasks, loadNotes, saveNotes, loadMemory, replaceMemory,
  loadHistory, saveHistory, loadSettings, saveSettings, replaceSettings, loadStats, saveStats,
});

export const recoverPendingRestore = () => recoveryService.recoverPendingRestore();
