export { default as voiceRoutes } from "./voiceRoutes.js";
export { handleVoice } from "./voiceService.js";
export { postVoiceController } from "./voiceController.js";
export { voiceManager } from "./voiceManager.js";
export { listen, initSTT, shutdownSTT } from "./sttService.js";
export { generateTTS, speak } from "./ttsService.js";
export { getAudioDevices } from "./AudioDeviceManager.js";
export { perfMonitor } from "./VoicePerformanceMonitor.js";
export { voiceMetrics } from "./VoicePerformanceMetrics.js";
export { VoiceStateMachine } from "./VoiceStateMachine.js";
export { VoiceQueue } from "./VoiceQueue.js";
export { VoicePipelineOptimizer } from "./VoicePipelineOptimizer.js";
export { rankVoiceCandidates, shouldAllowOllama, isSimpleGreeting, VOICE_PRIORITY_ORDER } from "./VoiceRoutingProfile.js";
export { shouldExtractMemory, isShortcutQuery, getVoiceCieOptions } from "./VoiceLatencyOptimizer.js";

// Voice Architecture & Pipeline Modules
export { VOICE_CONFIG } from "./voiceConfig.js";
export { VadDetector } from "./VadDetector.js";
export { WhisperDaemonManager, whisperDaemonManager } from "./WhisperDaemon.js";
export { VoiceEventEmitter, voiceEvents } from "./VoiceEventEmitter.js";
export { VoiceResponseProcessor, voiceResponseProcessor } from "./VoiceResponseProcessor.js";
export { VOICE_SYSTEM_PROMPT } from "./voiceSystemPrompt.js";
export { sanitizeForVoice, containsMarkdown } from "./voiceResponseSanitizer.js";
export { preprocessForTTS, splitIntoSentences } from "./ttsSpeechPreprocessor.js";

export * as voiceService from "./voiceService.js";
export * as voiceController from "./voiceController.js";
export * as sttService from "./sttService.js";
export * as ttsService from "./ttsService.js";
