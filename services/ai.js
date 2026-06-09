import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.API_KEY
});

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1"
});

const openrouter = new OpenAI({
  apiKey:
    process.env.OPENROUTER_API_KEY,

  baseURL:
    "https://openrouter.ai/api/v1"
});

export async function askGemini(
  prompt
) {

  const response =
    await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

  return response.text;
}

export async function askGroq(
  prompt
) {

  const completion =
    await groq.chat.completions.create({
      model:
        "llama-3.3-70b-versatile",

      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    });

  return completion
    .choices[0]
    .message
    .content;
}

export async function askOpenRouter(
  prompt
) {

  const completion =
    await openrouter.chat.completions.create({
      model:
        "meta-llama/llama-3.3-70b-instruct",

      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    });

  return completion
    .choices[0]
    .message
    .content;
}

export async function askAI(
  prompt
) {

  try {

    console.log(
      "🟢 Using Groq..."
    );

    return await askGroq(prompt);

  } catch (err) {

    console.log(
      "🔴 Groq failed."
    );

    console.error(
      err.message
    );
  }

  try {

    console.log(
      "🟡 Using Gemini..."
    );

    return await askGemini(prompt);

  } catch (err) {

    console.log(
      "🔴 Gemini failed."
    );

    console.error(
      err.message
    );
  }

  try {

    console.log(
      "🔵 Using OpenRouter..."
    );

    return await askOpenRouter(
      prompt
    );

  } catch (err) {

    console.log(
      "🔴 OpenRouter failed."
    );

    console.error(
      err.message
    );
  }

  throw new Error(
    "All AI providers failed."
  );
}

export async function extractMemory(
  userMessage
) {

  const prompt = `
Extract personal facts from this message.

Message:
${userMessage}

Return JSON only.

Example:
{
  "favorite language": "Python"
}

If nothing important exists:
{}
`;

  const response =
    await askAI(prompt);

  try {

    return JSON.parse(
      response
    );

  } catch {

    return {};
  }
}