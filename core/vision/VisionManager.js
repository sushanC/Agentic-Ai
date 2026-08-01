import { visionRegistry } from "./VisionRegistry.js";
import { visionCache } from "./VisionCache.js";
import { visionDiagnostics } from "./VisionDiagnostics.js";
import { VisionContext } from "./VisionContext.js";
import { VisionPipeline } from "./VisionPipeline.js";
import { VisionMemoryBridge } from "./VisionMemoryBridge.js";
import { VisionResult } from "./VisionResult.js";

// Providers
import { GeminiVisionProvider } from "./providers/GeminiVisionProvider.js";
import { OpenAIVisionProvider } from "./providers/OpenAIVisionProvider.js";
import { OllamaVisionProvider } from "./providers/OllamaVisionProvider.js";

// Analyzers
import { OCRAnalyzer } from "./analyzers/OCRAnalyzer.js";
import { UIAnalyzer } from "./analyzers/UIAnalyzer.js";
import { DocumentAnalyzer } from "./analyzers/DocumentAnalyzer.js";
import { ChartAnalyzer } from "./analyzers/ChartAnalyzer.js";
import { SceneAnalyzer } from "./analyzers/SceneAnalyzer.js";
import { ErrorAnalyzer } from "./analyzers/ErrorAnalyzer.js";
import { TableAnalyzer } from "./analyzers/TableAnalyzer.js";

/**
 * VisionManager.js
 *
 * Top-level Orchestration Manager for the Vision Framework.
 * Manages provider registration, analyzer discovery, caching, failover, and memory persistence.
 */
export class VisionManager {
  constructor() {
    this.registry = visionRegistry;
    this.cache = visionCache;
    this.diagnostics = visionDiagnostics;
    this._registerBuiltins();
  }

  _registerBuiltins() {
    // Register Providers
    this.registry.registerProvider(new GeminiVisionProvider());
    this.registry.registerProvider(new OpenAIVisionProvider());
    this.registry.registerProvider(new OllamaVisionProvider());

    // Register Analyzers
    this.registry.registerAnalyzer(new OCRAnalyzer());
    this.registry.registerAnalyzer(new UIAnalyzer());
    this.registry.registerAnalyzer(new DocumentAnalyzer());
    this.registry.registerAnalyzer(new ChartAnalyzer());
    this.registry.registerAnalyzer(new SceneAnalyzer());
    this.registry.registerAnalyzer(new ErrorAnalyzer());
    this.registry.registerAnalyzer(new TableAnalyzer());
  }

  /**
   * Execute a Vision Request through the Vision Framework.
   *
   * @param {string} prompt - Analysis instruction
   * @param {any} imageInput - File path, data URL, base64, buffer, or array thereof
   * @param {object} [options={}] - Options (task, providerOverride, disableCache)
   * @returns {Promise<import("./VisionResult.js").VisionResult>}
   */
  async processVisionRequest(prompt, imageInput, options = {}) {
    const context = new VisionContext({
      prompt,
      imageInput,
      task: options.task,
      options
    });

    this.diagnostics.logStarted(context.task, Array.isArray(imageInput) ? imageInput.length : 1);

    try {
      // Execute 7-stage vision pipeline
      const result = await VisionPipeline.execute(context, this.registry);

      // Persist key visual insights into Cognitive Memory
      if (result.success) {
        await VisionMemoryBridge.persistToMemory(result, prompt);
      }

      return result;

    } catch (err) {
      this.diagnostics.logError(context.task, err);
      return VisionResult.create({
        success: false,
        task: context.task,
        summary: `VisionManager Error: ${err.message}`,
        confidence: 0.0
      });
    }
  }

  registerProvider(providerInstance) {
    this.registry.registerProvider(providerInstance);
  }

  registerAnalyzer(analyzerInstance) {
    this.registry.registerAnalyzer(analyzerInstance);
  }
}

export const visionManager = new VisionManager();
