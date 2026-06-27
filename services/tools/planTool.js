import { askAI } from "../ai.js";
import { addActivity } from "../../storage/activityStorage.js";

export class PlanTool {
  async execute(action) {
    const goal = typeof action.input === "string"
      ? action.input
      : action.input?.goal || action.input?.text || "";

    const prompt = `
Create a clear, structured plan for the following goal.

Goal: ${goal}

Format:
- Phase 1: ...
- Phase 2: ...
- Phase 3: ...
- Key milestones
- Resources needed

Be practical and actionable.
`;

    const planResult = await askAI(prompt, "planning");
    addActivity(`Created plan: ${goal}`);
    return `📅 Plan:\n\n${planResult}`;
  }
}
