import OpenAI from "openai";

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
      maxRetries: 3
    });
  }
  return openrouterClient;
}

export const openRouterProvider = {
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
      throw new Error(`[OpenRouter Provider Error] ${err.message}`);
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
      throw new Error(`[OpenRouter Provider Error] ${err.message}`);
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
