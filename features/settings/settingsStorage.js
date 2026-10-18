import { getStoragePath } from "../../storage/storagePath.js";
import { createJsonFileStore } from "../../storage/jsonFile.js";

const settingsFile = createJsonFileStore(getStoragePath("settings.json"), {
  fallbackValue: {},
  validate: value => value !== null && typeof value === "object" && !Array.isArray(value),
  mode: 0o600,
});

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
  const parsed = await settingsFile.read();
  return {
    ...DEFAULT_SETTINGS,
    ...parsed,
    capabilityRoutes: {
      ...DEFAULT_SETTINGS.capabilityRoutes,
      ...(parsed.capabilityRoutes || {})
    }
  };
}

export async function saveSettings(settings) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    throw new TypeError("Settings must be an object.");
  }
  return settingsFile.update(existing => ({
    ...DEFAULT_SETTINGS,
    ...existing,
    ...settings,
    capabilityRoutes: {
      ...(existing.capabilityRoutes || {}),
      ...(settings.capabilityRoutes || {})
    }
  }));
}

export async function replaceSettings(settings) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    throw new TypeError("Settings must be an object.");
  }
  return settingsFile.write(settings);
}
