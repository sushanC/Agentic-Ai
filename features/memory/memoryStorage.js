/**
 * memoryStorage.js — Backward Compatibility Adapter
 *
 * Delegates memory file operations to the central MemoryManager.
 */
import { memoryManager } from "./MemoryManager.js";

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
