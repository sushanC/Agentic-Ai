import { BaseCapability } from "../BaseCapability.js";
import { CapabilityResult } from "../CapabilityResult.js";
import { askAI } from "../../../services/ai.js";

/**
 * ChatCapability.js
 *
 * Handles general dialogue, explanations, Q&A, and conversational chat requests.
 */
export class ChatCapability extends BaseCapability {
  constructor() {
    super("chat", "Chat & Dialogue Capability", 10);
  }

  canHandle(context) {
    if (context.toolContext === "chat") return 0.5;
    return 0.1; // Default fallback capability
  }

  async execute(context) {
    const answer = await askAI(context.prompt, context.toolContext);
    return CapabilityResult.create({
      capability: this.name,
      tool: context.toolContext || "chat",
      answer,
      executedSteps: [{ name: "dialogue_generation", status: "completed" }],
    });
  }
}
