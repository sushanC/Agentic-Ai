import { askAI } from "../ai.js";
import { addActivity } from "../../storage/activityStorage.js";

export class AnalyzeTool {
  async execute(action) {
    const content = typeof action.input === "string"
      ? action.input
      : action.input?.content || action.input?.text || "";

    const prompt = `
Analyze the following and provide insights.

Topic: ${content}

Format:
- Analysis
- Pros
- Cons
- Recommendation

Be concise and direct.
`;

    const analysis = await askAI(prompt, "chat");
    addActivity(`Analyzed: ${content}`);
    return `🔍 Analysis:\n\n${analysis}`;
  }
}
