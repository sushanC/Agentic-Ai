import { VisionProvider } from "../VisionProvider.js";

/**
 * OllamaVisionProvider.js
 *
 * Local Multimodal Vision Provider using Ollama models (LLaVA, minicpm-v).
 */
export class OllamaVisionProvider extends VisionProvider {
  constructor() {
    super("ollama", "Ollama Local Vision", 70);
    this.baseUrl = process.env.OLLAMA_HOST || "http://localhost:11434";
  }

  async analyze(images, prompt, options = {}) {
    const model = options.modelId || "llava";
    const imagePayloads = images.map(img => img.base64);

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        images: imagePayloads,
        stream: false
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama Vision Error [${response.status}]: ${errText}`);
    }

    const data = await response.json();
    return {
      rawText: data.response || "",
      model,
      provider: this.name
    };
  }

  async health() {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      return res.ok;
    } catch {
      return false;
    }
  }
}
