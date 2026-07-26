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

import { emitDevEvent, beginRequest } from "./developerBridge.js";

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
    text.includes("research") ||
    // Phase 3 — Email tool triggers
    text.includes("send email") ||
    text.includes("draft email") ||
    text.includes("write email") ||
    text.includes("compose email") ||
    text.includes("send an email") ||
    text.includes("draft an email") ||
    text.includes("email to ") ||
    // Phase 2 — Desktop Control triggers
    isDesktopRequest(text)
  );
}

/**
 * isDesktopRequest(text)
 *
 * Phase 2 — Desktop Control Framework
 *
 * Detects natural language intent to control the desktop.
 * When true, the request is routed through the Planner so the
 * correct desktop tool is selected from the Tool Registry.
 *
 * Covers: app launching, file operations, system control,
 * screenshots, clipboard, volume, brightness, search.
 */
function isDesktopRequest(text) {

  // App launching
  if (
    text.startsWith("open ")           ||
    text.startsWith("launch ")         ||
    text.startsWith("start ")          ||
    text.includes("open vs code")      ||
    text.includes("open vscode")       ||
    text.includes("open chrome")       ||
    text.includes("open terminal")     ||
    text.includes("launch spotify")    ||
    text.includes("launch discord")    ||
    text.includes("open application")  ||
    text.includes("open app ")
  ) return true;

  // File operations
  if (
    text.includes("create folder")     ||
    text.includes("make folder")       ||
    text.includes("new folder")        ||
    text.includes("rename file")       ||
    text.includes("rename the file")   ||
    text.includes("move file")         ||
    text.includes("move the file")     ||
    text.includes("copy file")         ||
    text.includes("copy the file")     ||
text.includes("delete file") ||
text.includes("delete a file") ||
text.includes("delete the file")   ||
    text.includes("duplicate file")    ||
    text.includes("compress file")     ||
    text.includes("zip file")          ||
    text.includes("unzip file")        ||
    text.includes("extract file")      ||
    text.includes("reveal file")       ||
    text.includes("show file")         ||
    text.includes("file metadata")     ||
    text.includes("file info")
  ) return true;

  // File search
  if (
    text.startsWith("find ")           ||
    text.startsWith("search for ")     ||
    text.startsWith("locate ")         ||
    text.includes("find every ")       ||
    text.includes("find all ")         ||
    text.includes("search files")      ||
    text.includes("find files")        ||
    text.includes("find pdf")          ||
    text.includes("find png")          ||
    text.includes("files modified")    ||
    text.includes("files larger than")
  ) return true;

  // Screenshot
  if (
    text.includes("take screenshot")   ||
    text.includes("take a screenshot") ||
    text.includes("screenshot")        ||
    text.includes("capture screen")    ||
    text.includes("screen capture")
  ) return true;

  // Clipboard
  if (
    text.includes("clipboard")         ||
    text.includes("copy to clipboard") ||
    text.includes("what is in my clipboard")
  ) return true;

  // Volume
  if (
    text.includes("volume")            ||
    text.includes("mute")              ||
    text.includes("unmute")            ||
    text.includes("increase volume")   ||
    text.includes("decrease volume")   ||
    text.includes("set volume")
  ) return true;

  // Brightness
  if (
    text.includes("brightness")        ||
    text.includes("increase brightness") ||
    text.includes("decrease brightness") ||
    text.includes("set brightness")
  ) return true;

  // System info / status
  if (
    text.includes("battery")           ||
    text.includes("cpu usage")         ||
    text.includes("memory usage")      ||
    text.includes("disk usage")        ||
    text.includes("disk space")        ||
    text.includes("network status")    ||
    text.includes("wifi status")       ||
    text.includes("bluetooth status")  ||
    text.includes("system info")       ||
    text.includes("system information") ||
    text.includes("what os")           ||
    text.includes("what operating system")
  ) return true;

  // Power management
  if (
    text.includes("lock screen")       ||
    text.includes("lock the screen")   ||
    text.includes("lock computer")     ||
    text.includes("sleep")             ||
    text.includes("put computer to sleep") ||
    text.includes("restart computer")  ||
    text.includes("reboot")            ||
    text.includes("shutdown")          ||
    text.includes("shut down")
  ) return true;

  return false;
}

export async function routeRequest(
  message,
  toolContext = "chat"
) {

  const text = message.toLowerCase();

  // Developer Console: emit intent at route entry
  emitDevEvent('IntentDetected', { intent: 'routing', tool: 'router', userPrompt: message });

  // =====================
  // AGENT MODE
  // =====================

  if (isAgentRequest(text)) {

    console.log("\n🚀 AGENT MODE");

    emitDevEvent('ToolStarted', { tool: 'agent', stage: 'planning' });
    const { planActions } =
      await import("./actionPlanner.js");
    const { executeActions } =
      await import("./actionExecutor.js");

    const plan = await planActions(message);

    console.log("\n📋 PLAN:");
    console.log(JSON.stringify(plan, null, 2));

    const results = await executeActions(plan);
    emitDevEvent('ToolFinished', { tool: 'agent', stage: 'execution' });

    // ── Confirmation Intercept (Phase 3) ───────────────────────────────────
    // If any result is a pending_confirmation object, surface it to the
    // caller instead of joining as plain text. The server.js /chat/stream
    // handler detects tool === "confirmation" and serialises it as
    // __CONFIRMATION__:<json> so the frontend can parse and display it.
    if (
      results.length > 0 &&
      results[0] !== null &&
      typeof results[0] === "object" &&
      results[0].status === "pending_confirmation"
    ) {
      return {
        tool: "confirmation",
        answer: results[0],
        executedSteps: [
          { name: "planning", status: "completed" },
          ...(results.steps || [])
        ]
      };
    }

    // ── Waiting Input Intercept (Phase 5) ─────────────────────────────────
    // When the email tool is missing a required field (e.g. recipientEmail),
    // it returns status: "waiting_input". Surface this to the server so it
    // can write the __WAITING_INPUT__: SSE marker to the frontend.
    if (
      results.length > 0 &&
      results[0] !== null &&
      typeof results[0] === "object" &&
      results[0].status === "waiting_input"
    ) {
      return {
        tool: "waiting_input",
        answer: results[0],
        executedSteps: [
          { name: "planning", status: "completed" },
          ...(results.steps || [])
        ]
      };
    }
    // ─────────────────────────────────────────────────────────────────────

    return {
      tool: "agent",
      answer: results.join("\n"),
      executedSteps: [
        { name: "planning", status: "completed" },
        ...(results.steps || [])
      ]
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
      await import("../features/memory/index.js");

    const memory = await loadMemory();

    return {
      tool: "memory",
      answer: JSON.stringify(memory, null, 2),
      executedSteps: [
        { name: "memory_lookup", status: "completed" }
      ]
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
      answer,
      executedSteps: [
        { name: "web_search", status: "completed" }
      ]
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
        answer: "No PDFs uploaded yet. Please upload a PDF first.",
        executedSteps: [
          { name: "pdf_search", status: "failed" }
        ]
      };
    }

    console.log("\n📄 Selected PDF:", pdfName);
    console.log("\n🤖 PDF Tool Triggered");

    const { askPDF } =
      await import("./pdfQAService.js");

    const answer = await askPDF(pdfName, message);

    return {
      tool: "pdf",
      answer,
      executedSteps: [
        { name: "pdf_search", status: "completed" }
      ]
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
      await import("../features/tasks/index.js");

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
      answer: `✅ Task added: ${taskText}`,
      executedSteps: [
        { name: "task_manager", status: "completed" }
      ]
    };
  }

  // =====================
  // MEMORY — REMEMBER
  // =====================

  if (text.startsWith("remember")) {

    const { updateMemory } =
      await import("../features/memory/index.js");

    const memoryText = message
      .replace(/remember/i, "")
      .trim();

    await updateMemory(memoryText);

    return {
      tool: "memory",
      answer: `🧠 Memory updated: ${memoryText}`,
      executedSteps: [
        { name: "memory_lookup", status: "completed" }
      ]
    };
  }

  // =====================
  // MEMORY — FORGET
  // =====================

  if (text.startsWith("forget ")) {

    const { deleteMemoryKey } =
      await import("../features/memory/index.js");

    const key = message
      .replace(/forget/i, "")
      .trim();

    await deleteMemoryKey(key);

    return {
      tool: "memory",
      answer: `🧠 Forgot: ${key}`,
      executedSteps: [
        { name: "memory_lookup", status: "completed" }
      ]
    };
  }

  // =====================
  // NOTE TOOL
  // =====================

  if (aiTool === "note") {

    const { loadNotes, saveNotes } =
      await import("../features/notes/index.js");

    const notes = await loadNotes();

    notes.push({
      id: Date.now(),
      content: message
    });

    await saveNotes(notes);

    await incrementStat("notes_saved");

    return {
      tool: "note",
      answer: `📝 Note saved.`,
      executedSteps: [
        { name: "notes", status: "completed" }
      ]
    };
  }

  // =====================
  // RESEARCH TOOL
  // =====================

  if (aiTool === "research") {
    const { executeDeepResearch } = await import("./research/deepResearchEngine.js");
    const res = await executeDeepResearch(message);
    return {
      tool: "research",
      answer: res.report,
      executedSteps: [
        { name: "deep_research", status: "completed" }
      ]
    };
  }

  // =====================
  // CODE ASSISTANCE TOOL
  // =====================

  if (aiTool === "code") {
    const { processCodeTask } = await import("./code/codeAssistantService.js");
    const res = await processCodeTask({ action: "explain", codeSnippet: message });
    return {
      tool: "code",
      answer: res.answer,
      executedSteps: [
        { name: "code_assistance", status: "completed" }
      ]
    };
  }

  // =====================
  // VISION TOOL
  // =====================

  if (aiTool === "vision") {
    const { analyzeImage } = await import("./multimodal/visionEngine.js");
    const res = await analyzeImage({ prompt: message });
    return {
      tool: "vision",
      answer: res.analysis,
      executedSteps: [
        { name: "vision_ocr_analysis", status: res.ok ? "completed" : "failed" }
      ]
    };
  }

  // =====================
  // NORMAL CHAT
  // =====================

  const { askAI } = await import("./ai.js");
  const answer = await askAI(message, toolContext);

  return {
    tool: toolContext,
    answer
  };
}