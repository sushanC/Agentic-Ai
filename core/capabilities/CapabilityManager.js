import { capabilityRegistry } from "./CapabilityRegistry.js";
import { capabilityRouter } from "./CapabilityRouter.js";
import { capabilityDiagnostics } from "./CapabilityDiagnostics.js";
import { CapabilityLifecycle } from "./CapabilityLifecycle.js";
import { CapabilityContext } from "./CapabilityContext.js";
import { CapabilityResult } from "./CapabilityResult.js";

// Import all 11 built-in capability classes
import { ChatCapability } from "./impl/ChatCapability.js";
import { MemoryCapability } from "./impl/MemoryCapability.js";
import { VisionCapability } from "./impl/VisionCapability.js";
import { DesktopCapability } from "./impl/DesktopCapability.js";
import { ResearchCapability } from "./impl/ResearchCapability.js";
import { CodeCapability } from "./impl/CodeCapability.js";
import { PDFCapability } from "./impl/PDFCapability.js";
import { TaskCapability } from "./impl/TaskCapability.js";
import { NotesCapability } from "./impl/NotesCapability.js";
import { WebCapability } from "./impl/WebCapability.js";
import { VoiceCapability } from "./impl/VoiceCapability.js";

/**
 * CapabilityManager.js
 *
 * Single Orchestration Layer for the Capability Framework.
 * Discovers capabilities, selects the owner capability via CapabilityRouter,
 * executes the 5-stage lifecycle, handles fallbacks, and returns standardized CapabilityResults.
 * AgentRuntime communicates ONLY with CapabilityManager.
 */
export class CapabilityManager {
  constructor() {
    this.registry = capabilityRegistry;
    this.router = capabilityRouter;
    this.diagnostics = capabilityDiagnostics;
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
   * Execute an incoming request prompt through the Capability Framework.
   *
   * @param {string} prompt - User request
   * @param {string} [toolContext="chat"] - Tool context mode
   * @param {object} [assembledContext={}] - Assembled context payload
   * @returns {Promise<CapabilityResult>} Standardized CapabilityResult payload
   */
  async executeRequest(prompt, toolContext = "chat", assembledContext = {}) {
    const context = new CapabilityContext({
      prompt,
      toolContext,
      semanticMemory: assembledContext.memory || {},
      history: assembledContext.history || [],
      summary: assembledContext.summary || "",
      pdfMemory: assembledContext.pdfMemory || {},
    });

    // Select capability owner via CapabilityRouter
    const selectedCapability = this.router.route(context);

    try {
      // Execute standardized 5-stage lifecycle
      const result = await CapabilityLifecycle.run(selectedCapability, context);
      return result;

    } catch (err) {
      this.diagnostics.logError(selectedCapability.name, err);

      // Attempt fallback to ChatCapability if non-chat capability failed
      if (selectedCapability.name !== "chat") {
        console.warn(`[CapabilityManager] Capability "${selectedCapability.name}" failed. Falling back to ChatCapability.`);
        const chatCap = this.registry.getCapability("chat");
        if (chatCap) {
          const fallbackResult = await CapabilityLifecycle.run(chatCap, context);
          return CapabilityResult.create({
            ...fallbackResult,
            metadata: { fallbackFrom: selectedCapability.name },
          });
        }
      }

      throw err;
    }
  }

  /**
   * Register a new capability dynamically.
   * @param {import("./BaseCapability.js").BaseCapability} capabilityInstance
   */
  registerCapability(capabilityInstance) {
    this.registry.register(capabilityInstance);
  }
}

export const capabilityManager = new CapabilityManager();
