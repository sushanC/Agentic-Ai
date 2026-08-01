import { CapabilityContext } from "../capabilities/CapabilityContext.js";
import { CapabilityLifecycle } from "../capabilities/CapabilityLifecycle.js";
import { NodeStatus } from "./WorkflowNode.js";
import { WorkflowResult } from "./WorkflowResult.js";
import { workflowDiagnostics } from "./WorkflowDiagnostics.js";

/**
 * WorkflowExecutor.js
 *
 * Walks a validated WorkflowGraph in dependency order, executes each node
 * through the existing CapabilityLifecycle, accumulates outputs in a shared
 * WorkflowContext, and assembles a WorkflowResult when execution is complete.
 *
 * Design rules:
 *   - NEVER calls tool functions or capability methods directly.
 *   - ALWAYS uses CapabilityLifecycle.run(capability, context) for every node.
 *   - Capabilities remain completely unchanged.
 *   - On node failure, downstream dependents are marked SKIPPED.
 *   - Execution is sequential (v1). Extension point: replace the sequential
 *     loop with a concurrent scheduler to enable parallel execution in v2.
 */
export class WorkflowExecutor {
  /**
   * @param {import("../capabilities/CapabilityRegistry.js").CapabilityRegistry} capabilityRegistry
   */
  constructor(capabilityRegistry) {
    this._registry = capabilityRegistry;
  }

  /**
   * Execute the full WorkflowGraph.
   *
   * @param {string}                                       workflowId
   * @param {import("./WorkflowGraph.js").WorkflowGraph}   graph
   * @param {import("./WorkflowContext.js").WorkflowContext} workflowContext
   * @returns {Promise<import("./WorkflowResult.js")>} WorkflowResult plain object
   */
  async execute(workflowId, graph, workflowContext) {
    const startTime = Date.now();

    // Execute nodes in topological order (sequential v1)
    const orderedNodes = graph.topologicalSort();

    for (const node of orderedNodes) {
      // Check if this node should be skipped because a dependency failed
      if (this._hasFailedDependency(graph, node)) {
        node.markSkipped();
        workflowDiagnostics.logNodeSkipped(workflowId, node.id);
        continue;
      }

      // Mark node running
      node.markRunning();
      workflowDiagnostics.logNodeStarted(workflowId, node.id, node.requiredCapability, node.task);

      const nodeStart = Date.now();

      try {
        // Resolve capability from registry
        const capability = this._registry.getCapability(node.requiredCapability);
        if (!capability) {
          throw new Error(
            `WorkflowExecutor: capability "${node.requiredCapability}" is not registered ` +
            `(node "${node.id}"). This should have been caught by WorkflowValidator.`
          );
        }

        // Build a CapabilityContext enriched with upstream outputs from WorkflowContext
        const capabilityContext = this._buildCapabilityContext(node, workflowContext);

        // Execute through the standard CapabilityLifecycle (unchanged)
        const capResult = await CapabilityLifecycle.run(capability, capabilityContext);

        // Persist output to WorkflowContext and to the node
        workflowContext.setNodeOutput(node.id, capResult);
        node.markCompleted(capResult);

        workflowDiagnostics.logNodeCompleted(workflowId, node.id, Date.now() - nodeStart);

      } catch (err) {
        node.markFailed(err);
        workflowDiagnostics.logNodeFailed(workflowId, node.id, err);
        // Continue — downstream nodes will be skipped by hasFailed dependency check
      }
    }

    // Assemble the final result
    return this._buildResult(workflowId, graph, workflowContext, Date.now() - startTime);
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Build a CapabilityContext for a node, merging WorkflowContext state
   * with the node's own input and upstream dependency outputs.
   *
   * @param {import("./WorkflowNode.js").WorkflowNode}      node
   * @param {import("./WorkflowContext.js").WorkflowContext} wCtx
   * @returns {CapabilityContext}
   */
  _buildCapabilityContext(node, wCtx) {
    const composedPrompt = wCtx.buildNodePrompt(node);

    return new CapabilityContext({
      prompt:          composedPrompt,
      toolContext:     wCtx.toolContext,
      semanticMemory:  wCtx.semanticMemory,
      history:         wCtx.history,
      summary:         wCtx.summary,
      pdfMemory:       wCtx.pdfMemory,
      runtimeState:    wCtx.runtimeState,
      userPreferences: wCtx.userPreferences,
      // Inject upstream outputs as workingMemory so capabilities can inspect them
      workingMemory:   wCtx.getAllNodeOutputs(),
    });
  }

  /**
   * Determine whether any dependency of this node has failed or been skipped.
   * @param {import("./WorkflowGraph.js").WorkflowGraph}  graph
   * @param {import("./WorkflowNode.js").WorkflowNode}    node
   * @returns {boolean}
   */
  _hasFailedDependency(graph, node) {
    return node.dependencies.some(depId => {
      const dep = graph.getNode(depId);
      return dep && (dep.status === NodeStatus.FAILED || dep.status === NodeStatus.SKIPPED);
    });
  }

  /**
   * Assemble a WorkflowResult from the completed graph and context.
   * The 'answer' and 'capability' fields are taken from the last completed node
   * so that single-node workflows are transparent to existing callers.
   *
   * @param {string}                                       workflowId
   * @param {import("./WorkflowGraph.js").WorkflowGraph}   graph
   * @param {import("./WorkflowContext.js").WorkflowContext} wCtx
   * @param {number}                                       executionTimeMs
   * @returns {object} WorkflowResult plain object
   */
  _buildResult(workflowId, graph, wCtx, executionTimeMs) {
    const completedNodes = graph.getCompletedNodes();
    const failedNodes    = graph.getFailedNodes();
    const skippedNodes   = graph.getAllNodes().filter(n => n.status === NodeStatus.SKIPPED);
    const allNodes       = graph.getAllNodes();

    // Terminal node: the last completed node in topological order
    const orderedCompleted = graph.topologicalSort()
      .filter(n => n.status === NodeStatus.COMPLETED);
    const terminalNode = orderedCompleted[orderedCompleted.length - 1] ?? null;

    const terminalResult    = terminalNode ? wCtx.getNodeOutput(terminalNode.id) : null;
    const overallSuccess    = failedNodes.length === 0 && completedNodes.length > 0;

    // Aggregate executed steps from all completed nodes
    const executedSteps = completedNodes.flatMap(n => {
      const out = wCtx.getNodeOutput(n.id);
      return out?.executedSteps ?? [{ name: n.task, status: "completed" }];
    });

    return WorkflowResult.create({
      success:         overallSuccess,
      workflowId,
      completedNodes:  completedNodes.map(n => n.toJSON()),
      failedNodes:     failedNodes.map(n => n.toJSON()),
      skippedNodes:    skippedNodes.map(n => n.toJSON()),
      outputs:         wCtx.getAllNodeOutputs(),
      answer:          terminalResult?.answer ?? null,
      capability:      terminalResult?.capability ?? "chat",
      tool:            terminalResult?.tool ?? "chat",
      executedSteps,
      executionTimeMs,
      diagnostics: {
        totalNodes:      allNodes.length,
        completedCount:  completedNodes.length,
        failedCount:     failedNodes.length,
        skippedCount:    skippedNodes.length,
        contextSnapshot: wCtx.toSnapshot(),
      },
    });
  }
}
