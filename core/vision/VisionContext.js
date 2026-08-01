/**
 * VisionContext.js
 *
 * Encapsulates input prompt, images payload, target task, options, and metadata
 * passed into VisionPipeline.
 */
export class VisionContext {
  /**
   * @param {object} params
   * @param {string} params.prompt - Vision request prompt
   * @param {any} [params.imageInput] - Single or array of images (file path, base64, dataUrl, buffer)
   * @param {string} [params.task="describe"] - Targeted task ("ocr", "ui", "document", "chart", "error", "table", "scene", "describe")
   * @param {object} [params.options={}] - Options (temperature, providerOverride, modelId)
   */
  constructor({
    prompt = "",
    imageInput = null,
    task = "describe",
    options = {}
  } = {}) {
    this.prompt = String(prompt || "");
    this.promptLower = this.prompt.toLowerCase();
    this.imageInput = imageInput;
    this.task = this._inferTask(task, this.promptLower);
    this.options = options;
    this.timestamp = Date.now();
  }

  /**
   * Auto-detect vision task from prompt if default or underspecified.
   *
   * @param {string} specifiedTask
   * @param {string} promptLower
   * @returns {string}
   */
  _inferTask(specifiedTask, promptLower) {
    if (specifiedTask && specifiedTask !== "describe") return specifiedTask;

    if (promptLower.includes("ocr") || promptLower.includes("read text") || promptLower.includes("extract text")) {
      return "ocr";
    }
    if (promptLower.includes("ui") || promptLower.includes("screenshot") || promptLower.includes("button") || promptLower.includes("menu")) {
      return "ui";
    }
    if (promptLower.includes("error") || promptLower.includes("exception") || promptLower.includes("stack trace") || promptLower.includes("bug")) {
      return "error";
    }
    if (promptLower.includes("chart") || promptLower.includes("graph") || promptLower.includes("plot") || promptLower.includes("diagram")) {
      return "chart";
    }
    if (promptLower.includes("table") || promptLower.includes("rows") || promptLower.includes("columns")) {
      return "table";
    }
    if (promptLower.includes("document") || promptLower.includes("pdf") || promptLower.includes("invoice") || promptLower.includes("report") || promptLower.includes("receipt")) {
      return "document";
    }

    return "scene";
  }
}
