import { capabilityRegistry } from "../capabilities/CapabilityRegistry.js";
import { WorkflowContext }    from "./WorkflowContext.js";
import { WorkflowResult, WorkflowValidationError } from "./WorkflowResult.js";
import { WorkflowPlanner, workflowPlanner }        from "./WorkflowPlanner.js";
import { WorkflowExecutor }                        from "./WorkflowExecutor.js";
import { WorkflowValidator, workflowValidator }    from "./WorkflowValidator.js";
import { workflowDiagnostics }                     from "./WorkflowDiagnostics.js";

/**
 * WorkflowEngine.js
 *
 * Top-level orchestrator for the Workflow subsystem.
 * CapabilityManager delegates all request execution to WorkflowEngine.execute().
 *
 * Responsibilities (and only these):
 *   1. Receive a CapabilityContext from CapabilityManager
 *   2. Ask WorkflowPlanner to produce a WorkflowGraph
 *   3. Ask WorkflowValidator to validate the graph
 *   4. Build a WorkflowContext from the CapabilityContext
 *   5. Ask WorkflowExecutor to walk the graph
 *   6. Return a WorkflowResult to CapabilityManager
 *
 * WorkflowEngine does NOT:
 *   - Know how individual capabilities work
 *   - Call AI models directly
 *   - Contain business logic
 *   - Manage tool state
 */
export class WorkflowEngine {
  /**
   * @param {object} [deps] - Injectable dependencies (for testing / extension)
   * @param {WorkflowPlanner}   [deps.planner]
   * @param {WorkflowValidator} [deps.validator]
   * @param {WorkflowExecutor}  [deps.executor]
   */
  constructor({
    planner   = workflowPlanner,
    validator = workflowValidator,
    executor  = new WorkflowExecutor(capabilityRegistry),
  } = {}) {
    this._planner   = planner;
    this._validator = validator;
    this._executor  = executor;
    this._counter   = 0;
  }

  /**
   * Execute a request through the Workflow Engine.
   *
   * @param {import("../capabilities/CapabilityContext.js").CapabilityContext} capabilityContext
   * @returns {Promise<object>} WorkflowResult (CapabilityResult-compatible shape)
   */
  async execute(capabilityContext) {
    const workflowId = `wf-${Date.now()}-${++this._counter}`;
    workflowDiagnostics.logStarted(workflowId, capabilityContext.prompt);

    try {
      // Step 1 — Planning: CapabilityContext → WorkflowGraph
      const graph       = this._planner.plan(capabilityContext);
      const isMultiNode = graph.size > 1;
      workflowDiagnostics.logPlanned(workflowId, graph.size, isMultiNode);

      // Step 2 — Validation: structural and capability checks
      this._validator.validate(graph, capabilityRegistry);
      workflowDiagnostics.logValidated(workflowId);

      // Step 3 — Build shared WorkflowContext from CapabilityContext
      const workflowContext = new WorkflowContext({
        prompt:          capabilityContext.prompt,
        toolContext:     capabilityContext.toolContext,
        semanticMemory:  capabilityContext.semanticMemory,
        history:         capabilityContext.history,
        summary:         capabilityContext.summary,
        pdfMemory:       capabilityContext.pdfMemory,
        runtimeState:    capabilityContext.runtimeState,
        userPreferences: capabilityContext.userPreferences,
      });

      // Step 4 — Execution: walk graph, invoke capabilities, propagate context
      const result = await this._executor.execute(workflowId, graph, workflowContext);

      workflowDiagnostics.logFinished(
        workflowId,
        result.success,
        result.executionTimeMs,
        result.completedNodes.length,
        result.failedNodes.length,
      );

      return result;

    } catch (err) {
      workflowDiagnostics.logError(workflowId, err);

      // Re-throw WorkflowValidationError as-is (caller should surface it clearly)
      if (err instanceof WorkflowValidationError) throw err;

      // For unexpected errors, wrap in a failed WorkflowResult rather than crashing
      return WorkflowResult.create({
        success:     false,
        workflowId,
        answer:      null,
        diagnostics: { error: err.message },
      });
    }
  }
}

export const workflowEngine = new WorkflowEngine();