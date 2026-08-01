/**
 * VisionResult.js
 *
 * Standardized Vision Framework result structure returned by VisionPipeline and VisionManager.
 */
export class VisionResult {
  /**
   * Create a standardized VisionResult object.
   *
   * @param {object} params
   * @param {boolean} [params.success=true]
   * @param {string} [params.task="describe"]
   * @param {string} [params.summary=""]
   * @param {string} [params.ocrText=""]
   * @param {Array} [params.detectedObjects=[]]
   * @param {Array} [params.tables=[]]
   * @param {object} [params.charts={}]
   * @param {object} [params.layout={}]
   * @param {object} [params.entities={}]
   * @param {number} [params.confidence=0.95]
   * @param {string} [params.provider="gemini"]
   * @param {string} [params.model="gemini-2.5-flash"]
   * @param {object} [params.parsedAnalysis={}]
   * @param {object} [params.timings={}]
   * @param {object} [params.metadata={}]
   * @returns {VisionResult}
   */
  static create({
    success = true,
    task = "describe",
    summary = "",
    ocrText = "",
    detectedObjects = [],
    tables = [],
    charts = {},
    layout = {},
    entities = {},
    confidence = 0.95,
    provider = "gemini",
    model = "gemini-2.5-flash",
    parsedAnalysis = {},
    timings = {},
    metadata = {}
  }) {
    return {
      success: Boolean(success),
      task: String(task),
      summary: String(summary || ocrText || "Vision analysis complete."),
      ocrText: String(ocrText || ""),
      detectedObjects: Array.isArray(detectedObjects) ? detectedObjects : [],
      tables: Array.isArray(tables) ? tables : [],
      charts: typeof charts === "object" ? charts : {},
      layout: typeof layout === "object" ? layout : {},
      entities: typeof entities === "object" ? entities : {},
      confidence: Number(confidence),
      provider: String(provider),
      model: String(model),
      parsedAnalysis: typeof parsedAnalysis === "object" ? parsedAnalysis : {},
      timings: typeof timings === "object" ? timings : {},
      metadata: {
        timestamp: new Date().toISOString(),
        ...metadata
      }
    };
  }
}
