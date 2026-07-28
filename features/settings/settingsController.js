import { getSettings, updateSettings } from "./settingsService.js";

export async function getSettingsController(req, res) {
  try {
    const settings = await getSettings();
    res.json(settings);
  } catch (err) {
    console.error("GET SETTINGS ERROR:", err);
    res.status(500).json({ error: "Failed to load settings" });
  }
}

export async function updateSettingsController(req, res) {
  try {
    const result = await updateSettings(req.body);
    res.json(result);
  } catch (err) {
    console.error("POST SETTINGS ERROR:", err);
    res.status(500).json({ error: "Failed to save settings" });
  }
}
