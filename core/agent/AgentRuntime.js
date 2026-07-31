import { developerEvents } from "../events/DeveloperEvents.js";
import { ContextAssembly } from "../context/ContextAssembly.js";
import { capabilityManager } from "../capabilities/CapabilityManager.js";
import { planActions } from "../planning/ActionPlanner.js";
import { executeActions } from "../execution/ActionExecutor.js";
import { toolRegistry } from "../registry/ToolRegistry.js";
import { featureRegistry } from "../registry/FeatureRegistry.js";

/**
 * AgentRuntime.js
 *
 * Primary entry point for Agent Core request execution.
 * Orchestrates request lifecycle: Context Assembly -> CapabilityManager -> Execution -> Diagnostics.
 * AgentRuntime communicates ONLY with CapabilityManager.
 */
export class AgentRuntime {
  constructor() {
    this.events = developerEvents;
    this.contextAssembly = ContextAssembly;
    this.capabilityManager = capabilityManager;
    this.toolRegistry = toolRegistry;
    this.featureRegistry = featureRegistry;
  }

  /**
   * Execute an incoming user request through the Capability Framework.
   *
   * @param {string} prompt - User request
   * @param {string} [toolContext="chat"] - Active tool context ("chat", "voice", etc.)
   * @returns {Promise<{capability: string, tool: string, answer: any, executedSteps?: Array}>}
   */
  async run(prompt, toolContext = "chat") {
    this.events.beginRequest();
    this.events.emitDevEvent("RuntimeStarted", { prompt, toolContext });

    try {
      const assembledContext = await this.contextAssembly.assembleContext(prompt, { toolContext });
      const result = await this.capabilityManager.executeRequest(prompt, toolContext, assembledContext);

      this.events.emitDevEvent("RuntimeFinished", {
        capability: result.capability,
        tool: result.tool,
        hasAnswer: !!result.answer
      });

      return result;

    } catch (err) {
      console.error("[AgentRuntime] Error executing request:", err);
      this.events.emitDevEvent("RuntimeError", { error: err.message });
      throw err;
    } finally {
      this.events.endRequest();
    }
  }

  /**
   * Create and execute a multi-step action plan directly.
   * @param {string} prompt
   * @returns {Promise<{actions: Array, results: Array}>}
   */
  async planAndExecute(prompt) {
    this.events.emitDevEvent("PlannerStarted", { prompt });
    const plan = await planActions(prompt);
    const results = await executeActions(plan);
    this.events.emitDevEvent("PlannerFinished", { planCount: plan.actions?.length || 0 });
    return { plan, results };
  }
}

// Global singleton instance
export const agentRuntime = new AgentRuntime();
