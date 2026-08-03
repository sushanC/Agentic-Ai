import { WorkflowGraph } from "./WorkflowGraph.js";
import { WorkflowNode } from "./WorkflowNode.js";

/**
 * WorkflowPlanner.js
 *
 * Analyses a CapabilityContext and produces a WorkflowGraph.
 *
 * Design principles:
 *   - Plans in TASK language, not capability language.
 *     (e.g. "Summarise GPT-5 findings" — NOT "use ChatCapability")
 *   - WorkflowExecutor maps tasks → capabilities using CapabilityRegistry.
 *   - Simple single-prompt requests produce a single-node graph for full
 *     backward compatibility with the pre-workflow execution model.
 *   - Multi-step detection uses structural heuristics (no AI calls in v1)
 *     to keep planning latency near-zero.
 *
 * Task-to-capability mapping is defined here as a registry-driven configuration
 * table so that new capabilities can be supported by adding one line — no code
 * changes to WorkflowEngine or WorkflowExecutor.
 */
export class WorkflowPlanner {
  constructor() {
    /**
     * Ordered list of task classification rules.
     * Each rule: { pattern: RegExp|Function, capability: string, taskLabel: string }
     * The FIRST matching rule wins (most-specific rules should appear earlier).
     */
    this._taskRules = [
      // Email
      { pattern: /\b(email|send email|draft email|reply to email|forward email|write an email|send an email)\b/i, capability: "email", taskLabel: "Email operation" },
      // Memory
      { pattern: /\b(remember|recall|what is my|what do you know|forget)\b/i,      capability: "memory",   taskLabel: "Memory operation"     },
      // Vision
      { pattern: /\b(analyze image|describe image|ocr|extract text from image|visual analysis)\b/i, capability: "vision", taskLabel: "Visual analysis" },
      // Desktop automation
      { pattern: /\b(take screenshot|screenshot|open app|launch|open vs code|open chrome|open terminal|system info|clipboard|volume|brightness|lock screen|shutdown|reboot|create folder|rename file|delete file|move file|copy file|find files|find pdf)\b/i, capability: "desktop", taskLabel: "Desktop operation" },
      // PDF
      { pattern: /\b(search pdf|read pdf|pdf|in the document)\b/i,                capability: "pdf",      taskLabel: "PDF search"           },
      // Deep research
      { pattern: /\b(deep research|conduct research|thorough research)\b/i,        capability: "research", taskLabel: "Deep research"         },
      // Code
      { pattern: /\b(write code|explain code|debug code|refactor code|code snippet|function in|class in)\b/i, capability: "code", taskLabel: "Code assistance" },
      // Web search
      { pattern: /\b(latest|news|today|current|weather|web search)\b/i,            capability: "web",      taskLabel: "Web search"           },
      // Task creation
      { pattern: /\b(add task|create task|new task)\b/i,                           capability: "task",     taskLabel: "Task creation"        },
      // Notes
      { pattern: /\b(save note|create note|take note|save as note)\b/i,            capability: "note",     taskLabel: "Note creation"        },
      // Summarise (must come after research to not shadow it)
      { pattern: /\b(summarize|summarise|give me a summary|tldr)\b/i,              capability: "chat",     taskLabel: "Summarisation"        },
      // Chat / default
      { pattern: /.*/,                                                              capability: "chat",     taskLabel: "Dialogue"             },
    ];

    /**
     * Sequential connector patterns that signal a multi-step request.
     * When the prompt contains these, the planner attempts to split it into multiple nodes.
     */
    this._sequentialConnectors = [
      /\band then\b/i,
      /\bafter that\b/i,
      /\bfollowed by\b/i,
      /\bthen\b/i,
      /\bsave it(?: as)?\b/i,
      /\bstore it\b/i,
      /\bcreate a task\b/i,
      /\badd it as a task\b/i,
      /\bsummarize (it|that)\b/i,
      /\bsummarise (it|that)\b/i,
    ];
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  /**
   * Produce a WorkflowGraph from a CapabilityContext.
   *
   * @param {import("../capabilities/CapabilityContext.js").CapabilityContext} capabilityContext
   * @returns {WorkflowGraph}
   */
  plan(capabilityContext) {
    const prompt = capabilityContext.prompt;

    if (this._isMultiStep(prompt)) {
      return this._planMultiStep(prompt, capabilityContext);
    }

    return this._planSingleStep(prompt, capabilityContext);
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  /**
   * Decide if a prompt looks like a multi-step request.
   * @param {string} prompt
   * @returns {boolean}
   */
  _isMultiStep(prompt) {
    return this._sequentialConnectors.some(re => re.test(prompt));
  }

  /**
   * Build a single-node graph — used for simple requests.
   * @param {string} prompt
   * @param {import("../capabilities/CapabilityContext.js").CapabilityContext} ctx
   * @returns {WorkflowGraph}
   */
  _planSingleStep(prompt, ctx) {
    const { capability, taskLabel } = this._classifyTask(prompt);
    const graph = new WorkflowGraph();
    graph.addNode(new WorkflowNode({
      id:                 "node_1",
      task:               taskLabel,
      requiredCapability: capability,
      dependencies:       [],
      input:              { prompt },
    }));
    return graph;
  }

  /**
   * Build a multi-node graph by segmenting the prompt at sequential connectors.
   * Each segment is classified independently and linked as a dependency chain.
   * @param {string} prompt
   * @param {import("../capabilities/CapabilityContext.js").CapabilityContext} ctx
   * @returns {WorkflowGraph}
   */
  _planMultiStep(prompt, ctx) {
    const segments = this._splitPrompt(prompt);

    // Guard: if splitting yielded only one meaningful segment, fall back to single node.
    if (segments.length <= 1) {
      return this._planSingleStep(prompt, ctx);
    }

    const graph = new WorkflowGraph();
    let prevNodeId = null;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i].trim();
      if (!seg) continue;

      const { capability, taskLabel } = this._classifyTask(seg);
      const nodeId = `node_${i + 1}`;

      graph.addNode(new WorkflowNode({
        id:                 nodeId,
        task:               taskLabel,
        requiredCapability: capability,
        dependencies:       prevNodeId ? [prevNodeId] : [],
        input:              { prompt: seg },
      }));

      prevNodeId = nodeId;
    }

    // If the graph ended up with only one node (all other segments were empty), return it.
    return graph;
  }

  /**
   * Split a prompt into task segments at sequential connector boundaries.
   * Preserves the content on each side of the connector.
   * @param {string} prompt
   * @returns {string[]}
   */
  _splitPrompt(prompt) {
    // Replace connectors with a sentinel separator, then split
    let modified = prompt;
    for (const re of this._sequentialConnectors) {
      modified = modified.replace(re, " |SEP| ");
    }
    return modified
      .split("|SEP|")
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  /**
   * Classify a single segment into a (capability, taskLabel) pair.
   * Uses the first matching rule from _taskRules.
   * @param {string} text
   * @returns {{ capability: string, taskLabel: string }}
   */
  _classifyTask(text) {
    for (const rule of this._taskRules) {
      const matches = typeof rule.pattern === "function"
        ? rule.pattern(text)
        : rule.pattern.test(text);
      if (matches) {
        return { capability: rule.capability, taskLabel: rule.taskLabel };
      }
    }
    // Unreachable because the last rule is /.*/
    return { capability: "chat", taskLabel: "Dialogue" };
  }
}

export const workflowPlanner = new WorkflowPlanner();
