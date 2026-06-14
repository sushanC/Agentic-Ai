import { askGroq } from "./ai.js";

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

  const prompt = `
You are a routing engine.

Available tools:

memory
task
note
pdf
web
chat

Definitions:

memory:
- user is telling personal information
- user preferences
- favorite things
- goals
- profile updates

Examples:
"My favorite color is green"
"I like PostgreSQL"
"My name is Sushan Acharya"

task:
- create, update, complete tasks

Examples:
"Add task finish DAA assignment"

note:
- save notes

Examples:
"Remember this note"
"Save this note"

pdf:
- questions specifically about uploaded PDFs
- questions about course material stored in PDFs

Examples:
"Explain deadlock from my notes"

web:
- current events
- latest information
- internet search required
- live information
- news
- weather

Examples:
"Latest AI news"
"Current React version"
"Today's IPL score"
"Weather in Bangalore"

chat:
- all normal questions
- coding questions
- general knowledge
- explanations

Examples:
"What is GCD?"
"Explain recursion"
"Write a Java program"

Message:
${message}

Return ONLY one tool name.
`;

  const result =
    await askGroq(prompt);

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