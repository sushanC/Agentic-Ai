import { developerEvents } from "../events/DeveloperEvents.js";
import { ContextAssembly } from "../context/ContextAssembly.js";
import { routeRequest } from "../routing/ToolRouter.js";
import { planActions } from "../planning/ActionPlanner.js";
import { executeActions } from "../execution/ActionExecutor.js";
import { toolRegistry } from "../registry/ToolRegistry.js";
import { featureRegistry } from "../registry/FeatureRegistry.js";

/**
 * AgentRuntime.js
 *
 * Primary entry point for Agent Core request execution.
 * Orchestrates request lifecycle: Context Assembly -> Routing/Planning -> Execution -> Diagnostics.
 */
export class AgentRuntime {
  constructor() {
    this.events = developerEvents;
    this.contextAssembly = ContextAssembly;
    this.toolRegistry = toolRegistry;
    this.featureRegistry = featureRegistry;
  }

  /**
   * Execute an incoming user request through the Agent Core pipeline.
   *
   * @param {string} prompt - User request
   * @param {string} [toolContext="chat"] - Active tool context ("chat", "voice", etc.)
   * @returns {Promise<{tool: string, answer: any, executedSteps?: Array}>}
   */
  async run(prompt, toolContext = "chat") {
    this.events.beginRequest();
    this.events.emitDevEvent("RuntimeStarted", { prompt, toolContext });

    try {
      const result = await routeRequest(prompt, toolContext);

      this.events.emitDevEvent("RuntimeFinished", {
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
