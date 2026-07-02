import OpenAI from "openai";
import { classifyProviderError } from "../cie/ProviderErrorClassifier.js";

let deepseekClient = null;

function getClient() {
  if (!deepseekClient) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error("[DeepSeek Provider Error] DeepSeek API Key not configured. Please set DEEPSEEK_API_KEY in your .env file.");
    }
    deepseekClient = new OpenAI({
      apiKey,
      baseURL: "https://api.deepseek.com",
      maxRetries: 0 // RetryPolicyEngine handles retries
    });
  }
  return deepseekClient;
}

export const deepseekProvider = {
  maxContext: 64000,
  safetyMargin: 0.1,
  preferredContextSize: 32000,
  preferredHistoryLength: 3,
  preferredSummaryLength: 600,
  maxRetries: 3,
  compressionStrategy: "history-first",
  streamingSupport: true,
  reasoningSupport: true,
  estimateTokens(text) {
    return Math.ceil((text || "").length / 4);
  },
  async generate(modelId, prompt, options = {}) {
    try {
      const client = getClient();
      const messages = [];
      if (options.systemPrompt) {
        messages.push({ role: "system", content: options.systemPrompt });
      }
      messages.push({ role: "user", content: prompt });

      const completion = await client.chat.completions.create({
        model: modelId,
        messages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 4096,
      });

      return completion.choices[0]?.message?.content || "";
    } catch (err) {
      throw classifyProviderError("deepseek", err);
    }
  },

  async *stream(modelId, prompt, options = {}) {
    try {
      const client = getClient();
      const messages = [];
      if (options.systemPrompt) {
        messages.push({ role: "system", content: options.systemPrompt });
      }
      messages.push({ role: "user", content: prompt });

      const stream = await client.chat.completions.create({
        model: modelId,
        messages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 4096,
        stream: true,
      });

      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) {
          yield text;
        }
      }
    } catch (err) {
      throw classifyProviderError("deepseek", err);
    }
  },

  async health(modelId) {
    try {
      const client = getClient();
      await client.chat.completions.create({
        model: modelId,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1
      });
      return true;
    } catch (err) {
      console.error(`DeepSeek provider health check failed for ${modelId}:`, err.message);
      return false;
    }
  }
};
