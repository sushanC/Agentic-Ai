import {
  loadPDFMemory
} from "../storage/pdfStorage.js";

import {
  getEmbedding,
  cosineSimilarity
} from "./embeddingService.js";

import {
  askAI
} from "./ai.js";

import {
  incrementStat
} from "../storage/statsStorage.js";

/**
 * Find the best matching PDF for a question.
 *
 * Strategy:
 * 1. If only one PDF — use it directly.
 * 2. If multiple PDFs — score each by name similarity to the question.
 * 3. Fall back to the first PDF if no name match is found.
 */
async function findBestPDF(question) {

  const memory = await loadPDFMemory();
  const pdfNames = Object.keys(memory);

  if (pdfNames.length === 0) {
    return null;
  }

  if (pdfNames.length === 1) {
    return pdfNames[0];
  }

  // Score PDF names by keyword overlap with question
  const qWords = new Set(
    question.toLowerCase().split(/\W+/).filter(w => w.length > 3)
  );

  let bestName = pdfNames[0];
  let bestScore = 0;

  for (const name of pdfNames) {

    const nameWords = name
      .toLowerCase()
      .replace(/[_\-\.]/g, " ")
      .split(/\W+/)
      .filter(w => w.length > 3);

    let score = 0;

    for (const w of nameWords) {
      if (qWords.has(w)) score++;
    }

    if (score > bestScore) {
      bestScore = score;
      bestName = name;
    }
  }

  return bestName;
}

/**
 * Determine whether the message is a
 * multi-step agent request.
 */
function isAgentRequest(text) {

  console.log("\n🤖 AGENT CHECK:");
  console.log(text);

  return (
    text.includes("and create") ||
    text.includes("and save") ||
    text.includes("create tasks") ||
    text.includes("save as notes") ||
    text.includes("find and save") ||
    text.includes("research and") ||
    text.includes("research")
  );
}

export async function routeRequest(
  message
) {

  const text = message.toLowerCase();

  // =====================
  // AGENT MODE
  // =====================

  if (isAgentRequest(text)) {

    console.log("\n🚀 AGENT MODE");

    const { planActions } =
      await import("./actionPlanner.js");
    const { executeActions } =
      await import("./actionExecutor.js");

    const plan = await planActions(message);

    console.log("\n📋 PLAN:");
    console.log(JSON.stringify(plan, null, 2));

    const result = await executeActions(plan);

    return {
      tool: "agent",
      answer: result.join("\n")
    };
  }

  // =====================
  // NORMAL ROUTER
  // (AI-driven tool decision)
  // =====================

  const { decideTool } =
    await import("./agentRouter.js");

  const aiTool = await decideTool(message);

  console.log("\n🤖 AI Router:");
  console.log(aiTool);

  // =====================
  // SHOW MEMORY
  // =====================

  if (text === "show memory") {

    const { loadMemory } =
      await import("../storage/memoryStorage.js");

    const memory = await loadMemory();

    return {
      tool: "memory",
      answer: JSON.stringify(memory, null, 2)
    };
  }

  // =====================
  // WEB SEARCH
  // =====================

  if (aiTool === "web") {

    console.log("\n🌐 WEB TOOL TRIGGERED");

    const { handleWeb } =
      await import("../handlers/webHandler.js");

    const answer = await handleWeb(
      `web search ${message}`
    );

    return {
      tool: "web",
      answer
    };
  }

  // =====================
  // PDF TOOL
  // =====================

  if (aiTool === "pdf") {

    const pdfName = await findBestPDF(message);

    if (!pdfName) {
      return {
        tool: "pdf",
        answer: "No PDFs uploaded yet. Please upload a PDF first."
      };
    }

    console.log("\n📄 Selected PDF:", pdfName);
    console.log("\n🤖 PDF Tool Triggered");

    const { askPDF } =
      await import("./pdfQAService.js");

    const answer = await askPDF(pdfName, message);

    return {
      tool: "pdf",
      answer
    };
  }

  // =====================
  // TASK TOOL
  // =====================

  if (
    text.startsWith("add task") ||
    aiTool === "task"
  ) {

    const { loadTasks, saveTasks } =
      await import("../storage/tasksStorage.js");

    const taskText = message
      .replace(/add task/i, "")
      .trim();

    const tasks = await loadTasks();

    tasks.push({
      id: Date.now(),
      text: taskText,
      completed: false
    });

    await saveTasks(tasks);

    await incrementStat("tasks_created");

    return {
      tool: "task",
      answer: `✅ Task added: ${taskText}`
    };
  }

  // =====================
  // MEMORY — REMEMBER
  // =====================

  if (text.startsWith("remember")) {

    const { updateMemory } =
      await import("./memoryService.js");

    const memoryText = message
      .replace(/remember/i, "")
      .trim();

    await updateMemory(memoryText);

    return {
      tool: "memory",
      answer: `🧠 Memory updated: ${memoryText}`
    };
  }

  // =====================
  // MEMORY — FORGET
  // =====================

  if (text.startsWith("forget ")) {

    const { deleteMemoryKey } =
      await import("../storage/memoryStorage.js");

    const key = message
      .replace(/forget/i, "")
      .trim();

    await deleteMemoryKey(key);

    return {
      tool: "memory",
      answer: `🧠 Forgot: ${key}`
    };
  }

  // =====================
  // NOTE TOOL
  // =====================

  if (aiTool === "note") {

    const { loadNotes, saveNotes } =
      await import("../storage/notesStorage.js");

    const notes = await loadNotes();

    notes.push({
      id: Date.now(),
      content: message
    });

    await saveNotes(notes);

    await incrementStat("notes_saved");

    return {
      tool: "note",
      answer: `📝 Note saved.`
    };
  }

  // =====================
  // NORMAL CHAT
  // =====================

  const { askAI } = await import("./ai.js");

  const answer = await askAI(message);

  return {
    tool: "chat",
    answer
  };
}