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

// Phase 2 — Desktop Control Framework
import { DesktopOpenAppTool }       from "./tools/desktop/desktopOpenAppTool.js";
import { DesktopOpenFolderTool }    from "./tools/desktop/desktopOpenFolderTool.js";
import { DesktopOpenFileTool }      from "./tools/desktop/desktopOpenFileTool.js";
import { DesktopOpenUrlTool }       from "./tools/desktop/desktopOpenUrlTool.js";
import { DesktopSearchFilesTool }   from "./tools/desktop/desktopSearchFilesTool.js";
import { DesktopScreenshotTool }    from "./tools/desktop/desktopScreenshotTool.js";
import { DesktopClipboardTool }     from "./tools/desktop/desktopClipboardTool.js";
import { DesktopVolumeTool }        from "./tools/desktop/desktopVolumeTool.js";
import { DesktopBrightnessTool }    from "./tools/desktop/desktopBrightnessTool.js";
import { DesktopSystemInfoTool }    from "./tools/desktop/desktopSystemInfoTool.js";
import { DesktopBatteryTool }       from "./tools/desktop/desktopBatteryTool.js";
import { DesktopCpuTool }           from "./tools/desktop/desktopCpuTool.js";
import { DesktopMemoryTool }        from "./tools/desktop/desktopMemoryTool.js";
import { DesktopDiskTool }          from "./tools/desktop/desktopDiskTool.js";
import { DesktopNetworkTool }       from "./tools/desktop/desktopNetworkTool.js";
import { DesktopLockTool }          from "./tools/desktop/desktopLockTool.js";
import { DesktopSleepTool }         from "./tools/desktop/desktopSleepTool.js";
import { DesktopRestartTool }       from "./tools/desktop/desktopRestartTool.js";
import { DesktopShutdownTool }      from "./tools/desktop/desktopShutdownTool.js";
import { DesktopCreateFolderTool }  from "./tools/desktop/desktopCreateFolderTool.js";
import { DesktopCopyFileTool }      from "./tools/desktop/desktopCopyFileTool.js";
import { DesktopMoveFileTool }      from "./tools/desktop/desktopMoveFileTool.js";
import { DesktopDeleteFileTool }    from "./tools/desktop/desktopDeleteFileTool.js";
import { DesktopRenameFileTool }    from "./tools/desktop/desktopRenameFileTool.js";
import { DesktopDuplicateFileTool } from "./tools/desktop/desktopDuplicateFileTool.js";
import { DesktopZipTool }           from "./tools/desktop/desktopZipTool.js";
import { DesktopUnzipTool }         from "./tools/desktop/desktopUnzipTool.js";
import { DesktopRevealFileTool }    from "./tools/desktop/desktopRevealFileTool.js";
import { DesktopMetadataTool }      from "./tools/desktop/desktopMetadataTool.js";

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
      tool:         action.tool,
      action:       action.action || "default",
      input:        action.input !== undefined ? action.input : {},
      // Pass through confirmation token so HIGH/MEDIUM-risk desktop tools can
      // skip the createPending() gate once confirmed (Phase 3 pattern re-used)
      _confirmedAt: action._confirmedAt
    };

    return await tool.execute(normalizedAction);
  }
}

const registry = new ToolRegistry();

// ─── Standard Built-in Tools ─────────────────────────────────────────────────
registry.registerTool("research",            new ResearchTool());
registry.registerTool("web_search",          new WebSearchTool());
registry.registerTool("summarize",           new SummarizeTool());
registry.registerTool("analyze",             new AnalyzeTool());
registry.registerTool("plan",                new PlanTool());
registry.registerTool("save_note",           new SaveNoteTool());
registry.registerTool("save_research_note",  new SaveResearchNoteTool());
registry.registerTool("create_task",         new CreateTaskTool());
registry.registerTool("create_study_tasks",  new CreateStudyTasksTool());

// ─── Extended Intelligence Tools ─────────────────────────────────────────────
registry.registerTool("deep_research", {
  async execute(action) {
    const { executeDeepResearch } = await import("./research/deepResearchEngine.js");
    const topic = action.input?.topic || action.input?.query || "AI Intelligence";
    const res = await executeDeepResearch(topic);
    return res.report;
  }
});

registry.registerTool("code_analysis", {
  async execute(action) {
    const { processCodeTask } = await import("./code/codeAssistantService.js");
    const res = await processCodeTask({
      action: action.action || "explain",
      codeSnippet: action.input?.code || action.input?.snippet || "",
      filename: action.input?.filename || "file",
      question: action.input?.question || "",
    });
    return res.answer;
  }
});

registry.registerTool("vision_analysis", {
  async execute(action) {
    const { analyzeImage } = await import("./multimodal/visionEngine.js");
    const res = await analyzeImage({
      image: action.input?.image || action.input?.dataUrl || "",
      prompt: action.input?.prompt || "Analyze this image",
    });
    return res.analysis;
  }
});

// ─── Phase 3 — Confirmation-Gated Tools ──────────────────────────────────────
registry.registerTool("email_draft",         new EmailDraftTool());

// ─── Phase 2 — Desktop Control Framework ─────────────────────────────────────
// LOW risk (no confirmation required)
registry.registerTool("desktop_open_app",        new DesktopOpenAppTool());
registry.registerTool("desktop_open_folder",     new DesktopOpenFolderTool());
registry.registerTool("desktop_open_file",       new DesktopOpenFileTool());
registry.registerTool("desktop_open_url",        new DesktopOpenUrlTool());
registry.registerTool("desktop_search_files",    new DesktopSearchFilesTool());
registry.registerTool("desktop_take_screenshot", new DesktopScreenshotTool());
registry.registerTool("desktop_clipboard",       new DesktopClipboardTool());
registry.registerTool("desktop_volume",          new DesktopVolumeTool());
registry.registerTool("desktop_brightness",      new DesktopBrightnessTool());
registry.registerTool("desktop_system_info",     new DesktopSystemInfoTool());
registry.registerTool("desktop_battery",         new DesktopBatteryTool());
registry.registerTool("desktop_cpu",             new DesktopCpuTool());
registry.registerTool("desktop_memory",          new DesktopMemoryTool());
registry.registerTool("desktop_disk",            new DesktopDiskTool());
registry.registerTool("desktop_network",         new DesktopNetworkTool());
registry.registerTool("desktop_create_folder",   new DesktopCreateFolderTool());
registry.registerTool("desktop_zip",             new DesktopZipTool());
registry.registerTool("desktop_unzip",           new DesktopUnzipTool());
registry.registerTool("desktop_reveal_file",     new DesktopRevealFileTool());
registry.registerTool("desktop_metadata",        new DesktopMetadataTool());

// MEDIUM risk (confirmation required)
registry.registerTool("desktop_copy_file",       new DesktopCopyFileTool());
registry.registerTool("desktop_move_file",       new DesktopMoveFileTool());
registry.registerTool("desktop_rename_file",     new DesktopRenameFileTool());
registry.registerTool("desktop_duplicate_file",  new DesktopDuplicateFileTool());

// HIGH risk (always requires confirmation)
registry.registerTool("desktop_delete_file",     new DesktopDeleteFileTool());
registry.registerTool("desktop_lock",            new DesktopLockTool());
registry.registerTool("desktop_sleep",           new DesktopSleepTool());
registry.registerTool("desktop_restart",         new DesktopRestartTool());
registry.registerTool("desktop_shutdown",        new DesktopShutdownTool());

export default registry;
export { registry };
