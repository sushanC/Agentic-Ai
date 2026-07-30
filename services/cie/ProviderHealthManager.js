/**
 * ProviderHealthManager.js — Backward Compatibility Adapter
 *
 * Delegates provider health tracking to the central ProviderPool in core/runtime/.
 * Preserves all public functions and ProviderStatus enum.
 */
import { providerPool } from "../../core/runtime/ProviderPool.js";

export const ProviderStatus = Object.freeze({
  HEALTHY:      "healthy",
  BUSY:         "busy",
  RATE_LIMITED: "rate_limited",
  OFFLINE:      "offline",
  DISABLED:     "disabled",
});

export function recordSuccess(providerKey, latencyMs) {
  providerPool.recordSuccess(providerKey, latencyMs);
}

export function recordFailure(providerKey, providerError) {
  providerPool.recordFailure(providerKey, providerError);
}

export function getHealthScore(providerKey) {
  return providerPool.getHealthScore(providerKey);
}

export function isAvailable(providerKey) {
  return providerPool.isAvailable(providerKey);
}

export function getProviderHealth(providerKey) {
  return providerPool.getState(providerKey);
}

export function resetProviderHealth(providerKey) {
  providerPool.reset(providerKey);
}

export function resetAllHealth() {
  // Reset all standard providers
  ["google", "groq", "deepseek", "glm", "openrouter", "ollama"].forEach(key => providerPool.reset(key));
}
