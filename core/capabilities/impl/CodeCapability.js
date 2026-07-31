import { BaseCapability } from "../BaseCapability.js";
import { CapabilityResult } from "../CapabilityResult.js";
import { askAI } from "../../../services/ai.js";

/**
 * CodeCapability.js
 *
 * Handles code explanation, refactoring, debugging, and generation.
 */
export class CodeCapability extends BaseCapability {
  constructor() {
    super("code", "Code Assistance Capability", 80);
  }

  canHandle(context) {
    if (context.includesAny("write code", "explain code", "debug code", "refactor code", "code snippet", "function in", "class in")) {
      return 0.85;
    }
    return 0.0;
  }

  async execute(context) {
    const answer = await askAI(context.prompt, "chat");
    return CapabilityResult.create({
      capability: this.name,
      tool: "code",
      answer,
      executedSteps: [{ name: "code_assistance", status: "completed" }],
    });
  }
}
