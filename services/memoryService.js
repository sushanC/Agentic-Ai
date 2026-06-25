import {
  loadMemory,
  saveMemory
} from "../storage/memoryStorage.js";

import {
  extractMemory
} from "./ai.js";

import {
  normalizeMemory
} from "./memoryNormalizer.js";

import {
  incrementStat
} from "../storage/statsStorage.js";

/**
 * Merge old memory with newly extracted facts.
 *
 * Rules:
 * - Array + Array  → merged, deduplicated
 * - Array + String → append string to array, deduplicate
 * - String + Array → convert old to array, merge, deduplicate
 * - String + String → if same value keep it; if different, convert to array
 * - Missing key    → add the new key
 */
export function mergeMemory(
  oldMemory,
  newFacts
) {

  const merged = { ...oldMemory };

  for (
    const key of Object.keys(newFacts)
  ) {

    const oldValue = merged[key];
    const newValue = newFacts[key];

    // Both arrays — union
    if (
      Array.isArray(oldValue) &&
      Array.isArray(newValue)
    ) {
      merged[key] = [
        ...new Set([...oldValue, ...newValue])
      ];
      continue;
    }

    // Old is array, new is string — append
    if (
      Array.isArray(oldValue) &&
      typeof newValue === "string"
    ) {
      merged[key] = [
        ...new Set([...oldValue, newValue])
      ];
      continue;
    }

    // Old is string, new is array — convert old and union
    if (
      typeof oldValue === "string" &&
      Array.isArray(newValue)
    ) {
      merged[key] = [
        ...new Set([oldValue, ...newValue])
      ];
      continue;
    }

    // Both strings — keep if same, convert to array if different
    if (
      typeof oldValue === "string" &&
      typeof newValue === "string"
    ) {
      if (oldValue === newValue) {
        // No change needed
        continue;
      }
      // Values differ — build a history array
      merged[key] = [
        ...new Set([oldValue, newValue])
      ];
      continue;
    }

    // Key doesn't exist yet or value is
    // null/undefined — just assign
    merged[key] = newValue;
  }

  return merged;
}

export async function updateMemory(
  userMessage
) {

  let facts = {};

  try {

    facts = await extractMemory(
      userMessage
    );

  } catch (err) {

    console.log(
      "\n⚠️ Memory extraction skipped."
    );

    console.log(err.message);

    return;
  }

  if (Object.keys(facts).length === 0) {
    return;
  }

  const memory = await loadMemory();

  const merged = mergeMemory(
    memory,
    facts
  );

  const cleaned = normalizeMemory(merged);

  await saveMemory(cleaned);

  // Track stat
  await incrementStat("memory_updates");

  console.log("\n🧠 Memory Updated:");
  console.log(cleaned);
}