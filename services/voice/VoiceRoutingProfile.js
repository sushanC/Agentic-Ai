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

import { getHealthScore as getProviderHealthScore, isAvailable as isProviderAvailable } from "../cie/ProviderHealthManager.js";
import { getModelHealthScore } from "../modelSelection/HealthScorer.js";

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
 * @param {boolean} [options.offlineMode=false]
 * @param {boolean} [options.internetAvailable=true]
 * @param {boolean} [options.allCloudFailed=false]
 * @param {boolean} [options.forcedOllama=false]
 * @param {string}  [options.text=""]
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
 * Scoring factors:
 *   - Base priority rank (Gemini Flash > Groq > OpenRouter > Ollama)
 *   - Provider health score
 *   - Model health score
 *   - Latency tier bonus
 *
 * @param {Array<object>} candidates - List of CandidateModel objects
 * @param {object} options
 * @returns {Array<object>} Ranked candidates
 */
export function rankVoiceCandidates(candidates, options = {}) {
  const { text = "", offlineMode = false, internetAvailable = true, forcedOllama = false } = options;

  // Determine if cloud providers are online/available
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
      return true; // Keep cloud candidates
    })
    .map(candidate => {
      let score = 100;

      // 1. Voice Priority Order penalty/bonus
      const orderIndex = VOICE_PRIORITY_ORDER.indexOf(candidate.key) !== -1
        ? VOICE_PRIORITY_ORDER.indexOf(candidate.key)
        : VOICE_PRIORITY_ORDER.indexOf(candidate.provider);

      if (orderIndex !== -1) {
        score -= orderIndex * 20; // 0 penalty for Gemini, 20 for Groq, 40 for OpenRouter, 60 for Ollama
      } else {
        score -= 50;
      }

      // 2. Health score multiplier (0.0 - 1.0)
      const modelHealth = getModelHealthScore(candidate.key);
      const providerHealth = getProviderHealthScore(candidate.provider) ?? 1.0;
      
      score += (modelHealth * 15) + (providerHealth * 15);

      // 3. Latency tier bonus for Voice (fastest response wins)
      if (candidate.latencyTier === "very_fast" || candidate.latency === "very_fast") {
        score += 20;
      } else if (candidate.latencyTier === "fast" || candidate.latency === "fast") {
        score += 10;
      } else if (candidate.latencyTier === "slow" || candidate.latency === "slow") {
        score -= 25;
      }

      // 4. Force cloud over Ollama for simple greetings if cloud is active
      if (isSimpleGreeting(text) && candidate.provider !== "ollama") {
        score += 30;
      }

      return { candidate, voiceScore: Math.max(0, score) };
    })
    .sort((a, b) => b.voiceScore - a.voiceScore)
    .map(item => item.candidate);
}
