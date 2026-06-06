import 'dotenv/config';
import { GoogleGenAI } from "@google/genai";
import fs from "fs/promises";
import readline from "readline";

const ai = new GoogleGenAI({
  apiKey: process.env.API_KEY
});

// ---------------------
// Memory Functions
// ---------------------

async function loadProfile() {
  try {
    const data = await fs.readFile(
      "./memory/profile.json",
      "utf-8"
    );

    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function loadHistory() {
  try {
    const data = await fs.readFile(
      "./memory/chat_history.json",
      "utf-8"
    );

    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveHistory(history) {
  await fs.writeFile(
    "./memory/chat_history.json",
    JSON.stringify(history, null, 2)
  );
}

// ---------------------
// Readline Helper
// ---------------------

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

// ---------------------
// Main Agent
// ---------------------

async function main() {
  const profile = await loadProfile();
  const history = await loadHistory();

  console.log("🤖 Personal Agent Started");
  console.log("Type 'exit' to quit.\n");

  while (true) {
    const userMessage = await ask("You: ");

    if (userMessage.toLowerCase() === "exit") {
      console.log("👋 Goodbye!");
      break;
    }

    const prompt = `
You are a personal AI assistant.

User Profile:
${JSON.stringify(profile, null, 2)}

Recent Conversation:
${JSON.stringify(history.slice(-10), null, 2)}

Current User Message:
${userMessage}

Answer naturally and use memory when relevant.
`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });

      console.log("\nAI:", response.text, "\n");

      history.push({
        role: "user",
        content: userMessage
      });

      history.push({
        role: "assistant",
        content: response.text
      });

      await saveHistory(history);

    } catch (err) {
      console.error("Error:", err.message);
    }
  }

  rl.close();
}

main();