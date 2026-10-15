import { capabilityRegistry }   from "./CapabilityRegistry.js";
import { capabilityRouter }     from "./CapabilityRouter.js";
import { capabilityDiagnostics } from "./CapabilityDiagnostics.js";
import { CapabilityContext }    from "./CapabilityContext.js";
import { CapabilityResult }     from "./CapabilityResult.js";
import { workflowEngine }       from "../workflow/WorkflowEngine.js";
import { ErrorNormalizer }       from "../errors/ErrorNormalizer.js";

// Import all 12 built-in capability classes
import { ChatCapability }     from "./impl/ChatCapability.js";
import { MemoryCapability }   from "./impl/MemoryCapability.js";
import { VisionCapability }   from "./impl/VisionCapability.js";
import { DesktopCapability }  from "./impl/DesktopCapability.js";
import { ResearchCapability } from "./impl/ResearchCapability.js";
import { CodeCapability }     from "./impl/CodeCapability.js";
import { PDFCapability }      from "./impl/PDFCapability.js";
import { TaskCapability }     from "./impl/TaskCapability.js";
import { NotesCapability }    from "./impl/NotesCapability.js";
import { WebCapability }      from "./impl/WebCapability.js";
import { VoiceCapability }    from "./impl/VoiceCapability.js";
import { EmailCapability }    from "./impl/EmailCapability.js";
import { CalendarCapability } from "./impl/CalendarCapability.js";

/**
 * CapabilityManager.js
 *
 * Single public API for Agent Core request execution.
 * Delegates execution to WorkflowEngine, which orchestrates planning,
 * validation, and node-by-node execution through CapabilityLifecycle.
 *
 * Public API is unchanged — callers continue to call executeRequest().
 */
export class CapabilityManager {
  constructor() {
    this.registry      = capabilityRegistry;
    this.router        = capabilityRouter;
    this.diagnostics   = capabilityDiagnostics;
    this._workflowEngine = workflowEngine;
    this._registerBuiltins();
  }

  _registerBuiltins() {
    this.registry.register(new ChatCapability());
    this.registry.register(new MemoryCapability());
    this.registry.register(new VisionCapability());
    this.registry.register(new DesktopCapability());
    this.registry.register(new ResearchCapability());
    this.registry.register(new CodeCapability());
    this.registry.register(new PDFCapability());
    this.registry.register(new TaskCapability());
    this.registry.register(new NotesCapability());
    this.registry.register(new WebCapability());
    this.registry.register(new VoiceCapability());
    this.registry.register(new EmailCapability());
    this.registry.register(new CalendarCapability());
  }

  /**
   * Execute an incoming request prompt through the Workflow Engine.
   *
   * Every request — simple or multi-step — travels through WorkflowEngine,
   * which produces a single-node graph for simple requests (backward compat)
   * or a multi-node dependency graph for compound requests.
   *
   * @param {string} prompt          - User request
   * @param {string} [toolContext]   - Tool context mode ("chat", "voice", …)
   * @param {object} [assembledContext] - Assembled context payload from ContextAssembly
   * @returns {Promise<object>} WorkflowResult (CapabilityResult-compatible shape)
   */
  async executeRequest(prompt, toolContext = "chat", assembledContext = {}) {
    const context = new CapabilityContext({
      prompt,
      toolContext,
      semanticMemory:  assembledContext.memory       || {},
      history:         assembledContext.history       || [],
      summary:         assembledContext.summary       || "",
      pdfMemory:       assembledContext.pdfMemory     || {},
    });

    try {
      const result = await this._workflowEngine.execute(context);
      if (result && result.answer) return result;

      // If workflow result has no answer, normalize it
      const normalized = ErrorNormalizer.normalize(result?.error || "CAPABILITY_FAILED", {
        capability: result?.capability || "chat",
        tool: result?.tool || "chat"
      });
      return CapabilityResult.create({
        ...result,
        success: false,
        answer: normalized.userMessage,
        response: normalized.userMessage,
      });

    } catch (err) {
      this.diagnostics.logError("workflow", err);

      // Fallback: attempt direct ChatCapability execution if workflow engine fails
      console.warn("[CapabilityManager] WorkflowEngine failed — falling back to ChatCapability.", err.message);
      const chatCap = this.registry.getCapability("chat");
      if (chatCap) {
        try {
          const { CapabilityLifecycle } = await import("./CapabilityLifecycle.js");
          const fallbackResult = await CapabilityLifecycle.run(chatCap, context);
          if (fallbackResult && fallbackResult.answer) {
            return CapabilityResult.create({
              ...fallbackResult,
              metadata: { fallbackReason: err.message },
            });
          }
        } catch (chatErr) {
          console.warn("[CapabilityManager] ChatCapability fallback also failed.", chatErr.message);
        }
      }

      const normalized = ErrorNormalizer.normalize(err, { capability: "chat", tool: "chat" });
      return CapabilityResult.create({
        success: false,
        capability: "chat",
        tool: "chat",
        answer: normalized.userMessage,
        response: normalized.userMessage,
        diagnostics: { error: err.message },
        metadata: {
          code: normalized.code,
          technicalMessage: normalized.technicalMessage,
        }
      });
    }
  }

  /**
   * Register a new capability dynamically.
   * The capability will be discoverable by WorkflowExecutor on the next request.
   * @param {import("./BaseCapability.js").BaseCapability} capabilityInstance
   */
  registerCapability(capabilityInstance) {
    this.registry.register(capabilityInstance);
  }
}

export const capabilityManager = new CapabilityManager();
