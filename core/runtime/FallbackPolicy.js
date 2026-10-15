/**
 * FallbackPolicy.js
 *
 * Canonical model fallback policy for samGPT.
 * Single source of truth for fallback ordering across all runtime execution pipelines.
 *
 * Canonical Fallback Chain:
 *   1. Primary selected model
 *   2. Groq (groq)
 *   3. Gemini (google / gemini)
 *   4. OpenRouter / GPT-OSS (openrouter / gpt-oss)
 *   5. Ollama Local (ollama) -- ALWAYS FINAL FALLBACK
 *   6. Graceful Error Response
 *
 * Rules:
 *   - Ollama is ALWAYS the final fallback candidate for model execution failures.
 *   - If primary model is Ollama, no cloud fallbacks are appended (Ollama is final).
 *   - If Ollama fails, candidate iteration stops. No circular fallback loop to Groq/Gemini.
 */

export const CANONICAL_PROVIDER_CHAIN = Object.freeze([
  "groq",
  "google",
  "openrouter",
  "ollama"
]);

export const CANONICAL_MODEL_CHAIN = Object.freeze([
  "groq",
  "gemini",
  "gpt-oss",
  "ollama"
]);

/**
 * Build a canonical ordered candidate list for a primary model config.
 *
 * @param {object} primaryModelConfig - Resolved primary model configuration
 * @param {Function} [resolveModelFn] - Optional function to resolve model keys to model configs
 * @returns {object[]} Ordered candidates array (primary first, ollama strictly last)
 */
export function buildCanonicalCandidateChain(primaryModelConfig, resolveModelFn = null) {
  if (!primaryModelConfig) return [];

  const primaryKey = (primaryModelConfig.name || primaryModelConfig.key || primaryModelConfig.provider || "").toLowerCase();
  const primaryProvider = (primaryModelConfig.provider || "").toLowerCase();

  const candidates = [primaryModelConfig];
  const seenKeys = new Set([primaryKey, primaryProvider]);

  // If primary model IS Ollama, Ollama is the only model — no cloud fallbacks
  if (primaryProvider === "ollama" || primaryKey === "ollama") {
    return candidates;
  }

  // Append remaining cloud models in canonical order
  for (const modelKey of CANONICAL_MODEL_CHAIN) {
    if (modelKey === "ollama") continue; // Ollama is reserved for strict final position

    if (resolveModelFn) {
      try {
        const model = resolveModelFn(modelKey);
        if (model && model.enabled && model.status !== "disabled") {
          const key = (model.name || model.key || model.provider).toLowerCase();
          const prov = (model.provider || "").toLowerCase();
          if (!seenKeys.has(key) && !seenKeys.has(prov)) {
            candidates.push(model);
            seenKeys.add(key);
            seenKeys.add(prov);
          }
        }
      } catch {
        // Skip unresolvable models
      }
    }
  }

  // Append Ollama Local strictly as the final candidate
  if (resolveModelFn && !seenKeys.has("ollama")) {
    try {
      const ollamaModel = resolveModelFn("ollama");
      if (ollamaModel && ollamaModel.enabled !== false) {
        candidates.push(ollamaModel);
        seenKeys.add("ollama");
      }
    } catch {
      // Skip if Ollama not resolvable
    }
  }

  return candidates;
}
