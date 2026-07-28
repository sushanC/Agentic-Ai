import {
  loadMemory,
  saveMemory,
  deleteMemoryKey
} from "./memoryStorage.js";

import {
  extractMemory
} from "../../services/ai.js";

import {
  normalizeMemory
} from "./memoryNormalizer.js";

import {
  incrementStat
} from "../../storage/statsStorage.js";

import {
  saveProfile
} from "../../storage/profileStorage.js";

export { loadMemory, saveMemory, deleteMemoryKey };

export async function getMemoryFacts() {
  const memory = await loadMemory();

  return Object.entries(memory).map(([key, value]) => ({
    id: key,
    text: Array.isArray(value)
      ? value.join(", ")
      : String(value),
    category: key
  }));
}

/**
 * Merge old memory with newly extracted facts.
 */
export function mergeMemory(
  oldMemory,
  newFacts
) {
  const merged = { ...oldMemory };

  for (const key of Object.keys(newFacts)) {
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
        continue;
      }
      merged[key] = [
        ...new Set([oldValue, newValue])
      ];
      continue;
    }

    merged[key] = newValue;
  }

  return merged;
}

export async function updateMemory(
  userMessage
) {
  let facts = {};

  try {
    facts = await extractMemory(userMessage);
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

export async function handleMemory(
  userMessage,
  profile
) {
  // remember
  if (
    userMessage
      .toLowerCase()
      .startsWith("remember ")
  ) {
    const fact = userMessage.replace(
      /^remember /i,
      ""
    );

    const parts = fact.split("=");

    if (parts.length !== 2) {
      console.log(
        "\nUsage:\nremember key = value\n"
      );
      return true;
    }

    const key = parts[0].trim();
    const value = parts[1].trim();

    profile[key] = value;

    await saveProfile(profile);

    console.log(
      `\n🧠 Remembered ${key} = ${value}\n`
    );

    return true;
  }

  // what do you know about me
  if (
    userMessage.toLowerCase() ===
    "what do you know about me"
  ) {
    console.log("\n🧠 Profile:\n");
    console.log(
      JSON.stringify(profile, null, 2)
    );
    console.log();
    return true;
  }

  // what is my
  if (
    userMessage
      .toLowerCase()
      .startsWith("what is my ")
  ) {
    const key = userMessage
      .replace(/^what is my /i, "")
      .trim();

    if (profile[key]) {
      console.log(
        `\nAI: Your ${key} is ${profile[key]}\n`
      );
    } else {
      console.log(
        `\nAI: I don't know your ${key} yet.\n`
      );
    }

    return true;
  }

  return false;
}
