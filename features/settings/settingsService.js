import { loadSettings, saveSettings } from "./settingsStorage.js";

export async function getSettings() {
  return await loadSettings();
}

export async function updateSettings(newSettings) {
  await saveSettings(newSettings);
  return { success: true };
}
