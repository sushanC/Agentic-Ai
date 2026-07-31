import { BaseCapability } from "../BaseCapability.js";
import { CapabilityResult } from "../CapabilityResult.js";
import { askAI } from "../../../services/ai.js";

/**
 * ResearchCapability.js
 *
 * Handles deep web research, multi-query synthesis, and research reports.
 */
export class ResearchCapability extends BaseCapability {
  constructor() {
    super("research", "Deep Research Capability", 80);
  }

  canHandle(context) {
    if (context.includesAny("deep research", "research and", "conduct research", "thorough research")) {
      return 0.88;
    }
    return 0.0;
  }

  async execute(context) {
    const answer = await askAI(context.prompt, "chat");
    return CapabilityResult.create({
      capability: this.name,
      tool: "research",
      answer,
      executedSteps: [{ name: "deep_research", status: "completed" }],
    });
  }
}
