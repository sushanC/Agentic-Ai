import path from "node:path";
import { logSafeError } from "../../services/httpSecurity.js";

/**
 * Request context contract:
 * - chat: intent-filtered CIE memory, recent history and compressed summary;
 * - email: semantic contact/profile memory plus explicit user preferences;
 * - calendar: semantic calendar facts plus explicit user preferences;
 * - other capabilities: no ambient memory/history/PDF contents by default.
 *
 * PDF content stays with PDFCapability/pdfService, which retrieves only the
 * selected document. Provider token fitting remains in TokenBudgetManager.
 */
export class ContextAssembly {
  constructor(dependencies = {}) {
    this.dependencies = dependencies;
  }

  async assembleContext(prompt, options = {}) {
    const toolContext = options.toolContext || "chat";
    const capabilities = new Set(options.capabilities || ["chat"]);
    const settings = options.settings || await this._loadSettings();
    const result = {
      prompt: String(prompt || ""),
      toolContext,
      requestContext: options.requestContext || null,
      intent: null,
      memory: {},
      history: [],
      summary: "",
      pdfMemory: {},
      userPreferences: {},
      assembledAt: new Date().toISOString(),
      contextSources: [],
    };

    try {
      if (capabilities.has("chat")) {
        result.intent = await this._detectIntent(result.prompt, toolContext, settings);
        const [memory, history, summary] = await Promise.all([
          this._retrieveChatMemory(result.prompt, result.intent, settings),
          this._getHistory(result.intent, settings),
          this._getSummary(result.intent, settings),
        ]);
        result.memory = memory || {};
        result.history = history || [];
        result.summary = summary || "";
        result.contextSources.push("intent_memory", "recent_history", "summary");
      } else if (capabilities.has("email") || capabilities.has("calendar")) {
        const intent = capabilities.has("email") ? "Email" : "Calendar";
        result.memory = await this._retrieveDomainMemory(result.prompt, intent, settings);
        result.contextSources.push("semantic_memory");
      }

      if (capabilities.has("email") || capabilities.has("calendar")) {
        result.userPreferences = await this._getUserPreferences();
        result.contextSources.push("user_preferences");
      }

      if (options.includePdfMemory === true) {
        result.pdfMemory = await this._loadPdfMemory();
        result.contextSources.push("pdf_memory");
      }
    } catch (err) {
      logSafeError("Context assembly failed", err);
      // Context is an enhancement. Preserve the original request and tool path.
    }

    return result;
  }

  async _loadSettings() {
    if (this.dependencies.loadSettings) return this.dependencies.loadSettings();
    const { loadSettings } = await import("../../features/settings/settingsStorage.js");
    return loadSettings();
  }

  async _detectIntent(prompt, toolContext, settings) {
    if (this.dependencies.detectIntent) return this.dependencies.detectIntent(prompt, toolContext, settings);
    const { detectIntent } = await import("../../services/cie/IntentDetector.js");
    return detectIntent(prompt, toolContext, settings);
  }

  async _retrieveChatMemory(prompt, intent, settings) {
    if (this.dependencies.retrieveChatMemory) return this.dependencies.retrieveChatMemory(prompt, intent, settings);
    const { retrieveRelevantMemory } = await import("../../services/cie/MemoryRetriever.js");
    return retrieveRelevantMemory(prompt, intent, settings);
  }

  async _getHistory(intent, settings) {
    if (this.dependencies.getHistory) return this.dependencies.getHistory(intent, settings);
    const { getDynamicHistory } = await import("../../services/cie/HistoryManager.js");
    return getDynamicHistory(intent, settings);
  }

  async _getSummary(intent, settings) {
    if (this.dependencies.getSummary) return this.dependencies.getSummary(intent, settings);
    const { getCompressedSummary } = await import("../../services/cie/SummaryManager.js");
    return getCompressedSummary(intent, settings);
  }

  async _retrieveDomainMemory(prompt, intent, settings) {
    if (this.dependencies.retrieveDomainMemory) return this.dependencies.retrieveDomainMemory(prompt, intent, settings);
    const { memoryManager } = await import("../../features/memory/index.js");
    return memoryManager.retrieve(prompt, { topK: settings.maxMemoryKeys ?? 10, intent, stores: ["semantic"] });
  }

  async _getUserPreferences() {
    if (this.dependencies.getUserPreferences) return this.dependencies.getUserPreferences();
    const { memoryManager } = await import("../../features/memory/index.js");
    const store = memoryManager.registry.getStore("preference");
    const items = store ? await store.getAll() : [];
    return Object.fromEntries(items
      .filter(item => item.content?.key)
      .map(item => [item.content.key, item.content.value]));
  }

  async _loadPdfMemory() {
    if (this.dependencies.loadPdfMemory) return this.dependencies.loadPdfMemory();
    const { loadPDFMemory } = await import("../../features/pdf/index.js");
    return loadPDFMemory();
  }

  static assembleContext(prompt, options = {}) {
    return defaultContextAssembly.assembleContext(prompt, options);
  }

  /** Find the likely document name; PDF content itself is retrieved by pdfService. */
  static async findBestPDF(question) {
    try {
      const { loadPDFMemory } = await import("../../features/pdf/index.js");
      const memory = await loadPDFMemory();
      const pdfNames = Object.keys(memory || {});
      if (!pdfNames.length) return null;
      if (pdfNames.length === 1) return pdfNames[0];

      const qWords = new Set(String(question || "").toLowerCase().split(/\W+/).filter(word => word.length > 3));
      let bestName = pdfNames[0];
      let bestScore = 0;
      for (const name of pdfNames) {
        const words = path.basename(name).toLowerCase().replace(/[_\-.]/g, " ").split(/\W+/).filter(word => word.length > 3);
        const score = words.reduce((total, word) => total + Number(qWords.has(word)), 0);
        if (score > bestScore) { bestName = name; bestScore = score; }
      }
      return bestName;
    } catch (err) {
      logSafeError("PDF context lookup failed", err);
      return null;
    }
  }
}

const defaultContextAssembly = new ContextAssembly();
