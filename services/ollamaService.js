import ollama from "ollama";

export async function askOllama(
  prompt
) {

  const response =
    await ollama.chat({

      model:
        "qwen3:8b",

      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    });

  return response
    .message
    .content;
}