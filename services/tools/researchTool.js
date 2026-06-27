import { researchTopic } from "../researchAgent.js";
import { addActivity } from "../../storage/activityStorage.js";

export class ResearchTool {
  async execute(action) {
    const topic = typeof action.input === "string" 
      ? action.input 
      : action.input?.topic || action.input?.query || action.input?.text || "";

    const report = await researchTopic(topic);
    addActivity(`Researched: ${topic}`);
    return report;
  }
}
