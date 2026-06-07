import 'dotenv/config';
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import fs from "fs/promises";
import readline from "readline";

// =====================
// AI Clients
// =====================

const ai = new GoogleGenAI({
  apiKey: process.env.API_KEY
});

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1"
});

// =====================
// Memory Functions
// =====================

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

async function saveProfile(profile) {
  await fs.writeFile(
    "./memory/profile.json",
    JSON.stringify(profile, null, 2)
  );
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

// =====================
// AI Router
// =====================

async function askAI(prompt) {
  try {

    console.log("🟢 Using Gemini...");

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    return response.text;

  } catch (err) {

    console.log("🔴 Gemini failed.");
    console.log("🟣 Switching to Groq...");

    const completion =
      await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      });

    return completion.choices[0].message.content;
  }
}

// =====================
// Readline Helper
// =====================

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

// =====================
// Main Agent
// =====================
async function readTasks() {
  try {
    const data = await fs.readFile(
      "./tasks.txt",
      "utf-8"
    );

    return data.split("\n").filter(Boolean);

  } catch {
    return [];
  }
}
async function readSortedTasks() {
  try {
    return await fs.readFile(
      "./sorted_tasks.txt",
      "utf-8"
    );
  } catch {
    return null;
  }
}

async function saveTasks(tasks) {
  await fs.writeFile(
    "./tasks.txt",
    tasks.join("\n")
  );
}
async function main() {

  const profile = await loadProfile();
  const history = await loadHistory();

  console.log("🤖 Personal Agent Started");
  console.log("Type 'bye' to quit.\n");

  while (true) {

    const userMessage = await ask("You: ");

    if (userMessage.toLowerCase() === "bye") {
      console.log("👋 Goodbye!");
      break;
    }

    if (userMessage.toLowerCase() === "show sorted tasks") {

  const sortedTasks =
    await readSortedTasks();

  if (!sortedTasks) {

    console.log(
      "\nAI: No sorted tasks found. Run 'sort tasks' first.\n"
    );

    continue;
  }

  console.log("\n📋 Sorted Tasks:\n");
  console.log(sortedTasks);
  console.log();

  continue;
}

    if (userMessage.toLowerCase() === "sort tasks") {

  const tasks = await readTasks();

  if (tasks.length === 0) {
    console.log("\nAI: No tasks found.\n");
    continue;
  }

  const prompt = `
You are a productivity assistant.

Given these tasks:

${tasks.join("\n")}

Categorize them into:

1. High Priority
2. Medium Priority
3. Low Priority

Explain each task in 5 words or less.

Return the result in a clean format.
`;

  const sortedTasks = await askAI(prompt);

  await fs.writeFile(
    "./sorted_tasks.txt",
    sortedTasks
  );

  console.log("\n📋 Sorted Tasks:\n");
  console.log(sortedTasks);

  console.log(
    "\n✅ Saved to sorted_tasks.txt\n"
  );

  continue;
}


    if (userMessage.toLowerCase() === "show tasks") {

  const tasks = await readTasks();

  console.log("\nTasks:\n");

  tasks.forEach((task, index) => {
    console.log(`${index + 1}. ${task}`);
  });

  console.log();

  continue;
}

if (
  userMessage.toLowerCase().startsWith(
    "add task "
  )
) {

  const task = userMessage
    .replace(/^add task /i, "")
    .trim();

  const tasks = await readTasks();

  tasks.push(task);

  await saveTasks(tasks);

  console.log(
    `\nAI: Added task "${task}"\n`
  );

  continue;
}
if (
  userMessage.toLowerCase().startsWith(
    "remove task "
  )
) {

  const task = userMessage
    .replace(/^remove task /i, "")
    .trim();

  const tasks = await readTasks();

  const updatedTasks =
    tasks.filter(t => t.toLowerCase() !== task.toLowerCase());

  await saveTasks(updatedTasks);

  console.log(
    `\nAI: Removed task "${task}"\n`
  );

  continue;
}

    // =====================
    // REMEMBER COMMAND
    // =====================

    if (userMessage.toLowerCase().startsWith("remember ")) {

      const content =
        userMessage.replace(/^remember\s+/i, "");

      const [key, value] =
        content.split("=");

      if (!key || !value) {

        console.log(
          "\nAI: Use format -> remember key = value\n"
        );

        continue;
      }

      const memoryKey =
        key.trim().toLowerCase();

      profile[memoryKey] =
        value.trim();

      await saveProfile(profile);

      history.push({
        role: "user",
        content: userMessage
      });

      history.push({
        role: "assistant",
        content:
          `I've remembered that ${memoryKey} is ${value.trim()}`
      });

      await saveHistory(history);

      console.log(
        `\nAI: I've remembered that ${memoryKey} is ${value.trim()}.\n`
      );

      continue;
    }

    // =====================
    // SHOW MEMORY
    // =====================

    if (
      userMessage.toLowerCase() ===
      "what do you know about me"
    ) {

      console.log("\nAI:\n");

      for (const key in profile) {
        console.log(`${key}: ${profile[key]}`);
      }

      console.log();

      continue;
    }

    // =====================
    // RECALL MEMORY
    // =====================

    if (
      userMessage.toLowerCase().startsWith(
        "what is my "
      )
    ) {

      const key = userMessage
        .replace(/^what is my /i, "")
        .trim();

      const memoryKey =
        key.toLowerCase();

      if (profile[memoryKey]) {

        console.log(
          `\nAI: Your ${key} is ${profile[memoryKey]}.\n`
        );

      } else {

        console.log(
          `\nAI: I don't know your ${key} yet.\n`
        );
      }

      continue;
    }

    // =====================
    // NORMAL AI CHAT
    // =====================

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

      const responseText =
        await askAI(prompt);

      console.log(
        "\nAI:",
        responseText,
        "\n"
      );

      history.push({
        role: "user",
        content: userMessage
      });

      history.push({
        role: "assistant",
        content: responseText
      });

      await saveHistory(history);

    } catch (err) {

      console.error(
        "Error:",
        err.message
      );
    }
  }

  rl.close();
}

main();