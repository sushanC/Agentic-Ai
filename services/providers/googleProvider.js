import { GoogleGenAI } from "@google/genai";

let aiClient = null;

function getClient() {
  if (!aiClient) {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      throw new Error("[Google Provider Error] Google API Key not configured. Please set GOOGLE_API_KEY or API_KEY in your .env file.");
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

export const googleProvider = {
  maxContext: 1000000,
  preferredContextSize: 100000,
  preferredHistorySize: 10,
  streamingSupport: true,
  reasoningSupport: false,
  estimateTokens(text) {
    return Math.ceil((text || "").length / 4);
  },
  async generate(modelId, prompt, options = {}) {
    try {
      const ai = getClient();
      const response = await ai.models.generateContent({
        model: modelId,
        contents: prompt,
        config: {
          systemInstruction: options.systemPrompt,
          temperature: options.temperature,
          maxOutputTokens: options.maxTokens,
        }
      });
      return response.text;
    } catch (err) {
      throw new Error(`[Google Provider Error] ${err.message}`);
    }
  },

  async *stream(modelId, prompt, options = {}) {
    try {
      const ai = getClient();
      const responseStream = await ai.models.generateContentStream({
        model: modelId,
        contents: prompt,
        config: {
          systemInstruction: options.systemPrompt,
          temperature: options.temperature,
          maxOutputTokens: options.maxTokens,
        }
      });
      for await (const chunk of responseStream) {
        if (chunk.text) {
          yield chunk.text;
        }
      }
    } catch (err) {
      throw new Error(`[Google Provider Error] ${err.message}`);
    }
  },

  async health(modelId) {
    try {
      const ai = getClient();
      await ai.models.generateContent({
        model: modelId,
        contents: "ping",
        config: { maxOutputTokens: 1 }
      });
      return true;
    } catch (err) {
      console.error(`Google provider health check failed for ${modelId}:`, err.message);
      return false;
    }
  }
};
