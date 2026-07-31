import { BaseCapability } from "../BaseCapability.js";
import { CapabilityResult } from "../CapabilityResult.js";
import { askAI } from "../../../services/ai.js";

/**
 * VisionCapability.js
 *
 * Handles image analysis, OCR, visual inspection, and multimodal requests.
 */
export class VisionCapability extends BaseCapability {
  constructor() {
    super("vision", "Vision & Visual Processing Capability", 85);
  }

  canHandle(context) {
    if (context.includesAny("analyze image", "describe image", "ocr", "read text from image", "extract text from image", "visual analysis")) {
      return 0.90;
    }
    return 0.0;
  }

  async execute(context) {
    const answer = await askAI(context.prompt, context.toolContext);
    return CapabilityResult.create({
      capability: this.name,
      tool: "vision",
      answer,
      executedSteps: [{ name: "vision_ocr_analysis", status: "completed" }],
    });
  }
}
