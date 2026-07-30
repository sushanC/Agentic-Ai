import { askModelCie, askAI } from "../../services/ai.js";
import { incrementStat } from "../../storage/statsStorage.js";
import { developerEvents } from "../events/DeveloperEvents.js";
import { ContextAssembly } from "../context/ContextAssembly.js";
import { planActions } from "../planning/ActionPlanner.js";
import { executeActions } from "../execution/ActionExecutor.js";

/**
 * Determine whether a text prompt is a desktop control request.
 * @param {string} text
 * @returns {boolean}
 */
export function isDesktopRequest(text) {
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
    text.includes("delete file")       ||
    text.includes("delete a file")     ||
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

  if (
    text.includes("take screenshot")   ||
    text.includes("take a screenshot") ||
    text.includes("screenshot")        ||
    text.includes("capture screen")    ||
    text.includes("screen capture")
  ) return true;

  if (
    text.includes("clipboard")         ||
    text.includes("copy to clipboard") ||
    text.includes("what is in my clipboard")
  ) return true;

  if (
    text.includes("volume")            ||
    text.includes("mute")              ||
    text.includes("unmute")            ||
    text.includes("increase volume")   ||
    text.includes("decrease volume")   ||
    text.includes("set volume")
  ) return true;

  if (
    text.includes("brightness")        ||
    text.includes("increase brightness") ||
    text.includes("decrease brightness") ||
    text.includes("set brightness")
  ) return true;

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

/**
 * Determine whether the message is a multi-step agent request.
 * @param {string} text
 * @returns {boolean}
 */
export function isAgentRequest(text) {
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
    text.includes("send email") ||
    text.includes("draft email") ||
    text.includes("write email") ||
    text.includes("compose email") ||
    text.includes("send an email") ||
    text.includes("draft an email") ||
    text.includes("email to ") ||
    isDesktopRequest(text)
  );
}

/**
 * Decide which tool to use for a user message.
 * @param {string} message
 * @returns {Promise<string>} Tool name
 */
export async function decideTool(message) {
  const text = message.toLowerCase();

  if (
    text.includes("latest") ||
    text.includes("news") ||
    text.includes("today") ||
    text.includes("current") ||
    text.includes("weather")
  ) {
    return "web";
  }

  if (
    text.includes("?") ||
    text.startsWith("what") ||
    text.startsWith("how") ||
    text.startsWith("why") ||
    text.startsWith("explain")
  ) {
    return "chat";
  }

  const result = await askModelCie("groq", message, "ToolRouting");

  const tool = result
    .trim()
    .toLowerCase()
    .split(/\s+/)[0]
    .replace(/[^a-z]/g, "");

  const validTools = [
    "memory",
    "task",
    "note",
    "pdf",
    "web",
    "chat",
    "research",
    "code",
    "vision"
  ];

  if (!validTools.includes(tool)) {
    console.log("⚠️ Invalid tool:", result);
    return "chat";
  }

  console.log("\n🤖 Router Raw Output:", result);
  console.log("\n🛠 Selected Tool:", tool);

  return tool;
}

/**
 * Route a user prompt through the Agent Core execution pipeline.
 *
 * @param {string} message - User request prompt
 * @param {string} [toolContext="chat"] - Tool context identifier ("chat", "voice", etc.)
 * @returns {Promise<{tool: string, answer: any, executedSteps?: Array}>}
 */
export async function routeRequest(message, toolContext = "chat") {
  const text = message.toLowerCase();

  developerEvents.emitDevEvent('IntentDetected', { intent: 'routing', tool: 'router', userPrompt: message });

  // AGENT MODE
  if (isAgentRequest(text)) {
    console.log("\n🚀 AGENT MODE");
    developerEvents.emitDevEvent('ToolStarted', { tool: 'agent', stage: 'planning' });

    const plan = await planActions(message);
    console.log("\n📋 PLAN:", JSON.stringify(plan, null, 2));

    const results = await executeActions(plan);
    developerEvents.emitDevEvent('ToolFinished', { tool: 'agent', stage: 'execution' });

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

    return {
      tool: "agent",
      answer: results.join("\n"),
      executedSteps: [
        { name: "planning", status: "completed" },
        ...(results.steps || [])
      ]
    };
  }

  // NORMAL ROUTER
  const aiTool = await decideTool(message);

  if (text === "show memory") {
    const { loadMemory } = await import("../../features/memory/index.js");
    const memory = await loadMemory();
    return {
      tool: "memory",
      answer: JSON.stringify(memory, null, 2),
      executedSteps: [{ name: "memory_lookup", status: "completed" }]
    };
  }

  if (aiTool === "web") {
    console.log("\n🌐 WEB TOOL TRIGGERED");
    const { handleWeb } = await import("../../handlers/webHandler.js");
    const answer = await handleWeb(`web search ${message}`);
    return {
      tool: "web",
      answer,
      executedSteps: [{ name: "web_search", status: "completed" }]
    };
  }

  if (aiTool === "pdf") {
    const pdfName = await ContextAssembly.findBestPDF(message);
    if (!pdfName) {
      return {
        tool: "pdf",
        answer: "No PDFs uploaded yet. Please upload a PDF first.",
        executedSteps: [{ name: "pdf_search", status: "failed" }]
      };
    }

    console.log("\n📄 Selected PDF:", pdfName);
    const { askPDF } = await import("../../features/pdf/index.js");
    const answer = await askPDF(pdfName, message);
    return {
      tool: "pdf",
      answer,
      executedSteps: [{ name: "pdf_search", status: "completed" }]
    };
  }

  if (text.startsWith("add task") || aiTool === "task") {
    const { loadTasks, saveTasks } = await import("../../features/tasks/index.js");
    const taskText = message.replace(/add task/i, "").trim();
    const tasks = await loadTasks();
    tasks.push({ id: Date.now(), text: taskText, completed: false });
    await saveTasks(tasks);
    await incrementStat("tasks_created");
    return {
      tool: "task",
      answer: `✅ Task added: ${taskText}`,
      executedSteps: [{ name: "task_manager", status: "completed" }]
    };
  }

  if (text.startsWith("remember")) {
    const { updateMemory } = await import("../../features/memory/index.js");
    const memoryText = message.replace(/remember/i, "").trim();
    await updateMemory(memoryText);
    return {
      tool: "memory",
      answer: `🧠 Memory updated: ${memoryText}`,
      executedSteps: [{ name: "memory_lookup", status: "completed" }]
    };
  }

  if (text.startsWith("forget ")) {
    const { deleteMemoryKey } = await import("../../features/memory/index.js");
    const key = message.replace(/forget/i, "").trim();
    await deleteMemoryKey(key);
    return {
      tool: "memory",
      answer: `🧠 Forgot: ${key}`,
      executedSteps: [{ name: "memory_lookup", status: "completed" }]
    };
  }

  if (aiTool === "note") {
    const { loadNotes, saveNotes } = await import("../../features/notes/index.js");
    const notes = await loadNotes();
    notes.push({ id: Date.now(), content: message });
    await saveNotes(notes);
    await incrementStat("notes_saved");
    return {
      tool: "note",
      answer: `📝 Note saved.`,
      executedSteps: [{ name: "notes", status: "completed" }]
    };
  }

  if (aiTool === "research") {
    const { executeDeepResearch } = await import("../../services/research/deepResearchEngine.js");
    const res = await executeDeepResearch(message);
    return {
      tool: "research",
      answer: res.report,
      executedSteps: [{ name: "deep_research", status: "completed" }]
    };
  }

  if (aiTool === "code") {
    const { processCodeTask } = await import("../../services/code/codeAssistantService.js");
    const res = await processCodeTask({ action: "explain", codeSnippet: message });
    return {
      tool: "code",
      answer: res.answer,
      executedSteps: [{ name: "code_assistance", status: "completed" }]
    };
  }

  if (aiTool === "vision") {
    const { analyzeImage } = await import("../../services/multimodal/visionEngine.js");
    const res = await analyzeImage({ prompt: message });
    return {
      tool: "vision",
      answer: res.analysis,
      executedSteps: [{ name: "vision_ocr_analysis", status: res.ok ? "completed" : "failed" }]
    };
  }

  // NORMAL CHAT
  const answer = await askAI(message, toolContext);
  return {
    tool: toolContext,
    answer
  };
}
