/**
 * voiceConfig.js
 *
 * Centralized configuration module for the Voice feature.
 * Stores all defaults, VAD thresholds, audio formats, timeouts, and fallback limits.
 * Single source of truth for configuration values across the voice pipeline.
 */

export const VOICE_CONFIG = Object.freeze({
  // STT & Audio Recording Defaults
  STT: Object.freeze({
    language: "en",
    silenceTimeout: 1.2,       // Duration of silence (seconds) to trigger end-of-speech
    maxRecordingTime: 15,      // Maximum recording duration (seconds)
    noiseTolerance: 300,       // Base RMS amplitude threshold for speech
    noSpeechTimeout: 5.0,      // Timeout (seconds) if no speech is detected at session start
    beamSize: 5,               // Whisper beam search size
    sampleRate: 16000,         // 16 kHz sample rate
    channels: 1,               // Mono channel
    audioType: "wav",          // WAV output
    minValidAudioBytes: 4044   // 44-byte WAV header + minimum PCM audio bytes (4000)
  }),

  // VAD Engine Parameters
  VAD: Object.freeze({
    wavHeaderLength: 44,       // Standard 44-byte RIFF WAV header
    wavHeaderTag: "RIFF",      // Header identifier
    maxAmbientChunks: 10,      // Maximum quiet chunks used for ambient noise floor calibration
    minDynamicThreshold: 300,  // Lower clamp bound for dynamic threshold
    maxDynamicThreshold: 600,  // Upper clamp bound for dynamic threshold
    ambientMultiplier: 1.5,    // Multiplier for ambient floor to compute raw threshold
    bytesPerSample: 2,         // 16-bit LE PCM (2 bytes per sample)
    bytesPerSecond: 32000      // 16000 Hz * 2 bytes = 32000 bytes/sec
  }),

  // TTS Synthesis Defaults
  TTS: Object.freeze({
    voiceSelection: "en-IN-NeerjaNeural",
    speechSpeed: "+0%",
    speechPitch: "+0Hz",
    speechVolume: "+0%"
  }),

  // Timeout & Recovery Limits
  TIMEOUTS: Object.freeze({
    conversationModeTimeout: 30, // Timeout (seconds) for continuous conversation silence
    errorRecoveryDelay: 3000,   // Delay (ms) before recovering state machine from error to idle
    tempFileCleanupDelay: 80     // Delay (ms) before verifying and transmitting temp audio file
  })
});
