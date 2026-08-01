/**
 * WorkflowResult.js
 *
 * Standardised output contract for a completed WorkflowEngine execution.
 * Wraps the aggregate outcomes of all nodes into a consistent payload
 * that CapabilityManager can forward to its callers in the same shape
 * as a plain CapabilityResult.
 */
export class WorkflowResult {
  /**
   * Create a WorkflowResult.
   *
   * @param {object} params
   * @param {boolean}  [params.success=true]          - Whether the overall workflow succeeded
   * @param {string}   [params.workflowId]            - Identifier of the workflow execution
   * @param {object[]} [params.completedNodes=[]]     - Serialised completed node snapshots
   * @param {object[]} [params.failedNodes=[]]        - Serialised failed node snapshots
   * @param {object[]} [params.skippedNodes=[]]       - Serialised skipped node snapshots
   * @param {object}   [params.outputs={}]            - All node outputs keyed by nodeId
   * @param {any}      [params.answer]                - Final answer (output of the terminal node)
   * @param {string}   [params.capability]            - Capability of the terminal node
   * @param {string}   [params.tool]                  - Tool identifier of the terminal node
   * @param {object[]} [params.executedSteps=[]]      - Merged executed steps from all nodes
   * @param {number}   [params.executionTimeMs=0]     - Total wall-clock execution time
   * @param {object}   [params.diagnostics={}]        - Aggregated diagnostics
   * @param {object}   [params.metadata={}]           - Execution metadata
   * @returns {object} Plain serialisable result object
   */
  static create({
    success         = true,
    workflowId      = "",
    completedNodes  = [],
    failedNodes     = [],
    skippedNodes    = [],
    outputs         = {},
    answer,
    capability      = "chat",
    tool,
    executedSteps   = [],
    executionTimeMs = 0,
    diagnostics     = {},
    metadata        = {},
  }) {
    return {
      success:        Boolean(success),
      workflowId:     String(workflowId),
      // CapabilityResult-compatible fields for transparent pass-through
      capability:     String(capability),
      tool:           String(tool || capability),
      answer,
      response:       answer,
      executedSteps:  Array.isArray(executedSteps) ? executedSteps : [],
      // Workflow-specific fields
      completedNodes: Array.isArray(completedNodes) ? completedNodes : [],
      failedNodes:    Array.isArray(failedNodes)    ? failedNodes    : [],
      skippedNodes:   Array.isArray(skippedNodes)   ? skippedNodes   : [],
      outputs:        typeof outputs === "object"   ? outputs        : {},
      executionTimeMs: Number(executionTimeMs),
      diagnostics:    typeof diagnostics === "object" ? diagnostics  : {},
      metadata: {
        timestamp: new Date().toISOString(),
        ...metadata,
      },
    };
  }
}

/**
 * Custom error class for workflow validation failures.
 * Carries structured details about what failed validation.
 */
export class WorkflowValidationError extends Error {
  /**
   * @param {string}   message         - Human-readable description
   * @param {string[]} [violations=[]] - List of specific validation violations
   */
  constructor(message, violations = []) {
    super(message);
    this.name       = "WorkflowValidationError";
    this.violations = violations;
  }
}
