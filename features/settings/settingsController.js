import { getSettings, updateSettings } from "./settingsService.js";
import { logSafeError } from "../../services/httpSecurity.js";

export async function getSettingsController(req, res) {
  try {
    const settings = await getSettings();
    res.json(settings);
  } catch (err) {
    logSafeError("Settings retrieval failed", err);
    res.status(500).json({ error: "Failed to load settings" });
  }
}

export async function updateSettingsController(req, res) {
  try {
    const result = await updateSettings(req.body);
    res.json(result);
  } catch (err) {
    logSafeError("Settings update failed", err);
    res.status(500).json({ error: "Failed to save settings" });
  }
}
