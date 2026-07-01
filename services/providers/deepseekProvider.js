import OpenAI from "openai";

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
      maxRetries: 3
    });
  }
  return deepseekClient;
}

export const deepseekProvider = {
  maxContext: 64000,
  preferredContextSize: 32000,
  preferredHistorySize: 3,
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
      throw new Error(`[DeepSeek Provider Error] ${err.message}`);
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
      throw new Error(`[DeepSeek Provider Error] ${err.message}`);
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
