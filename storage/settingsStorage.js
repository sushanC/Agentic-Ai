// storage/settingsStorage.js

import fs from "fs/promises";
import { getStoragePath } from "./storagePath.js";

const SETTINGS_FILE =
  getStoragePath("settings.json");

/**
 * Default settings structure.
 * model: "auto" — use smart routing via the Model Registry.
 * capabilityRoutes: {} — per-capability model overrides set by the user in Settings.
 *   e.g. { "coding": "gemini", "writing": "groq" }
 */
const DEFAULT_SETTINGS = {
  model: "auto",
  capabilityRoutes: {},
  maxHistory: 10,
  maxMemoryKeys: 10,
  maxSummaryLength: 1000,
  contextCompression: true,
  tokenSafetyMargin: 0.1,
  enableSmartContext: true,
  enableSemanticMemoryRetrieval: true
};

export async function loadSettings() {

  try {

    const data =
      await fs.readFile(
        SETTINGS_FILE,
        "utf-8"
      );

    const parsed = JSON.parse(data);

    // Deep merge with defaults to ensure all keys are present
    // even if the settings file was written by an older version.
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      capabilityRoutes: {
        ...DEFAULT_SETTINGS.capabilityRoutes,
        ...(parsed.capabilityRoutes || {})
      }
    };

  } catch {

    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(
  settings
) {

  // Load existing settings and deep-merge so partial
  // saves (e.g. only capabilityRoutes) don't clobber other keys.
  let existing = { ...DEFAULT_SETTINGS };
  try {
    const data = await fs.readFile(SETTINGS_FILE, "utf-8");
    existing = JSON.parse(data);
  } catch {
    // First save — use defaults
  }

  const merged = {
    ...existing,
    ...settings,
    capabilityRoutes: {
      ...(existing.capabilityRoutes || {}),
      ...(settings.capabilityRoutes || {})
    }
  };

  await fs.writeFile(
    SETTINGS_FILE,
    JSON.stringify(
      merged,
      null,
      2
    )
  );
}