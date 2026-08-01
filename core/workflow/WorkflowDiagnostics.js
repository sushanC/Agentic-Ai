import { developerEvents } from "../events/DeveloperEvents.js";

/**
 * WorkflowDiagnostics.js
 *
 * Telemetry bridge for the Workflow Engine.
 * Emits structured developer events via DeveloperEvents for every meaningful
 * lifecycle moment in a workflow execution:
 *   workflow:started, workflow:planned, workflow:validated,
 *   workflow:nodeStarted, workflow:nodeCompleted, workflow:nodeFailed,
 *   workflow:nodeSkipped, workflow:finished, workflow:error
 */
export class WorkflowDiagnostics {
  constructor() {
    this._events = developerEvents;
  }

  /**
   * Workflow execution has begun.
   * @param {string} workflowId
   * @param {string} prompt
   */
  logStarted(workflowId, prompt) {
    this._events.emitDevEvent("WorkflowStarted", {
      workflowId,
      prompt: prompt.slice(0, 120),
    });
  }

  /**
   * WorkflowPlanner produced a graph.
   * @param {string} workflowId
   * @param {number} nodeCount
   * @param {boolean} isMultiNode
   */
  logPlanned(workflowId, nodeCount, isMultiNode) {
    this._events.emitDevEvent("WorkflowPlanned", {
      workflowId,
      nodeCount,
      isMultiNode,
    });
  }

  /**
   * WorkflowValidator accepted the graph.
   * @param {string} workflowId
   */
  logValidated(workflowId) {
    this._events.emitDevEvent("WorkflowValidated", { workflowId });
  }

  /**
   * A node started executing.
   * @param {string} workflowId
   * @param {string} nodeId
   * @param {string} capability
   * @param {string} task
   */
  logNodeStarted(workflowId, nodeId, capability, task) {
    this._events.emitDevEvent("WorkflowNodeStarted", {
      workflowId,
      nodeId,
      capability,
      task: task.slice(0, 80),
    });
  }

  /**
   * A node completed successfully.
   * @param {string} workflowId
   * @param {string} nodeId
   * @param {number} durationMs
   */
  logNodeCompleted(workflowId, nodeId, durationMs) {
    this._events.emitDevEvent("WorkflowNodeCompleted", {
      workflowId,
      nodeId,
      durationMs,
    });
  }

  /**
   * A node failed with an error.
   * @param {string} workflowId
   * @param {string} nodeId
   * @param {Error|string} error
   */
  logNodeFailed(workflowId, nodeId, error) {
    this._events.emitDevEvent("WorkflowNodeFailed", {
      workflowId,
      nodeId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  /**
   * A node was skipped because an upstream dependency failed.
   * @param {string} workflowId
   * @param {string} nodeId
   */
  logNodeSkipped(workflowId, nodeId) {
    this._events.emitDevEvent("WorkflowNodeSkipped", { workflowId, nodeId });
  }

  /**
   * The entire workflow finished.
   * @param {string} workflowId
   * @param {boolean} success
   * @param {number} totalDurationMs
   * @param {number} completedCount
   * @param {number} failedCount
   */
  logFinished(workflowId, success, totalDurationMs, completedCount, failedCount) {
    this._events.emitDevEvent("WorkflowFinished", {
      workflowId,
      success,
      totalDurationMs,
      completedCount,
      failedCount,
    });
  }

  /**
   * An unhandled error terminated the workflow.
   * @param {string} workflowId
   * @param {Error} error
   */
  logError(workflowId, error) {
    this._events.emitDevEvent("WorkflowError", {
      workflowId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export const workflowDiagnostics = new WorkflowDiagnostics();
