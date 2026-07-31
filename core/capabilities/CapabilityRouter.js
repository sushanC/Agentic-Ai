import { capabilityRegistry } from "./CapabilityRegistry.js";
import { capabilityDiagnostics } from "./CapabilityDiagnostics.js";

/**
 * CapabilityRouter.js
 *
 * Decides which Capability owns a user request.
 * Queries registered capabilities via CapabilityRegistry and ranks them based on `canHandle(context)` score.
 */
export class CapabilityRouter {
  constructor(registry = capabilityRegistry) {
    this.registry = registry;
  }

  /**
   * Evaluate all registered capabilities and select the highest scoring match.
   *
   * @param {import("./CapabilityContext.js").CapabilityContext} capabilityContext
   * @returns {import("./BaseCapability.js").BaseCapability} Selected capability
   */
  route(capabilityContext) {
    const capabilities = this.registry.getAll();
    let bestCapability = null;
    let highestScore = -1;

    for (const cap of capabilities) {
      try {
        const handleResult = cap.canHandle(capabilityContext);
        let score = 0;

        if (typeof handleResult === "number") {
          score = handleResult;
        } else if (handleResult === true) {
          score = cap.priority / 100;
        }

        if (score > highestScore && score > 0) {
          highestScore = score;
          bestCapability = cap;
        }
      } catch (err) {
        console.warn(`[CapabilityRouter] Error in canHandle for ${cap.name}:`, err.message);
      }
    }

    // Default to ChatCapability if no specific capability scored > 0
    if (!bestCapability) {
      bestCapability = this.registry.getCapability("chat");
      highestScore = 0.1;
    }

    capabilityDiagnostics.logSelection(bestCapability.name, highestScore, capabilityContext.prompt);
    return bestCapability;
  }
}

export const capabilityRouter = new CapabilityRouter();
