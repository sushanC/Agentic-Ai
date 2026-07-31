import { BaseCapability } from "../BaseCapability.js";
import { CapabilityResult } from "../CapabilityResult.js";
import { memoryManager, loadMemory, deleteMemoryKey } from "../../../features/memory/index.js";

/**
 * MemoryCapability.js
 *
 * Handles memory operations: remember, forget, memory retrieval, and profile inspection.
 */
export class MemoryCapability extends BaseCapability {
  constructor() {
    super("memory", "Cognitive Memory Capability", 90);
  }

  canHandle(context) {
    if (context.startsWithAny("remember", "forget ", "show memory", "what is my ", "what do you know about me")) {
      return 0.95;
    }
    return 0.0;
  }

  async execute(context) {
    const text = context.promptLower;

    if (text === "show memory") {
      const memory = await loadMemory();
      return CapabilityResult.create({
        capability: this.name,
        tool: "memory",
        answer: JSON.stringify(memory, null, 2),
        executedSteps: [{ name: "memory_lookup", status: "completed" }],
      });
    }

    if (text.startsWith("remember")) {
      const memoryText = context.prompt.replace(/^remember/i, "").trim();
      await memoryManager.update(memoryText);
      return CapabilityResult.create({
        capability: this.name,
        tool: "memory",
        answer: `🧠 Memory updated: ${memoryText}`,
        executedSteps: [{ name: "memory_update", status: "completed" }],
      });
    }

    if (text.startsWith("forget ")) {
      const key = context.prompt.replace(/^forget/i, "").trim();
      await deleteMemoryKey(key);
      return CapabilityResult.create({
        capability: this.name,
        tool: "memory",
        answer: `🧠 Forgot: ${key}`,
        executedSteps: [{ name: "memory_delete", status: "completed" }],
      });
    }

    if (text.startsWith("what is my ") || text === "what do you know about me") {
      const profile = await memoryManager.getLegacyProfile();
      if (text === "what do you know about me") {
        return CapabilityResult.create({
          capability: this.name,
          tool: "memory",
          answer: JSON.stringify(profile, null, 2),
          executedSteps: [{ name: "profile_lookup", status: "completed" }],
        });
      }

      const key = context.prompt.replace(/^what is my /i, "").trim();
      const val = profile[key];
      const answer = val ? `Your ${key} is ${val}` : `I don't know your ${key} yet.`;

      return CapabilityResult.create({
        capability: this.name,
        tool: "memory",
        answer,
        executedSteps: [{ name: "memory_lookup", status: "completed" }],
      });
    }

    const payload = await memoryManager.retrieve(context.prompt);
    return CapabilityResult.create({
      capability: this.name,
      tool: "memory",
      answer: JSON.stringify(payload, null, 2),
      executedSteps: [{ name: "cognitive_memory_retrieve", status: "completed" }],
    });
  }
}
