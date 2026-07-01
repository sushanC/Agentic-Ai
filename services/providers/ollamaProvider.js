import ollama from "ollama";

export const ollamaProvider = {
  maxContext: 8192,
  preferredContextSize: 6144,
  preferredHistorySize: 3,
  streamingSupport: true,
  reasoningSupport: false,
  estimateTokens(text) {
    return Math.ceil((text || "").length / 4);
  },
  async generate(modelId, prompt, options = {}) {
    try {
      const messages = [];
      if (options.systemPrompt) {
        messages.push({ role: "system", content: options.systemPrompt });
      }
      messages.push({ role: "user", content: prompt });

      const response = await ollama.chat({
        model: modelId,
        messages,
        options: {
          temperature: options.temperature ?? 0.3,
          num_predict: options.maxTokens,
        }
      });

      return response.message?.content || "";
    } catch (err) {
      throw new Error(`[Ollama Provider Error] ${err.message}`);
    }
  },

  async *stream(modelId, prompt, options = {}) {
    try {
      const messages = [];
      if (options.systemPrompt) {
        messages.push({ role: "system", content: options.systemPrompt });
      }
      messages.push({ role: "user", content: prompt });

      const responseStream = await ollama.chat({
        model: modelId,
        messages,
        stream: true,
        options: {
          temperature: options.temperature ?? 0.3,
          num_predict: options.maxTokens,
        }
      });

      for await (const part of responseStream) {
        const text = part.message?.content;
        if (text) {
          yield text;
        }
      }
    } catch (err) {
      throw new Error(`[Ollama Provider Error] ${err.message}`);
    }
  },

  async health(modelId) {
    try {
      await ollama.list();
      return true;
    } catch (err) {
      console.error(`Ollama provider health check failed:`, err.message);
      return false;
    }
  }
};
