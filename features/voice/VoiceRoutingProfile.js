/**
 * VoiceRoutingProfile.js
 *
 * Implements the Voice Routing Policy and Voice Latency Profile for Jarvis Voice System.
 *
 * Requirements:
 * Priority: Gemini Flash -> Groq Llama -> OpenRouter Nemotron -> Ollama
 *
 * Ollama condition rules:
 *   - Offline mode enabled
 *   - Internet is unavailable
 *   - Every cloud provider has failed
 *   - User explicitly forces Ollama
 *
 * Simple greetings (Hello, Hi, Good Morning, How are you, Thank You, Bye)
 * must NEVER use Ollama while cloud models are available.
 *
 * Voice Latency Profile prioritizes:
 *   - Lowest latency
 *   - Highest provider health
 *   - Fastest model
 *   - Lowest queue time
 */

import { getHealthScore as getProviderHealthScore, isAvailable as isProviderAvailable } from "../../services/cie/ProviderHealthManager.js";
import { getModelHealthScore } from "../../services/modelSelection/HealthScorer.js";

export const VOICE_PRIORITY_ORDER = [
  "gemini",        // Gemini Flash
  "groq",          // Groq Llama
  "openrouter",    // OpenRouter Nemotron / GPT-OSS
  "ollama"         // Local Ollama (last resort)
];

const GREETING_TEXTS = new Set([
  "hello", "hi", "hey", "good morning", "good afternoon",
  "good evening", "how are you", "thank you", "thanks", "bye", "goodbye",
  "yes", "no", "stop", "cancel", "continue"
]);

/**
 * Check if the text is a simple greeting or shortcut text.
 * @param {string} text
 * @returns {boolean}
 */
export function isSimpleGreeting(text) {
  if (!text) return false;
  const cleaned = text.toLowerCase().replace(/[^\w\s]/g, "").trim();
  return GREETING_TEXTS.has(cleaned);
}

/**
 * Check if Ollama is allowed for the given query & system state.
 * @param {object} options
 * @returns {boolean}
 */
export function shouldAllowOllama({
  offlineMode = false,
  internetAvailable = true,
  allCloudFailed = false,
  forcedOllama = false,
  text = ""
} = {}) {
  if (forcedOllama) return true;
  if (offlineMode || !internetAvailable) return true;

  // Simple greetings must NEVER use Ollama if cloud providers are available
  if (isSimpleGreeting(text) && !allCloudFailed) {
    return false;
  }

  return allCloudFailed;
}

/**
 * Rank candidate models for Voice Mode according to Voice Latency Profile.
 *
 * @param {Array<object>} candidates - List of CandidateModel objects
 * @param {object} options
 * @returns {Array<object>} Ranked candidates
 */
export function rankVoiceCandidates(candidates, options = {}) {
  const { text = "", offlineMode = false, internetAvailable = true, forcedOllama = false } = options;

  const cloudCandidates = candidates.filter(c => c.provider !== "ollama" && isProviderAvailable(c.provider));
  const allCloudFailed = cloudCandidates.length === 0;

  const allowOllama = shouldAllowOllama({
    offlineMode,
    internetAvailable,
    allCloudFailed,
    forcedOllama,
    text
  });

  return candidates
    .filter(candidate => {
      if (candidate.provider === "ollama") {
        return allowOllama;
      }
      return true;
    })
    .map(candidate => {
      let score = 100;

      const orderIndex = VOICE_PRIORITY_ORDER.indexOf(candidate.key) !== -1
        ? VOICE_PRIORITY_ORDER.indexOf(candidate.key)
        : VOICE_PRIORITY_ORDER.indexOf(candidate.provider);

      if (orderIndex !== -1) {
        score -= orderIndex * 20;
      } else {
        score -= 50;
      }

      const modelHealth = getModelHealthScore(candidate.key);
      const providerHealth = getProviderHealthScore(candidate.provider) ?? 1.0;

      score += (modelHealth * 15) + (providerHealth * 15);

      if (candidate.latencyTier === "very_fast" || candidate.latency === "very_fast") {
        score += 20;
      } else if (candidate.latencyTier === "fast" || candidate.latency === "fast") {
        score += 10;
      } else if (candidate.latencyTier === "slow" || candidate.latency === "slow") {
        score -= 25;
      }

      if (isSimpleGreeting(text) && candidate.provider !== "ollama") {
        score += 30;
      }

      return { candidate, voiceScore: Math.max(0, score) };
    })
    .sort((a, b) => b.voiceScore - a.voiceScore)
    .map(item => item.candidate);
}
