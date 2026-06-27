import { ResearchTool } from "./tools/researchTool.js";
import { WebSearchTool } from "./tools/webSearchTool.js";
import { SummarizeTool } from "./tools/summarizeTool.js";
import { AnalyzeTool } from "./tools/analyzeTool.js";
import { PlanTool } from "./tools/planTool.js";
import { SaveNoteTool } from "./tools/saveNoteTool.js";
import { SaveResearchNoteTool } from "./tools/saveResearchNoteTool.js";
import { CreateTaskTool } from "./tools/createTaskTool.js";
import { CreateStudyTasksTool } from "./tools/createStudyTasksTool.js";
import { EmailDraftTool } from "./tools/emailDraftTool.js";

class ToolRegistry {
  constructor() {
    this.tools = new Map();
  }

  /**
   * Register a new tool conforming to the unified execute(action) interface.
   * @param {string} name - Name of the tool.
   * @param {object} toolInstance - Instance with execute(action) method.
   */
  registerTool(name, toolInstance) {
    if (typeof toolInstance.execute !== "function") {
      throw new Error(`Tool "${name}" must implement execute(action) method.`);
    }
    this.tools.set(name, toolInstance);
  }

  /**
   * Look up a tool in the registry.
   * @param {string} name
   */
  getTool(name) {
    return this.tools.get(name);
  }

  /**
   * Dispatches and executes an action against a registered tool.
   * Ensures the action conforms to:
   * {
   *   "tool": "...",
   *   "action": "...",
   *   "input": {}
   * }
   * @param {object} action
   */
  async executeTool(action) {
    const toolName = action.tool;
    const tool = this.getTool(toolName);

    if (!tool) {
      return `⚠️ Unknown action: ${toolName}`;
    }

    // Normalize the action object so it guarantees tool, action, and input keys
    const normalizedAction = {
      tool: action.tool,
      action: action.action || "default",
      input: action.input !== undefined ? action.input : {}
    };

    return await tool.execute(normalizedAction);
  }
}

const registry = new ToolRegistry();

// Register the standard built-in tools
registry.registerTool("research", new ResearchTool());
registry.registerTool("web_search", new WebSearchTool());
registry.registerTool("summarize", new SummarizeTool());
registry.registerTool("analyze", new AnalyzeTool());
registry.registerTool("plan", new PlanTool());
registry.registerTool("save_note", new SaveNoteTool());
registry.registerTool("save_research_note", new SaveResearchNoteTool());
registry.registerTool("create_task", new CreateTaskTool());
registry.registerTool("create_study_tasks", new CreateStudyTasksTool());

// Phase 3 — Confirmation-gated tools
registry.registerTool("email_draft", new EmailDraftTool());

export default registry;
export { registry };
