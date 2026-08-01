import { VisionProvider } from "../VisionProvider.js";
import { GoogleGenAI } from "@google/genai";

/**
 * GeminiVisionProvider.js
 *
 * Multimodal Vision Provider using Google Gemini models.
 */
export class GeminiVisionProvider extends VisionProvider {
  constructor() {
    super("gemini", "Google Gemini Vision", 90);
    this.client = null;
  }

  _getClient() {
    if (!this.client) {
      const apiKey = process.env.GOOGLE_API_KEY || process.env.API_KEY;
      if (!apiKey) {
        throw new Error("[GeminiVisionProvider] Google API Key not configured.");
      }
      this.client = new GoogleGenAI({ apiKey });
    }
    return this.client;
  }

  async analyze(images, prompt, options = {}) {
    const ai = this._getClient();
    const model = options.modelId || "gemini-2.5-flash";

    const parts = images.map(img => ({
      inlineData: {
        data: img.base64,
        mimeType: img.mime || "image/png"
      }
    }));

    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model,
      contents: parts,
      config: {
        systemInstruction: options.systemPrompt,
        temperature: options.temperature ?? 0.2,
        maxOutputTokens: options.maxTokens ?? 4096,
      }
    });

    return {
      rawText: response.text || "",
      model,
      provider: this.name
    };
  }

  async health() {
    try {
      this._getClient();
      return true;
    } catch {
      return false;
    }
  }
}
