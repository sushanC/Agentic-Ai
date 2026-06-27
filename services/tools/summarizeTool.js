import { askAI } from "../ai.js";
import { addActivity } from "../../storage/activityStorage.js";

export class SummarizeTool {
  async execute(action) {
    const content = typeof action.input === "string"
      ? action.input
      : action.input?.content || action.input?.text || "";

    const prompt = `
Summarize the following topic clearly and concisely.

Topic: ${content}

Format:
- Overview (2-3 sentences)
- Key Points (bullet list)
- Why it matters

Keep it brief and useful.
`;

    const summary = await askAI(prompt, "chat");
    addActivity(`Summarized: ${content}`);
    return `📋 Summary:\n\n${summary}`;
  }
}
