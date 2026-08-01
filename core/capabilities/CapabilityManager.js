import { capabilityRegistry }   from "./CapabilityRegistry.js";
import { capabilityRouter }     from "./CapabilityRouter.js";
import { capabilityDiagnostics } from "./CapabilityDiagnostics.js";
import { CapabilityContext }    from "./CapabilityContext.js";
import { CapabilityResult }     from "./CapabilityResult.js";
import { workflowEngine }       from "../workflow/WorkflowEngine.js";

// Import all 11 built-in capability classes
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
      return await this._workflowEngine.execute(context);

    } catch (err) {
      this.diagnostics.logError("workflow", err);

      // Fallback: attempt direct ChatCapability execution if workflow engine fails
      console.warn("[CapabilityManager] WorkflowEngine failed — falling back to ChatCapability.", err.message);
      const chatCap = this.registry.getCapability("chat");
      if (chatCap) {
        const { CapabilityLifecycle } = await import("./CapabilityLifecycle.js");
        const fallbackResult = await CapabilityLifecycle.run(chatCap, context);
        return CapabilityResult.create({
          ...fallbackResult,
          metadata: { fallbackReason: err.message },
        });
      }

      throw err;
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
