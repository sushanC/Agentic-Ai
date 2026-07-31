/**
 * CapabilityResult.js
 *
 * Standardized return contract for capability execution.
 * Avoids inconsistent return objects across capability handlers.
 */
export class CapabilityResult {
  /**
   * Create standardized CapabilityResult.
   *
   * @param {object} params
   * @param {boolean} [params.success=true] - Execution success indicator
   * @param {string} params.capability - Owning capability name
   * @param {string} [params.tool] - Primary tool identifier (e.g. "chat", "memory")
   * @param {any} params.answer - Primary answer response payload
   * @param {any} [params.response] - Alias for answer payload
   * @param {Array} [params.executedSteps=[]] - Executed steps history
   * @param {Array} [params.toolCalls=[]] - Tool calls history
   * @param {Array} [params.artifacts=[]] - Created artifacts
   * @param {object} [params.diagnostics={}] - Diagnostic metrics
   * @param {object} [params.metadata={}] - Execution metadata
   * @returns {CapabilityResult}
   */
  static create({
    success = true,
    capability = "chat",
    tool,
    answer,
    response,
    executedSteps = [],
    toolCalls = [],
    artifacts = [],
    diagnostics = {},
    metadata = {},
  }) {
    const finalAnswer = answer !== undefined ? answer : response;
    const finalTool = tool || capability;

    return {
      success: Boolean(success),
      capability: String(capability),
      tool: String(finalTool),
      answer: finalAnswer,
      response: finalAnswer,
      executedSteps: Array.isArray(executedSteps) ? executedSteps : [],
      toolCalls: Array.isArray(toolCalls) ? toolCalls : [],
      artifacts: Array.isArray(artifacts) ? artifacts : [],
      diagnostics: typeof diagnostics === "object" ? diagnostics : {},
      metadata: {
        timestamp: new Date().toISOString(),
        ...metadata,
      },
    };
  }
}
