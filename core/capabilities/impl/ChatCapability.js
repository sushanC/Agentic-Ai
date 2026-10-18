import { BaseCapability } from "../BaseCapability.js";
import { CapabilityResult } from "../CapabilityResult.js";
import { askAI, askAIStream } from "../../../services/ai.js";

/**
 * ChatCapability.js
 *
 * Handles general dialogue, explanations, Q&A, and conversational chat requests.
 */
export class ChatCapability extends BaseCapability {
  constructor({ generate = askAI, stream = askAIStream } = {}) {
    super("chat", "Chat & Dialogue Capability", 10);
    this.generate = generate;
    this.stream = stream;
  }

  canHandle(context) {
    if (context.toolContext === "chat") return 0.5;
    return 0.1; // Default fallback capability
  }

  async execute(context) {
    const answer = await this.generate(context.prompt, context.toolContext, {
      requestContext: context.requestContext,
      contextSnapshot: context.contextSnapshot,
    });
    return CapabilityResult.create({
      capability: this.name,
      tool: context.toolContext || "chat",
      answer,
      executedSteps: [{ name: "dialogue_generation", status: "completed" }],
    });
  }

  async executeStream(context, options = {}) {
    return this.stream(context.prompt, context.toolContext, {
      requestContext: context.requestContext,
      contextSnapshot: context.contextSnapshot,
      signal: options.signal,
    });
  }
}
