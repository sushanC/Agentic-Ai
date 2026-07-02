import { askModelCie } from "./ai.js";

export async function decideTool(
  message
) {

  const text =
    message.toLowerCase();

  // =====================
  // FAST RULES
  // =====================

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

  // =====================
  // AI ROUTER
  // =====================

  const result =
    await askModelCie("groq", message, "ToolRouting");

  const tool =
    result
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
    "chat"
  ];

  if (
    !validTools.includes(tool)
  ) {

    console.log(
      "⚠️ Invalid tool:",
      result
    );

    return "chat";
  }

  console.log(
    "\n🤖 Router Raw Output:"
  );

  console.log(result);

  console.log(
    "\n🛠 Selected Tool:"
  );

  console.log(tool);

  return tool;
}