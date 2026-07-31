import { BaseCapability } from "../BaseCapability.js";
import { CapabilityResult } from "../CapabilityResult.js";
import { askAI } from "../../../services/ai.js";

/**
 * VoiceCapability.js
 *
 * Handles spoken-first, Markdown-free voice assistant responses.
 */
export class VoiceCapability extends BaseCapability {
  constructor() {
    super("voice", "Voice Assistant Capability", 80);
  }

  canHandle(context) {
    if (context.toolContext === "voice") {
      return 0.95;
    }
    return 0.0;
  }

  async execute(context) {
    const answer = await askAI(context.prompt, "voice");
    return CapabilityResult.create({
      capability: this.name,
      tool: "voice",
      answer,
      executedSteps: [{ name: "voice_speech_generation", status: "completed" }],
    });
  }
}
