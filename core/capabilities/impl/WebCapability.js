import { BaseCapability } from "../BaseCapability.js";
import { CapabilityResult } from "../CapabilityResult.js";
import { handleWeb } from "../../../handlers/webHandler.js";

/**
 * WebCapability.js
 *
 * Handles live web search, current news, weather, and web lookups.
 */
export class WebCapability extends BaseCapability {
  constructor() {
    super("web", "Web Search Capability", 78);
  }

  canHandle(context) {
    if (context.includesAny("latest", "news", "today", "current", "weather", "web search")) {
      return 0.85;
    }
    return 0.0;
  }

  async execute(context) {
    const answer = await handleWeb(`web search ${context.prompt}`);
    return CapabilityResult.create({
      capability: this.name,
      tool: "web",
      answer,
      executedSteps: [{ name: "web_search", status: "completed" }],
    });
  }
}
