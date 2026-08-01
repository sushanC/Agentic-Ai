import { memoryManager } from "../../features/memory/index.js";

/**
 * VisionMemoryBridge.js
 *
 * Automatically persists key visual insights (error logs, architecture diagrams,
 * documents, and key UI screenshots) into Cognitive Memory (`features/memory/`).
 */
export class VisionMemoryBridge {
  /**
   * Persist significant vision results to Cognitive Memory.
   *
   * @param {import("./VisionResult.js").VisionResult} visionResult
   * @param {string} prompt
   * @returns {Promise<boolean>}
   */
  static async persistToMemory(visionResult, prompt) {
    if (!visionResult || !visionResult.success) return false;

    try {
      const task = visionResult.task;

      if (task === "error") {
        await memoryManager.store({
          type: "reflection",
          content: {
            task: "Visual Error Debugging",
            error: visionResult.parsedAnalysis.error || visionResult.summary,
            stackTrace: visionResult.parsedAnalysis.stackTrace,
            fix: visionResult.parsedAnalysis.likelyFix,
          },
          importance: 0.85
        }, { storeName: "reflection" });
        return true;
      }

      if (task === "document" || task === "ocr") {
        await memoryManager.store({
          type: "semantic",
          content: {
            key: `visual_doc_${Date.now()}`,
            value: visionResult.summary,
            ocrText: visionResult.ocrText.slice(0, 500)
          },
          importance: 0.70
        }, { storeName: "semantic" });
        return true;
      }

      if (task === "ui" || task === "chart") {
        await memoryManager.store({
          type: "project",
          content: {
            name: "Visual Analysis Artifact",
            summary: visionResult.summary,
            task,
            prompt
          },
          importance: 0.65
        }, { storeName: "project" });
        return true;
      }

      return false;
    } catch (err) {
      console.warn("[VisionMemoryBridge] Failed to persist visual insight to memory:", err.message);
      return false;
    }
  }
}
