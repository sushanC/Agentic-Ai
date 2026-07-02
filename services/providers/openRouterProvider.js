import OpenAI from "openai";
import { classifyProviderError } from "../cie/ProviderErrorClassifier.js";

let openrouterClient = null;

function getClient() {
  if (!openrouterClient) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("[OpenRouter Provider Error] OpenRouter API Key not configured. Please set OPENROUTER_API_KEY in your .env file.");
    }
    openrouterClient = new OpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      maxRetries: 0 // RetryPolicyEngine handles retries
    });
  }
  return openrouterClient;
}

export const openRouterProvider = {
  maxContext: 128000,
  safetyMargin: 0.1,
  preferredContextSize: 64000,
  preferredHistoryLength: 5,
  preferredSummaryLength: 600,
  maxRetries: 3,
  compressionStrategy: "history-first",
  streamingSupport: true,
  reasoningSupport: false,
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
      throw classifyProviderError("openrouter", err);
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
      throw classifyProviderError("openrouter", err);
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
      console.error(`OpenRouter provider health check failed for ${modelId}:`, err.message);
      return false;
    }
  }
};
