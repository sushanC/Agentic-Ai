/** Central voice configuration and validated endpointing defaults. */
export const VOICE_CONFIG = Object.freeze({
  STT: Object.freeze({
    language: "en",
    silenceTimeout: 1.2,
    maxRecordingTime: 15,
    noiseTolerance: 300,
    noSpeechTimeout: 5,
    noiseMultiplier: 2,
    continuationThresholdRatio: 0.65,
    frameDurationMs: 20,
    noiseCalibrationMs: 200,
    preRollMs: 300,
    minimumSpeechMs: 80,
    vadFallbackCaptureMs: 5000,
    minimumSpeechRms: 120,
    beamSize: 5,
    sampleRate: 16000,
    channels: 1,
    audioType: "wav",
    minValidAudioBytes: 4044,
  }),
  VAD: Object.freeze({
    wavHeaderTag: "RIFF",
    maxHeaderBytes: 4096,
    maxAmbientFrames: 50,
    maxDynamicThreshold: 6000,
    bytesPerSample: 2,
  }),
  TTS: Object.freeze({
    greeting: "SamGPT online. I'm listening. How can I help you?",
    voiceSelection: "en-IN-NeerjaNeural",
    speechSpeed: "+0%",
    speechPitch: "+0Hz",
    speechVolume: "+0%",
  }),
  TIMEOUTS: Object.freeze({
    conversationModeTimeout: 30,
    errorRecoveryDelay: 3000,
  }),
});

const clampNumber = (value, fallback, minimum, maximum) => {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(maximum, Math.max(minimum, number))
    : fallback;
};

/** Normalize legacy settings and clamp endpointing values to safe bounds. */
export function resolveSTTOptions(settings = {}) {
  const defaults = VOICE_CONFIG.STT;
  const maxRecordingTime = clampNumber(settings.maxRecordingTime, defaults.maxRecordingTime, 1, 30);
  return Object.freeze({
    language: typeof settings.language === "string" && settings.language.length <= 16
      ? settings.language
      : defaults.language,
    silenceTimeout: clampNumber(settings.silenceTimeout, defaults.silenceTimeout, 0.3, 3),
    maxRecordingTime,
    noiseTolerance: clampNumber(settings.noiseTolerance, defaults.noiseTolerance, 80, 6000),
    noSpeechTimeout: clampNumber(settings.noSpeechTimeout, defaults.noSpeechTimeout, 0.5, maxRecordingTime),
    noiseMultiplier: clampNumber(settings.noiseMultiplier, defaults.noiseMultiplier, 1.2, 8),
    continuationThresholdRatio: clampNumber(
      settings.continuationThresholdRatio,
      defaults.continuationThresholdRatio,
      0.3,
      0.95,
    ),
    frameDurationMs: defaults.frameDurationMs,
    noiseCalibrationMs: defaults.noiseCalibrationMs,
    preRollMs: clampNumber(settings.preRollMs, defaults.preRollMs, 0, 1000),
    minimumSpeechMs: clampNumber(settings.minimumSpeechMs, defaults.minimumSpeechMs, 40, 500),
    vadFallbackCaptureMs: clampNumber(
      settings.vadFallbackCaptureMs,
      defaults.vadFallbackCaptureMs,
      500,
      maxRecordingTime * 1000,
    ),
    minimumSpeechRms: defaults.minimumSpeechRms,
    beamSize: clampNumber(settings.beamSize, defaults.beamSize, 1, 10),
    sampleRate: defaults.sampleRate,
    channels: defaults.channels,
    audioType: defaults.audioType,
    minValidAudioBytes: defaults.minValidAudioBytes,
  });
}
