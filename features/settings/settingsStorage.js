import fs from "fs/promises";
import { getStoragePath } from "../../storage/storagePath.js";

const SETTINGS_FILE = getStoragePath("settings.json");

/**
 * Default settings structure.
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
  enableSemanticMemoryRetrieval: true,
  
  // Voice settings
  enableVoice: false,
  pushToTalk: false,
  conversationMode: false,
  voiceSelection: "en-IN-NeerjaNeural",
  speechSpeed: "+0%",
  speechPitch: "+0Hz",
  speechVolume: "+0%",
  microphoneSelection: "default",
  speakerSelection: "default",
  language: "en",
  autoListenAfterResponse: false,
  conversationTimeout: 30
};

export async function loadSettings() {
  try {
    const data = await fs.readFile(SETTINGS_FILE, "utf-8");
    const parsed = JSON.parse(data);

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

export async function saveSettings(settings) {
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
    JSON.stringify(merged, null, 2)
  );
}
