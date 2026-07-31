import { memoryManager } from "./MemoryManager.js";
import { normalizeMemory } from "./memoryNormalizer.js";
import { incrementStat } from "../../storage/statsStorage.js";

export async function loadMemory() {
  return await memoryManager.getLegacyProfile();
}

export async function saveMemory(memory) {
  for (const [key, value] of Object.entries(memory)) {
    await memoryManager.store({ content: { key, value } }, { storeName: "semantic" });
  }
}

export async function deleteMemoryKey(key) {
  await memoryManager.delete(key, "semantic");
}

export async function getMemoryFacts() {
  const memory = await loadMemory();
  return Object.entries(memory).map(([key, value]) => ({
    id: key,
    text: Array.isArray(value) ? value.join(", ") : String(value),
    category: key
  }));
}

/**
 * Merge old memory with newly extracted facts.
 */
export function mergeMemory(oldMemory, newFacts) {
  const merged = { ...oldMemory };

  for (const key of Object.keys(newFacts)) {
    const oldValue = merged[key];
    const newValue = newFacts[key];

    if (Array.isArray(oldValue) && Array.isArray(newValue)) {
      merged[key] = [...new Set([...oldValue, ...newValue])];
      continue;
    }

    if (Array.isArray(oldValue) && typeof newValue === "string") {
      merged[key] = [...new Set([...oldValue, newValue])];
      continue;
    }

    if (typeof oldValue === "string" && Array.isArray(newValue)) {
      merged[key] = [...new Set([oldValue, ...newValue])];
      continue;
    }

    if (typeof oldValue === "string" && typeof newValue === "string") {
      if (oldValue === newValue) continue;
      merged[key] = [...new Set([oldValue, newValue])];
      continue;
    }

    merged[key] = newValue;
  }

  return merged;
}

export async function updateMemory(userMessage) {
  await memoryManager.update(userMessage);
  await incrementStat("memory_updates");
}

export async function handleMemory(userMessage, profile) {
  // remember
  if (userMessage.toLowerCase().startsWith("remember ")) {
    const fact = userMessage.replace(/^remember /i, "");
    const parts = fact.split("=");

    if (parts.length !== 2) {
      console.log("\nUsage:\nremember key = value\n");
      return true;
    }

    const key = parts[0].trim();
    const value = parts[1].trim();

    await memoryManager.store({ content: { key, value } }, { storeName: "semantic", isExplicitRemember: true });
    if (profile) profile[key] = value;

    console.log(`\n🧠 Remembered ${key} = ${value}\n`);
    return true;
  }

  // what do you know about me
  if (userMessage.toLowerCase() === "what do you know about me") {
    const currentProfile = await memoryManager.getLegacyProfile();
    console.log("\n🧠 Profile:\n");
    console.log(JSON.stringify(currentProfile, null, 2));
    console.log();
    return true;
  }

  // what is my
  if (userMessage.toLowerCase().startsWith("what is my ")) {
    const key = userMessage.replace(/^what is my /i, "").trim();
    const currentProfile = await memoryManager.getLegacyProfile();

    if (currentProfile[key]) {
      console.log(`\nAI: Your ${key} is ${currentProfile[key]}\n`);
    } else {
      console.log(`\nAI: I don't know your ${key} yet.\n`);
    }

    return true;
  }

  return false;
}
