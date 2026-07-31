import { capabilityManager } from "../capabilities/CapabilityManager.js";
import { askModelCie } from "../../services/ai.js";

/**
 * Determine whether a text prompt is a desktop control request.
 * @param {string} text
 * @returns {boolean}
 */
export function isDesktopRequest(text) {
  const t = (text || "").toLowerCase();
  if (
    t.startsWith("open ")           ||
    t.startsWith("launch ")         ||
    t.startsWith("start ")          ||
    t.includes("open vs code")      ||
    t.includes("open vscode")       ||
    t.includes("open chrome")       ||
    t.includes("open terminal")     ||
    t.includes("launch spotify")    ||
    t.includes("launch discord")    ||
    t.includes("open application")  ||
    t.includes("open app ")         ||
    t.includes("create folder")     ||
    t.includes("make folder")       ||
    t.includes("new folder")        ||
    t.includes("rename file")       ||
    t.includes("move file")         ||
    t.includes("copy file")         ||
    t.includes("delete file")       ||
    t.includes("take screenshot")   ||
    t.includes("screenshot")        ||
    t.includes("clipboard")         ||
    t.includes("volume")            ||
    t.includes("brightness")        ||
    t.includes("battery")           ||
    t.includes("system info")       ||
    t.includes("lock screen")
  ) return true;

  return false;
}

/**
 * Determine whether the message is a multi-step agent request.
 * @param {string} text
 * @returns {boolean}
 */
export function isAgentRequest(text) {
  const t = (text || "").toLowerCase();
  return (
    t.includes("and create") ||
    t.includes("and save") ||
    t.includes("create tasks") ||
    t.includes("save as notes") ||
    t.includes("find and save") ||
    t.includes("research and") ||
    t.includes("research") ||
    t.includes("send email") ||
    t.includes("draft email") ||
    isDesktopRequest(t)
  );
}

/**
 * Decide which tool to use for a user message (Backward compatibility helper).
 * @param {string} message
 * @returns {Promise<string>} Tool name
 */
export async function decideTool(message) {
  const text = message.toLowerCase();
  if (text.includes("latest") || text.includes("news") || text.includes("today") || text.includes("weather")) {
    return "web";
  }
  if (text.includes("?") || text.startsWith("what") || text.startsWith("how") || text.startsWith("explain")) {
    return "chat";
  }
  try {
    const result = await askModelCie("groq", message, "ToolRouting");
    const tool = result.trim().toLowerCase().split(/\s+/)[0].replace(/[^a-z]/g, "");
    const validTools = ["memory", "task", "note", "pdf", "web", "chat", "research", "code", "vision"];
    return validTools.includes(tool) ? tool : "chat";
  } catch {
    return "chat";
  }
}

/**
 * Backward-compatibility facade for routeRequest.
 * Delegates request execution to CapabilityManager.
 *
 * @param {string} message - User request prompt
 * @param {string} [toolContext="chat"] - Tool context identifier ("chat", "voice", etc.)
 * @returns {Promise<{tool: string, answer: any, executedSteps?: Array}>}
 */
export async function routeRequest(message, toolContext = "chat") {
  return await capabilityManager.executeRequest(message, toolContext);
}
