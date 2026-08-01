import { VisionProvider } from "../VisionProvider.js";

/**
 * OpenAIVisionProvider.js
 *
 * Multimodal Vision Provider using OpenAI GPT-4o models.
 */
export class OpenAIVisionProvider extends VisionProvider {
  constructor() {
    super("openai", "OpenAI GPT-4o Vision", 80);
  }

  async analyze(images, prompt, options = {}) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("[OpenAIVisionProvider] OPENAI_API_KEY not configured.");
    }

    const model = options.modelId || "gpt-4o";
    const imageContent = images.map(img => ({
      type: "image_url",
      image_url: { url: img.dataUrl }
    }));

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          ...(options.systemPrompt ? [{ role: "system", content: options.systemPrompt }] : []),
          {
            role: "user",
            content: [{ type: "text", text: prompt }, ...imageContent]
          }
        ],
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 4096
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI Vision Error [${response.status}]: ${errText}`);
    }

    const data = await response.json();
    const rawText = data.choices?.[0]?.message?.content || "";

    return {
      rawText,
      model,
      provider: this.name
    };
  }

  async health() {
    return Boolean(process.env.OPENAI_API_KEY);
  }
}
