import { WorkflowValidationError } from "./WorkflowResult.js";
import { NodeStatus } from "./WorkflowNode.js";

/**
 * WorkflowValidator.js
 *
 * Pre-execution validator for WorkflowGraph instances.
 * Ensures the graph is structurally sound before WorkflowExecutor attempts to run it.
 *
 * Checks performed (in order):
 *   1. Graph is not empty
 *   2. No duplicate node IDs
 *   3. All dependency IDs reference existing nodes
 *   4. No circular dependencies (cycle detection)
 *   5. All requiredCapability values are registered in CapabilityRegistry
 *
 * Throws WorkflowValidationError with a structured list of violations on failure.
 */
export class WorkflowValidator {
  /**
   * Validate a WorkflowGraph against the active CapabilityRegistry.
   *
   * @param {import("./WorkflowGraph.js").WorkflowGraph} graph
   * @param {import("../capabilities/CapabilityRegistry.js").CapabilityRegistry} capabilityRegistry
   * @throws {WorkflowValidationError} if any check fails
   */
  validate(graph, capabilityRegistry) {
    const violations = [];

    // 1. Non-empty graph
    if (graph.size === 0) {
      violations.push("Graph is empty — at least one node is required.");
    }

    const nodes = graph.getAllNodes();
    const nodeIds = new Set();

    // 2 & 3. Duplicate IDs and missing dependency references
    for (const node of nodes) {
      if (nodeIds.has(node.id)) {
        violations.push(`Duplicate node ID detected: "${node.id}".`);
      }
      nodeIds.add(node.id);

      for (const depId of node.dependencies) {
        if (!graph.getNode(depId)) {
          violations.push(
            `Node "${node.id}" has dependency "${depId}" which does not exist in the graph.`
          );
        }
      }
    }

    // 4. Cycle detection — only meaningful if node IDs are otherwise valid
    if (violations.length === 0 && graph.isCyclic()) {
      violations.push("WorkflowGraph contains a circular dependency (cycle detected).");
    }

    // 5. All required capabilities are registered
    for (const node of nodes) {
      const cap = capabilityRegistry.getCapability(node.requiredCapability);
      if (!cap) {
        violations.push(
          `Node "${node.id}" requires capability "${node.requiredCapability}" which is not registered in CapabilityRegistry.`
        );
      }
    }

    if (violations.length > 0) {
      throw new WorkflowValidationError(
        `WorkflowGraph validation failed with ${violations.length} violation(s): ${violations[0]}`,
        violations
      );
    }
  }
}

export const workflowValidator = new WorkflowValidator();
