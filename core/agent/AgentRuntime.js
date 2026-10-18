import { developerEvents } from "../events/DeveloperEvents.js";
import { ContextAssembly } from "../context/ContextAssembly.js";
import { capabilityManager } from "../capabilities/CapabilityManager.js";
import { planActions } from "../planning/ActionPlanner.js";
import { executeActions } from "../execution/ActionExecutor.js";
import { toolRegistry } from "../registry/ToolRegistry.js";
import { featureRegistry } from "../registry/FeatureRegistry.js";
import { CapabilityContext } from "../capabilities/CapabilityContext.js";
import { workflowPlanner } from "../workflow/WorkflowPlanner.js";
import { createRequestContext, getCurrentRequestContext, runWithRequestContext } from "../request/RequestContext.js";

/**
 * AgentRuntime.js
 *
 * Primary entry point for Agent Core request execution.
 * Orchestrates request lifecycle: Context Assembly -> CapabilityManager -> Execution -> Diagnostics.
 * AgentRuntime communicates ONLY with CapabilityManager.
 */
export class AgentRuntime {
  constructor({ events = developerEvents, contextAssembly = new ContextAssembly(), capabilityManager: manager = capabilityManager, planner = workflowPlanner } = {}) {
    this.events = events;
    this.contextAssembly = contextAssembly;
    this.capabilityManager = manager;
    this.workflowPlanner = planner;
    this.toolRegistry = toolRegistry;
    this.featureRegistry = featureRegistry;
  }

  /**
   * Execute an incoming user request through the Capability Framework.
   *
   * @param {string} prompt - User request
   * @param {string} [toolContext="chat"] - Active tool context ("chat", "voice", etc.)
   * @param {object} [options] - Optional request context and preassembled context
   * @returns {Promise<{capability: string, tool: string, answer: any, executedSteps?: Array}>}
   */
  async run(prompt, toolContext = "chat", options = {}) {
    const requestContext = createRequestContext(
      options.requestContext?.requestId || getCurrentRequestContext()?.requestId
    );
    return runWithRequestContext(requestContext, async () => {
      this.events.beginRequest(requestContext.requestId);
      this.events.emitDevEvent("RuntimeStarted", { promptLength: String(prompt || "").length, toolContext, requestId: requestContext.requestId });
      try {
        const graph = this._plan(prompt, toolContext);
        const capabilities = this._graphCapabilities(graph);
        const assembledContext = await this._assemble(prompt, toolContext, capabilities, requestContext, options);
        const result = await this.capabilityManager.executeRequest(prompt, toolContext, assembledContext, requestContext);
        this.events.emitDevEvent("RuntimeFinished", {
          capability: result?.capability || "unknown",
          tool: result?.tool || "unknown",
          hasAnswer: result?.answer !== undefined && result?.answer !== null,
          requestId: requestContext.requestId,
        });
        return result;
      } catch (err) {
        this.events.emitDevEvent("RuntimeError", { errorCode: err?.code || "INTERNAL_ERROR", requestId: requestContext.requestId });
        throw err;
      } finally {
        this.events.endRequest(requestContext.requestId);
      }
    });
  }

  /** Execute chat as a text stream while retaining the regular capability route for tools. */
  async runStream(prompt, toolContext = "chat", options = {}) {
    const requestContext = createRequestContext(
      options.requestContext?.requestId || getCurrentRequestContext()?.requestId
    );
    return runWithRequestContext(requestContext, async () => {
      const graph = this._plan(prompt, toolContext);
      const capabilities = this._graphCapabilities(graph);
      const chatOnly = capabilities.length === 1 && capabilities[0] === "chat";
      if (chatOnly && options.beforeContext) await options.beforeContext();
      const assembledContext = await this._assemble(prompt, toolContext, capabilities, requestContext, options);

      if (chatOnly) {
        const chat = this.capabilityManager.registry?.getCapability("chat");
        if (typeof chat?.executeStream === "function") {
          const capabilityContext = this._buildContext(prompt, toolContext, assembledContext, requestContext);
          const streamResult = await chat.executeStream(capabilityContext, { signal: options.signal });
          return { type: "chat_stream", ...streamResult, requestContext };
        }
      }

      const result = await this.capabilityManager.executeRequest(prompt, toolContext, assembledContext, requestContext);
      return { type: "result", result, requestContext };
    });
  }

  _plan(prompt, toolContext) {
    return this.workflowPlanner.plan(new CapabilityContext({ prompt, toolContext }));
  }

  _graphCapabilities(graph) {
    return [...new Set(graph.getAllNodes().map(node => node.requiredCapability).filter(Boolean))];
  }

  _buildContext(prompt, toolContext, assembledContext, requestContext) {
    return new CapabilityContext({
      prompt,
      toolContext,
      semanticMemory: assembledContext.memory || {},
      history: assembledContext.history || [],
      summary: assembledContext.summary || "",
      pdfMemory: assembledContext.pdfMemory || {},
      userPreferences: assembledContext.userPreferences || {},
      requestContext,
      contextSnapshot: assembledContext,
    });
  }

  async _assemble(prompt, toolContext, capabilities, requestContext, options) {
    if (options.assembledContext) return options.assembledContext;
    return this.contextAssembly.assembleContext(prompt, {
      toolContext,
      capabilities,
      requestContext,
      settings: options.settings,
    });
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
