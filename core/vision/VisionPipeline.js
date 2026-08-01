import { ImageValidator } from "./preprocessing/ImageValidator.js";
import { ImageNormalizer } from "./preprocessing/ImageNormalizer.js";
import { ImageResizer } from "./preprocessing/ImageResizer.js";
import { ImageCompressor } from "./preprocessing/ImageCompressor.js";
import { visionRegistry } from "./VisionRegistry.js";
import { visionDiagnostics } from "./VisionDiagnostics.js";
import { VisionResult } from "./VisionResult.js";

/**
 * VisionPipeline.js
 *
 * Executes the 7-stage modular vision processing pipeline:
 * Validate -> Normalize -> Resize -> Compress -> Select Provider -> AI Vision -> Run Analyzer -> Build Result
 */
export class VisionPipeline {
  /**
   * Execute vision pipeline.
   *
   * @param {import("./VisionContext.js").VisionContext} visionContext
   * @param {import("./VisionRegistry.js").VisionRegistry} [registry=visionRegistry]
   * @returns {Promise<import("./VisionResult.js").VisionResult>}
   */
  static async execute(visionContext, registry = visionRegistry) {
    const startTime = Date.now();
    const task = visionContext.task;

    // Stage 1: Validate Image
    const validation = ImageValidator.validate(visionContext.imageInput);
    if (!validation.valid && validation.images.length === 0) {
      return VisionResult.create({
        success: false,
        task,
        summary: validation.errors.join("; ") || "Invalid image input provided.",
        confidence: 0.0
      });
    }

    // Stage 2: Normalize
    const normalizedImages = await ImageNormalizer.normalizeAll(validation.images);
    if (normalizedImages.length === 0) {
      return VisionResult.create({
        success: false,
        task,
        summary: "Failed to normalize image payloads.",
        confidence: 0.0
      });
    }

    const totalBytes = normalizedImages.reduce((sum, img) => sum + img.base64.length, 0);
    visionDiagnostics.logImageNormalized(normalizedImages.length, totalBytes);

    // Stage 3: Resize
    const resizedImages = await ImageResizer.resizeAll(normalizedImages, 2048);

    // Stage 4: Compress if necessary
    const processedImages = await ImageCompressor.compressAll(resizedImages);

    // Stage 5: Select Provider & Failover
    const providers = registry.getAllProviders();
    if (providers.length === 0) {
      throw new Error("[VisionPipeline] No vision providers registered.");
    }

    let lastError = null;
    let successfulInference = null;
    let selectedProvider = null;

    // Filter by options override if requested
    const targetProviderName = visionContext.options.providerOverride;
    const candidateProviders = targetProviderName
      ? providers.filter(p => p.name === targetProviderName.toLowerCase())
      : providers;

    for (const provider of candidateProviders) {
      try {
        const isHealthy = await provider.health();
        if (!isHealthy) continue;

        selectedProvider = provider;
        visionDiagnostics.logProviderSelected(provider.name, visionContext.options.modelId || "default");

        // Stage 6: Run AI Vision
        const analyzer = registry.getAnalyzer(task);
        const systemPrompt = analyzer ? analyzer.getSystemPrompt() : undefined;

        successfulInference = await provider.analyze(
          processedImages,
          visionContext.prompt,
          { ...visionContext.options, systemPrompt }
        );

        break;
      } catch (err) {
        lastError = err;
        visionDiagnostics.logProviderFailed(provider.name, err);

        const nextIndex = candidateProviders.indexOf(provider) + 1;
        if (nextIndex < candidateProviders.length) {
          visionDiagnostics.logFallbackActivated(provider.name, candidateProviders[nextIndex].name);
        }
      }
    }

    if (!successfulInference) {
      return VisionResult.create({
        success: false,
        task,
        summary: `Vision analysis failed across all providers: ${lastError?.message || "Provider unavailable"}`,
        confidence: 0.0
      });
    }

    // Stage 7: Run Specialized Analyzer & Build VisionResult
    const analyzerStart = Date.now();
    const analyzer = registry.getAnalyzer(task);
    let parsedAnalysis = {};

    if (analyzer) {
      parsedAnalysis = analyzer.parse(successfulInference.rawText);
      visionDiagnostics.logAnalyzerCompleted(analyzer.name, Date.now() - analyzerStart);
    }

    const durationMs = Date.now() - startTime;
    visionDiagnostics.logFinished(selectedProvider.name, task, durationMs);

    return VisionResult.create({
      success: true,
      task,
      summary: parsedAnalysis.summary || parsedAnalysis.trends || parsedAnalysis.error || successfulInference.rawText,
      ocrText: parsedAnalysis.ocrText || (task === "ocr" ? successfulInference.rawText : ""),
      detectedObjects: parsedAnalysis.objects || parsedAnalysis.detectedElements?.buttons || [],
      tables: parsedAnalysis.rows ? [parsedAnalysis] : [],
      charts: task === "chart" ? parsedAnalysis : {},
      layout: parsedAnalysis.layout || {},
      entities: parsedAnalysis.entities || {},
      confidence: parsedAnalysis.confidence || 0.95,
      provider: selectedProvider.name,
      model: successfulInference.model,
      parsedAnalysis,
      timings: { totalMs: durationMs }
    });
  }
}
