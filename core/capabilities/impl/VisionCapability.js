import { BaseCapability } from "../BaseCapability.js";
import { CapabilityResult } from "../CapabilityResult.js";
import { visionManager } from "../../vision/VisionManager.js";

/**
 * VisionCapability.js
 *
 * Lightweight integration facade connecting the Capability Framework
 * and Workflow Engine to the core/vision/ Vision Framework subsystem.
 *
 * Contains NO business logic, OCR logic, image logic, or provider logic.
 */
export class VisionCapability extends BaseCapability {
  constructor() {
    super("vision", "Vision & Visual Processing Capability", 85);
  }

  canHandle(context) {
    if (context.includesAny(
      "analyze image", "describe image", "ocr", "read text from image",
      "extract text from image", "visual analysis", "explain screenshot",
      "analyze chart", "analyze diagram", "read terminal", "explain ui"
    )) {
      return 0.90;
    }
    return 0.0;
  }

  async execute(context) {
    const imageInput = context.workingMemory?.images || context.runtimeState?.imageInput || context.prompt;
    const task = context.runtimeState?.task || "describe";

    const visionResult = await visionManager.processVisionRequest(
      context.prompt,
      imageInput,
      { task }
    );

    return CapabilityResult.create({
      success: visionResult.success,
      capability: this.name,
      tool: "vision",
      answer: visionResult.summary,
      executedSteps: [{
        name: `vision_${visionResult.task}`,
        status: visionResult.success ? "completed" : "failed"
      }],
      diagnostics: {
        provider: visionResult.provider,
        model: visionResult.model,
        confidence: visionResult.confidence
      },
      metadata: {
        task: visionResult.task,
        parsedAnalysis: visionResult.parsedAnalysis
      }
    });
  }
}
