/**
 * HealthScorer.js — Backward Compatibility Adapter
 *
 * Delegates model health tracking to the central ProviderPool in core/runtime/.
 * Preserves all public API methods used by ModelSelector and IntentScorer.
 */
import { providerPool } from "../../core/runtime/ProviderPool.js";

export function recordModelSuccess(modelKey, latencyMs) {
  providerPool.recordSuccess(modelKey, latencyMs);
}

export function recordModelFailure(modelKey, providerError) {
  providerPool.recordFailure(modelKey, providerError);
}

export function getModelHealth(modelKey) {
  return providerPool.getState(modelKey);
}

export function getModelHealthScore(modelKey) {
  return providerPool.getHealthScore(modelKey);
}

export function isModelAvailable(modelKey) {
  return providerPool.isAvailable(modelKey);
}

export function getCooldownRemaining(modelKey) {
  return providerPool.getCooldownRemaining(modelKey);
}

export function resetModelHealth(modelKey) {
  providerPool.reset(modelKey);
}

export function resetAllModelHealth() {
  ["gemini", "groq", "deepseek", "qwen", "llama3", "claude-sonnet", "gpt4o", "ollama-llama"].forEach(key => providerPool.reset(key));
}

export function getAllModelHealthScores() {
  const keys = ["gemini", "groq", "deepseek", "qwen", "llama3", "claude-sonnet", "gpt4o", "ollama-llama"];
  const scores = {};
  for (const k of keys) {
    scores[k] = providerPool.getHealthScore(k);
  }
  return scores;
}
