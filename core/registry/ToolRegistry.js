import { ResearchTool } from "../../services/tools/researchTool.js";
import { WebSearchTool } from "../../services/tools/webSearchTool.js";
import { SummarizeTool } from "../../services/tools/summarizeTool.js";
import { AnalyzeTool } from "../../services/tools/analyzeTool.js";
import { PlanTool } from "../../services/tools/planTool.js";
import { SaveNoteTool } from "../../services/tools/saveNoteTool.js";
import { SaveResearchNoteTool } from "../../services/tools/saveResearchNoteTool.js";
import { CreateTaskTool } from "../../services/tools/createTaskTool.js";
import { CreateStudyTasksTool } from "../../services/tools/createStudyTasksTool.js";
import { EmailDraftTool } from "../../services/tools/emailDraftTool.js";

// Desktop Control Framework Tools
import { DesktopOpenAppTool }       from "../../services/tools/desktop/desktopOpenAppTool.js";
import { DesktopOpenFolderTool }    from "../../services/tools/desktop/desktopOpenFolderTool.js";
import { DesktopOpenFileTool }      from "../../services/tools/desktop/desktopOpenFileTool.js";
import { DesktopOpenUrlTool }       from "../../services/tools/desktop/desktopOpenUrlTool.js";
import { DesktopSearchFilesTool }   from "../../services/tools/desktop/desktopSearchFilesTool.js";
import { DesktopScreenshotTool }    from "../../services/tools/desktop/desktopScreenshotTool.js";
import { DesktopClipboardTool }     from "../../services/tools/desktop/desktopClipboardTool.js";
import { DesktopVolumeTool }        from "../../services/tools/desktop/desktopVolumeTool.js";
import { DesktopBrightnessTool }    from "../../services/tools/desktop/desktopBrightnessTool.js";
import { DesktopSystemInfoTool }    from "../../services/tools/desktop/desktopSystemInfoTool.js";
import { DesktopBatteryTool }       from "../../services/tools/desktop/desktopBatteryTool.js";
import { DesktopCpuTool }           from "../../services/tools/desktop/desktopCpuTool.js";
import { DesktopMemoryTool }        from "../../services/tools/desktop/desktopMemoryTool.js";
import { DesktopDiskTool }          from "../../services/tools/desktop/desktopDiskTool.js";
import { DesktopNetworkTool }       from "../../services/tools/desktop/desktopNetworkTool.js";
import { DesktopLockTool }          from "../../services/tools/desktop/desktopLockTool.js";
import { DesktopSleepTool }         from "../../services/tools/desktop/desktopSleepTool.js";
import { DesktopRestartTool }       from "../../services/tools/desktop/desktopRestartTool.js";
import { DesktopShutdownTool }      from "../../services/tools/desktop/desktopShutdownTool.js";
import { DesktopCreateFolderTool }  from "../../services/tools/desktop/desktopCreateFolderTool.js";
import { DesktopCopyFileTool }      from "../../services/tools/desktop/desktopCopyFileTool.js";
import { DesktopMoveFileTool }      from "../../services/tools/desktop/desktopMoveFileTool.js";
import { DesktopDeleteFileTool }    from "../../services/tools/desktop/desktopDeleteFileTool.js";
import { DesktopRenameFileTool }    from "../../services/tools/desktop/desktopRenameFileTool.js";
import { DesktopDuplicateFileTool } from "../../services/tools/desktop/desktopDuplicateFileTool.js";
import { DesktopZipTool }           from "../../services/tools/desktop/desktopZipTool.js";
import { DesktopUnzipTool }         from "../../services/tools/desktop/desktopUnzipTool.js";
import { DesktopRevealFileTool }    from "../../services/tools/desktop/desktopRevealFileTool.js";
import { DesktopMetadataTool }      from "../../services/tools/desktop/desktopMetadataTool.js";

/**
 * ToolRegistry.js
 *
 * Centralized tool registry for the Agent Core.
 * Manages tool registration, lookup, and action execution conforming to the unified
 * tool execution contract.
 */
export class ToolRegistry {
  constructor() {
    this.tools = new Map();
  }

  /**
   * Register a new tool conforming to the unified execute(action) interface.
   * @param {string} name - Name of the tool.
   * @param {object} toolInstance - Instance with execute(action) method.
   */
  registerTool(name, toolInstance) {
    if (!toolInstance || typeof toolInstance.execute !== "function") {
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

    const normalizedAction = {
      tool:         action.tool,
      action:       action.action || "default",
      input:        action.input !== undefined ? action.input : {},
      _confirmedAt: action._confirmedAt
    };

    return await tool.execute(normalizedAction);
  }
}

// Global singleton instance
export const toolRegistry = new ToolRegistry();

// ─── Standard Built-in Tools ─────────────────────────────────────────────────
toolRegistry.registerTool("research",            new ResearchTool());
toolRegistry.registerTool("web_search",          new WebSearchTool());
toolRegistry.registerTool("summarize",           new SummarizeTool());
toolRegistry.registerTool("analyze",             new AnalyzeTool());
toolRegistry.registerTool("plan",                new PlanTool());
toolRegistry.registerTool("save_note",           new SaveNoteTool());
toolRegistry.registerTool("save_research_note",  new SaveResearchNoteTool());
toolRegistry.registerTool("create_task",         new CreateTaskTool());
toolRegistry.registerTool("create_study_tasks",  new CreateStudyTasksTool());

// ─── Extended Intelligence Tools ─────────────────────────────────────────────
toolRegistry.registerTool("deep_research", {
  async execute(action) {
    const { executeDeepResearch } = await import("../../services/research/deepResearchEngine.js");
    const topic = action.input?.topic || action.input?.query || "AI Intelligence";
    const res = await executeDeepResearch(topic);
    return res.report;
  }
});

toolRegistry.registerTool("code_analysis", {
  async execute(action) {
    const { processCodeTask } = await import("../../services/code/codeAssistantService.js");
    const res = await processCodeTask({
      action: action.action || "explain",
      codeSnippet: action.input?.code || action.input?.snippet || "",
      filename: action.input?.filename || "file",
      question: action.input?.question || "",
    });
    return res.answer;
  }
});

toolRegistry.registerTool("vision_analysis", {
  async execute(action) {
    const { analyzeImage } = await import("../../services/multimodal/visionEngine.js");
    const res = await analyzeImage({
      image: action.input?.image || action.input?.dataUrl || "",
      prompt: action.input?.prompt || "Analyze this image",
    });
    return res.analysis;
  }
});

// ─── Phase 3 — Confirmation-Gated Tools ──────────────────────────────────────
toolRegistry.registerTool("email_draft",         new EmailDraftTool());

// ─── Phase 2 — Desktop Control Framework ─────────────────────────────────────
// LOW risk (no confirmation required)
toolRegistry.registerTool("desktop_open_app",        new DesktopOpenAppTool());
toolRegistry.registerTool("desktop_open_folder",     new DesktopOpenFolderTool());
toolRegistry.registerTool("desktop_open_file",       new DesktopOpenFileTool());
toolRegistry.registerTool("desktop_open_url",        new DesktopOpenUrlTool());
toolRegistry.registerTool("desktop_search_files",    new DesktopSearchFilesTool());
toolRegistry.registerTool("desktop_take_screenshot", new DesktopScreenshotTool());
toolRegistry.registerTool("desktop_clipboard",       new DesktopClipboardTool());
toolRegistry.registerTool("desktop_volume",          new DesktopVolumeTool());
toolRegistry.registerTool("desktop_brightness",      new DesktopBrightnessTool());
toolRegistry.registerTool("desktop_system_info",     new DesktopSystemInfoTool());
toolRegistry.registerTool("desktop_battery",         new DesktopBatteryTool());
toolRegistry.registerTool("desktop_cpu",             new DesktopCpuTool());
toolRegistry.registerTool("desktop_memory",          new DesktopMemoryTool());
toolRegistry.registerTool("desktop_disk",            new DesktopDiskTool());
toolRegistry.registerTool("desktop_network",         new DesktopNetworkTool());
toolRegistry.registerTool("desktop_create_folder",   new DesktopCreateFolderTool());
toolRegistry.registerTool("desktop_zip",             new DesktopZipTool());
toolRegistry.registerTool("desktop_unzip",           new DesktopUnzipTool());
toolRegistry.registerTool("desktop_reveal_file",     new DesktopRevealFileTool());
toolRegistry.registerTool("desktop_metadata",        new DesktopMetadataTool());

// MEDIUM risk (confirmation required)
toolRegistry.registerTool("desktop_copy_file",       new DesktopCopyFileTool());
toolRegistry.registerTool("desktop_move_file",       new DesktopMoveFileTool());
toolRegistry.registerTool("desktop_rename_file",     new DesktopRenameFileTool());
toolRegistry.registerTool("desktop_duplicate_file",  new DesktopDuplicateFileTool());

// HIGH risk (always requires confirmation)
toolRegistry.registerTool("desktop_delete_file",     new DesktopDeleteFileTool());
toolRegistry.registerTool("desktop_lock",            new DesktopLockTool());
toolRegistry.registerTool("desktop_sleep",           new DesktopSleepTool());
toolRegistry.registerTool("desktop_restart",         new DesktopRestartTool());
toolRegistry.registerTool("desktop_shutdown",        new DesktopShutdownTool());

export default toolRegistry;
