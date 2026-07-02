import { GoogleGenAI } from "@google/genai";
import { classifyProviderError } from "../cie/ProviderErrorClassifier.js";

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
  safetyMargin: 0.05,
  preferredContextSize: 100000,
  preferredHistoryLength: 15,
  preferredSummaryLength: 1500,
  maxRetries: 3,
  compressionStrategy: "history-first",
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
      throw classifyProviderError("google", err);
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
      throw classifyProviderError("google", err);
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
