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

    async function loadTasks() {
  try {
    const data = await fs.readFile(
      "./tasks.json",
      "utf-8"
    );

    return JSON.parse(data);

  } catch {
    return [];
  }
}

async function saveTasks(tasks) {
  await fs.writeFile(
    "./tasks.json",
    JSON.stringify(tasks, null, 2)
  );
}

async function loadNotes() {
  try {
    const data = await fs.readFile(
      "./notes.json",
      "utf-8"
    );

    return JSON.parse(data);

  } catch {
    return [];
  }
}

async function saveNotes(notes) {
  await fs.writeFile(
    "./notes.json",
    JSON.stringify(notes, null, 2)
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

    if (
  userMessage.toLowerCase() ===
  "daily review"
) {

  const tasks = await loadTasks();
  const notes = await loadNotes();

  const completed = tasks.filter(
    t => t.status === "completed"
  );

  const pending = tasks.filter(
    t => t.status === "pending"
  );

  const prompt = `
You are my productivity coach.

Profile:
${JSON.stringify(profile, null, 2)}

Completed Tasks:
${completed.map(t => t.task).join("\n")}

Pending Tasks:
${pending.map(t => t.task).join("\n")}

Recent Notes:
${notes
  .slice(-5)
  .map(n => n.content)
  .join("\n")}

Write:

1. Progress Summary
2. Key Achievement
3. Biggest Bottleneck
4. Recommendation for Tomorrow

Keep it concise.
`;

  const review =
    await askAI(prompt);

  console.log(
    "\n📊 Daily Review\n"
  );

  console.log(review);
  console.log();

  continue;
}
   
    if (
  userMessage.toLowerCase().startsWith(
    "search notes "
  )
) {

  const query = userMessage
    .replace(/^search notes /i, "")
    .trim()
    .toLowerCase();

  const notes = await loadNotes();

  const results = notes.filter(
    note =>
      note.content
        .toLowerCase()
        .includes(query)
  );

  if (results.length === 0) {

    console.log(
      "\nAI: No matching notes found.\n"
    );

    continue;
  }

  console.log(
    "\n🔍 Matching Notes:\n"
  );

  results.forEach(note => {
    console.log(
      `${note.id} - ${note.content}`
    );
  });

  console.log();

  continue;
}
if (
  userMessage.toLowerCase().startsWith(
    "delete note "
  )
) {

  const noteId = Number(
    userMessage.replace(
      /^delete note /i,
      ""
    ).trim()
  );

  const notes = await loadNotes();

  const updatedNotes =
    notes.filter(
      note => note.id !== noteId
    );

  if (
    updatedNotes.length === notes.length
  ) {

    console.log(
      "\nAI: Note not found.\n"
    );

    continue;
  }

  await saveNotes(updatedNotes);

  console.log(
    `\n🗑️ Deleted note ${noteId}\n`
  );

  continue;
}

 if (
  userMessage.toLowerCase().startsWith(
    "ask notes "
  )
) {

  const question = userMessage
    .replace(/^ask notes /i, "")
    .trim();

  const notes = await loadNotes();

  if (notes.length === 0) {

    console.log(
      "\nAI: No notes found.\n"
    );

    continue;
  }

  const questionWords =
  question.toLowerCase().split(" ");

const matchingNotes = notes.filter(
  note =>
    questionWords.some(word =>
      note.content
        .toLowerCase()
        .includes(word)
    )
);

const relevantNotes =
  matchingNotes.length > 0
    ? matchingNotes
        .map(note => note.content)
        .join("\n")
    : "";

  const prompt = `
You are answering using ONLY
the user's notes.

User Notes:
${relevantNotes}

Question:
${question}

Answer using the notes.
If the answer is not in the notes,
say "I couldn't find that in your notes."
`;

  const answer =
    await askAI(prompt);

  console.log(
    "\n📚 Notes Answer:\n"
  );

  console.log(answer);
  console.log();

  continue;
}


    if (
  userMessage.toLowerCase().startsWith(
    "save note "
  )
) {

  const noteContent =
    userMessage.replace(
      /^save note /i,
      ""
    );

  const notes =
    await loadNotes();

notes.push({
  id: notes.length + 1,
  content: noteContent
});

  await saveNotes(notes);

  console.log(
    "\n📝 Note saved.\n"
  );

  continue;
}

if (
  userMessage.toLowerCase() ===
  "show notes"
) {

  const notes =
    await loadNotes();

  if (notes.length === 0) {

    console.log(
      "\nAI: No notes found.\n"
    );

    continue;
  }
  console.log(
    "\n📝 Notes:\n"
  );

  notes.forEach(note => {
    console.log(
      `${note.id} - ${note.content}`
    );
  });

  console.log();

  continue;
}
    if (
  userMessage.toLowerCase() ===
  "show plan"
) {

  try {

    const plan =
      await fs.readFile(
        "./day_plan.txt",
        "utf-8"
      );

    console.log(
      "\n📅 Today's Plan:\n"
    );

    console.log(plan);
    console.log();

  } catch {

    console.log(
      "\nAI: No plan found.\n"
    );
  }

  continue;
}

    if (
  userMessage.toLowerCase() ===
  "plan my day"
) {

  const tasks = await loadTasks();

  const pendingTasks = tasks.filter(
    t => t.status === "pending"
  );

  if (pendingTasks.length === 0) {

    console.log(
      "\nAI: No pending tasks found.\n"
    );

    continue;
  }

  const prompt = `
You are a productivity planner.

User Profile:
${JSON.stringify(profile, null, 2)}

Pending Tasks:
${pendingTasks
  .map(t => t.task)
  .join("\n")}

Create a realistic day plan.

Requirements:
- Start at 9 AM
- Include short breaks
- Prioritize important career tasks
- Include exercise if available
- Return schedule in time blocks

Keep it practical.
`;

  const dayPlan =
    await askAI(prompt);
    await fs.writeFile(
  "./day_plan.txt",
  dayPlan
);

  console.log(
    "\n📅 Today's Plan:\n"
  );

  console.log(dayPlan);
  console.log();

  continue;
}
    if (
  userMessage.toLowerCase() ===
  "recommend next task"
) {

  const tasks = await loadTasks();

  const pendingTasks = tasks.filter(
    t => t.status === "pending"
  );

  if (pendingTasks.length === 0) {

    console.log(
      "\nAI: No pending tasks found.\n"
    );

    continue;
  }

const prompt = `
You are a productivity coach.

User Profile:
${JSON.stringify(profile, null, 2)}

Pending Tasks:
${pendingTasks
  .map(t => t.task)
  .join("\n")}

Recommend:

1. The single best task to do next.
2. Why it should be done next.
3. The next 3 tasks in order.

Keep the answer concise.
`;

  const recommendation =
    await askAI(prompt);

  console.log(
    "\n🎯 Recommendation:\n"
  );

  console.log(recommendation);
  console.log();

  continue;
}
    if (
  userMessage.toLowerCase() ===
  "pending tasks"
) {

  const tasks =
    await loadTasks();

  const pending =
    tasks.filter(
      t => t.status === "pending"
    );

  console.log(
    "\n📋 Pending Tasks:\n"
  );

  pending.forEach(
    (t, index) => {
      console.log(
        `${index + 1}. ${t.task}`
      );
    }
  );

  console.log();

  continue;
}

if (
  userMessage.toLowerCase() ===
  "completed tasks"
) {

  const tasks =
    await loadTasks();

  const completed =
    tasks.filter(
      t => t.status === "completed"
    );

  console.log(
    "\n✅ Completed Tasks:\n"
  );
  if (completed.length === 0) {
  console.log("\nAI: No completed tasks.\n");
  continue;
}

  completed.forEach(
    (t, index) => {
      console.log(
        `${index + 1}. ${t.task}`
      );
    }
  );

  console.log();

  continue;
}

if (
  userMessage.toLowerCase() ===
  "task stats"
) {

  const tasks =
    await loadTasks();

  const completed =
    tasks.filter(
      t => t.status === "completed"
    ).length;

  const pending =
    tasks.filter(
      t => t.status === "pending"
    ).length;

  console.log("\n📊 Task Stats\n");

  console.log(
    `Total: ${tasks.length}`
  );

  console.log(
    `Completed: ${completed}`
  );

  console.log(
    `Pending: ${pending}`
  );
  const progress =
  tasks.length === 0
    ? 0
    : ((completed / tasks.length) * 100).toFixed(1);

console.log(
  `Progress: ${progress}%`
);

  console.log();

  continue;
}
    if (
  userMessage.toLowerCase().startsWith(
    "complete task "
  )
) {

  const taskName = userMessage
    .replace(/^complete task /i, "")
    .trim();

  const tasks = await loadTasks();

  const task = tasks.find(
    t =>
      t.task.toLowerCase() ===
      taskName.toLowerCase()
  );

  if (!task) {

    console.log(
      "\nAI: Task not found.\n"
    );

    continue;
  }

  task.status = "completed";

  await saveTasks(tasks);

  console.log(
    `\nAI: Marked "${taskName}" as completed.\n`
  );

  continue;
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

  const tasks = await loadTasks();

  const pendingTasks = tasks.filter(
    t => t.status === "pending"
  );

  if (pendingTasks.length === 0) {

    console.log(
      "\nAI: No pending tasks found.\n"
    );

    continue;
  }

  const prompt = `
You are a productivity assistant.

Given these pending tasks:

${pendingTasks
  .map(t => t.task)
  .join("\n")}

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

  const tasks = await loadTasks();

  console.log("\n📋 Tasks:\n");
  if (tasks.length === 0) {
  console.log(
    "\nAI: No tasks found.\n"
  );
  continue;
}
  tasks.forEach((t, index) => {
    console.log(
      `${index + 1}. ${t.task} (${t.status})`
    );
  });

  console.log();

  continue;
}

if (
  userMessage.toLowerCase().startsWith(
    "add task "
  )
) {

  const taskName = userMessage
    .replace(/^add task /i, "")
    .trim();

  const tasks = await loadTasks();

  const exists = tasks.some(
  t => t.task.toLowerCase() === taskName.toLowerCase()
);

if (exists) {
  console.log("\nAI: Task already exists.\n");
  continue;
}

tasks.push({
  task: taskName,
  status: "pending"
});

  await saveTasks(tasks);

  console.log(
    `\nAI: Added task "${taskName}"\n`
  );

  continue;
}
if (
  userMessage.toLowerCase().startsWith(
    "remove task "
  )
) {

  const taskName = userMessage
    .replace(/^remove task /i, "")
    .trim();

  const tasks = await loadTasks();

  const updatedTasks = tasks.filter(
    t =>
      t.task.toLowerCase() !==
      taskName.toLowerCase()
  );

  await saveTasks(updatedTasks);

  console.log(
    `\nAI: Removed "${taskName}"\n`
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