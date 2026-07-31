import { BaseCapability } from "../BaseCapability.js";
import { CapabilityResult } from "../CapabilityResult.js";
import { planActions } from "../../planning/ActionPlanner.js";
import { executeActions } from "../../execution/ActionExecutor.js";
import { isDesktopRequest } from "../../routing/ToolRouter.js";

/**
 * DesktopCapability.js
 *
 * Handles desktop automation, launching applications, file management,
 * system info, screenshots, and clipboard operations.
 */
export class DesktopCapability extends BaseCapability {
  constructor() {
    super("desktop", "Desktop Automation Capability", 88);
  }

  canHandle(context) {
    if (isDesktopRequest(context.promptLower)) {
      return 0.92;
    }
    return 0.0;
  }

  async execute(context) {
    const plan = await planActions(context.prompt);
    const results = await executeActions(plan);

    // Handle confirmation / input waiting interrupts
    if (results.length > 0 && results[0] !== null && typeof results[0] === "object") {
      if (results[0].status === "pending_confirmation") {
        return CapabilityResult.create({
          capability: this.name,
          tool: "confirmation",
          answer: results[0],
          executedSteps: [{ name: "planning", status: "completed" }],
        });
      }

      if (results[0].status === "waiting_input") {
        return CapabilityResult.create({
          capability: this.name,
          tool: "waiting_input",
          answer: results[0],
          executedSteps: [{ name: "planning", status: "completed" }],
        });
      }
    }

    return CapabilityResult.create({
      capability: this.name,
      tool: "desktop",
      answer: results.join("\n"),
      executedSteps: [{ name: "planning", status: "completed" }],
    });
  }
}
