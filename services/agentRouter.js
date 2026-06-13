import { askAI } from "./ai.js";

export async function decideTool(
  message
) {

  const prompt = `
You are a tool router.

Available tools:

1. task
2. note
3. pdf
4. chat

Return ONLY JSON.

Examples:

User:
Add task Learn Docker

Output:
{"tool":"task"}

User:
Remember I like React

Output:
{"tool":"note"}

User:
What is deadlock?

Output:
{"tool":"pdf"}

User:
Hello

Output:
{"tool":"chat"}

User:
${message}
`;

  const response =
    await askAI(prompt);

  try {

    return JSON.parse(
      response
    );

  } catch {

    return {
      tool: "chat"
    };
  }
}