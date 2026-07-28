import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";

import {
  getModelRegistry,
  getModelStatus,
  capabilityMapping,
  resolveModel,
  getModel
} from "./services/modelRegistry.js";

import { getModelHealth, getCooldownRemaining, getModelHealthScore } from "./services/modelSelection/HealthScorer.js";

import { askAI, askGroqStream, getLastModelUsed } from "./services/ai.js";
import { SYSTEM_PROMPT } from "./services/systemPrompt.js";
import { handleVoice } from "./handlers/voiceHandler.js";
import { voiceManager } from "./services/voice/VoiceManager.js";

// Phase 3 — Confirmation Workflow
import {
  confirmAction,
  cancelAction,
  listPending,
  createPending
} from "./services/confirmationService.js";

// Phase 5 — Conversational Action Framework
import {
  getPendingAction,
  removePendingAction
} from "./storage/pendingActionsStorage.js";

// Phase 4 — Gmail API Integration
import {
  getGmailStatus,
  getAuthUrl,
  exchangeCodeForTokens
} from "./services/gmailService.js";

import {
  loadNotes,
  saveNotes,
  noteRoutes
} from "./features/notes/index.js";

import {
  loadTasks,
  saveTasks,
  taskRoutes
} from "./features/tasks/index.js";

import {
  updateSummary
} from "./services/summaryService.js";

import {
  loadPDF,
  chunkText,
  loadPDFMemory,
  savePDFMemory,
  deletePDF,
  askPDF,
  pdfRoutes
} from "./features/pdf/index.js";

import {
  routeRequest
} from "./services/toolRouter.js";

import {
  updateMemory,
  loadMemory,
  saveMemory,
  deleteMemoryKey,
  memoryRoutes
} from "./features/memory/index.js";

import {
  getRecentHistory,
  addMessage,
  loadHistory,
  getHistory,
  chatRoutes
} from "./features/chat/index.js";

import {
  getActivities
} from "./storage/activityStorage.js";

import {
  loadSettings,
  saveSettings
} from "./storage/settingsStorage.js";

import {
  loadStats,
  saveStats,
  incrementStat,
  incrementModelUsage
} from "./storage/statsStorage.js";

const app = express();

const upload = multer({
  dest: "uploads/"
});

app.use(cors());
app.use(express.json());

// ============================================================
// Chat Routes (Refactored into features/chat)
// ============================================================

app.use("/chat", chatRoutes);
app.get("/history", getHistory);

// ============================================================
// POST /voice
// Voice input endpoint
// ============================================================

app.post(
  "/voice",
  async (req, res) => {

    console.log("VOICE ROUTE HIT");

    try {

      const result = await handleVoice();
      res.json(result);

    } catch (err) {

      console.error("VOICE ERROR:");
      console.error(err);

      res.status(500).json({
        error: "Voice failed"
      });
    }
  }
);

// ============================================================
// GET /activities
// ============================================================

app.get(
  "/activities",
  (req, res) => {
    res.json(getActivities());
  }
);

// ============================================================
// Memory Routes (Refactored into features/memory)
// ============================================================

app.use("/memory", memoryRoutes);

// ============================================================
// Notes Routes (Refactored into features/notes)
// ============================================================

app.use("/notes", noteRoutes);

// ============================================================
// Tasks Routes (Refactored into features/tasks)
// ============================================================

app.use("/tasks", taskRoutes);

// ============================================================
// PDF Routes (Refactored into features/pdf)
// ============================================================

app.use("/pdf", pdfRoutes);

// ============================================================
// GET /settings
// POST /settings
// ============================================================

app.get(
  "/settings",
  async (req, res) => {
    const settings = await loadSettings();
    res.json(settings);
  }
);

app.post(
  "/settings",
  async (req, res) => {
    await saveSettings(req.body);
    res.json({ success: true });
  }
);

// ============================================================
// GET /stats
// Returns usage statistics from stats.json
// ============================================================

app.get(
  "/stats",
  async (req, res) => {

    try {

      const stats = await loadStats();
      res.json(stats);

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error: "Failed to load stats"
      });
    }
  }
);

// ============================================================
// GET /backup
// Returns a full JSON backup of all user data
// ============================================================

app.get(
  "/backup",
  async (req, res) => {

    try {

      const [
        tasks,
        notes,
        memory,
        history,
        settings,
        stats
      ] = await Promise.all([
        loadTasks(),
        loadNotes(),
        loadMemory(),
        loadHistory(),
        loadSettings(),
        loadStats()
      ]);

      const backup = {
        version: "1.0",
        timestamp: new Date().toISOString(),
        tasks,
        notes,
        memory,
        history,
        settings,
        stats
      };

      res.json(backup);

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error: "Backup failed"
      });
    }
  }
);

// ============================================================
// POST /restore
// Restores all user data from a backup JSON blob
// ============================================================

app.post(
  "/restore",
  async (req, res) => {

    try {

      const {
        tasks,
        notes,
        memory,
        history,
        settings
      } = req.body;

      const ops = [];

      if (Array.isArray(tasks)) {
        ops.push(saveTasks(tasks));
      }

      if (Array.isArray(notes)) {
        ops.push(saveNotes(notes));
      }

      if (memory && typeof memory === "object") {
        ops.push(saveMemory(memory));
      }

      if (Array.isArray(history)) {
        const {
          saveHistory
        } = await import("./features/chat/index.js");
        ops.push(saveHistory(history));
      }

      if (settings && typeof settings === "object") {
        ops.push(saveSettings(settings));
      }

      await Promise.all(ops);

      res.json({
        success: true,
        restored: {
          tasks: Array.isArray(tasks) ? tasks.length : 0,
          notes: Array.isArray(notes) ? notes.length : 0,
          memory: memory ? Object.keys(memory).length : 0,
          history: Array.isArray(history) ? history.length : 0
        }
      });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error: "Restore failed: " + err.message
      });
    }
  }
);

// ============================================================
// POST /confirm
// Confirm a pending action and execute it
// Phase 3 — Confirmation Workflow
// ============================================================

app.post(
  "/confirm",
  async (req, res) => {

    try {

      const { confirmationId } = req.body;

      if (!confirmationId) {
        return res.status(400).json({
          success: false,
          message: "confirmationId is required."
        });
      }

      const result = await confirmAction(confirmationId);
      
      if (result.success === false) {
        return res.status(400).json(result);
      }
      
      res.json(result);

    } catch (err) {

      console.error("CONFIRM ERROR:", err);

      res.status(500).json({
        success: false,
        message: "Internal error during confirmation."
      });
    }
  }
);

// ============================================================
// Gmail OAuth Routes — Phase 4
// ============================================================

app.get(
  "/gmail/status",
  async (req, res) => {
    try {
      const status = await getGmailStatus();
      res.json(status);
    } catch (err) {
      console.error("Gmail status error:", err);
      res.status(500).json({ error: "Failed to get Gmail status." });
    }
  }
);

app.get(
  "/gmail/auth",
  async (req, res) => {
    try {
      const authUrl = getAuthUrl();
      if (!authUrl) {
        return res.status(400).send("Gmail credentials are not configured in your .env file.");
      }
      res.redirect(authUrl);
    } catch (err) {
      console.error("Gmail auth redirect error:", err);
      res.status(500).send("Failed to initiate Gmail authorization.");
    }
  }
);

app.get(
  "/gmail/callback",
  async (req, res) => {
    try {
      const { code } = req.query;
      if (!code) {
        return res.status(400).send("Authorization code is missing.");
      }
      await exchangeCodeForTokens(code);
      res.send(`
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background-color: #1e1e2e; color: #cdd6f4;">
            <div style="background-color: #313244; padding: 30px; border-radius: 10px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <h2 style="color: #a6e3a1;">✅ Gmail Linked Successfully!</h2>
              <p>samGPT is now authorized to send emails through your Gmail account.</p>
              <p style="color: #a6adc8; font-size: 14px;">You can close this tab and return to the application.</p>
            </div>
          </body>
        </html>
      `);
    } catch (err) {
      console.error("Gmail callback error:", err);
      res.status(500).send("Failed to complete Gmail authorization: " + err.message);
    }
  }
);

// ============================================================
// POST /cancel
// Cancel a pending action without executing it
// Phase 3 — Confirmation Workflow
// ============================================================

app.post(
  "/cancel",
  async (req, res) => {

    try {

      const { confirmationId } = req.body;

      if (!confirmationId) {
        return res.status(400).json({
          success: false,
          message: "confirmationId is required."
        });
      }

      const result = await cancelAction(confirmationId);
      res.json(result);

    } catch (err) {

      console.error("CANCEL ERROR:", err);

      res.status(500).json({
        success: false,
        message: "Internal error during cancellation."
      });
    }
  }
);

// ============================================================
// GET /pending
// List all active pending confirmation actions
// Phase 3 — Confirmation Workflow
// ============================================================

app.get(
  "/pending",
  async (req, res) => {

    try {

      const pending = await listPending();
      res.json(pending);

    } catch (err) {

      console.error("PENDING LIST ERROR:", err);

      res.status(500).json({
        error: "Failed to load pending actions."
      });
    }
  }
);

// ============================================================
// POST /email/provide-input
// Resume a WAITING_FOR_INPUT email draft after the user provides
// missing information (typically the recipient email address).
//
// Phase 5 — Conversational Action Framework
//
// This route:
//   1. Loads the existing pending action (draft stored in payload)
//   2. Validates the provided email address
//   3. Saves the new contact to memory (for future lookups)
//   4. Removes the WAITING_FOR_INPUT pending record
//   5. Creates a new confirmed_draft pending record
//   6. Streams __CONFIRMATION__:<json> — same protocol as /chat/stream
//
// The planner is NOT re-invoked. The original draft is fully preserved.
// ============================================================

app.post(
  "/email/provide-input",
  async (req, res) => {
    try {
      const { confirmationId, userInput } = req.body;

      if (!confirmationId || !userInput) {
        return res.status(400).json({
          success: false,
          message: "confirmationId and userInput are required."
        });
      }

      // Load the WAITING_FOR_INPUT pending record
      const pending = await getPendingAction(confirmationId);
      if (!pending) {
        return res.status(404).json({
          success: false,
          message: "This request has expired or was not found. Please start a new email draft."
        });
      }

      const draft = pending.payload?.draft;
      if (!draft) {
        return res.status(400).json({
          success: false,
          message: "Invalid pending action — no draft data found."
        });
      }

      // Extract a valid email address from the user's input
      const emailMatch = userInput.trim().match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
      const providedEmail = emailMatch ? emailMatch[0].trim() : userInput.trim();

      // Validate the extracted email
      const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!EMAIL_REGEX.test(providedEmail)) {
        console.log(`\n📧 Validation Failed — invalid input: "${providedEmail}"`);
        return res.status(400).json({
          success: false,
          message: `"${providedEmail}" doesn't look like a valid email address. Please provide a valid email (e.g. name@example.com).`
        });
      }

      // Save the contact to memory for future lookups
      if (draft.recipientName) {
        const memory = await loadMemory();
        if (!memory.contacts) memory.contacts = {};
        memory.contacts[draft.recipientName] = {
          email: providedEmail,
          savedAt: new Date().toISOString()
        };
        await saveMemory(memory);
        console.log(`\n📧 Contact Saved: "${draft.recipientName}" → ${providedEmail}`);
      }

      // Remove the old WAITING_FOR_INPUT pending record
      await removePendingAction(confirmationId);

      // Build the confirmed_draft payload with the now-complete recipient
      const confirmPayload = {
        tool: "email_draft",
        action: "confirmed_draft",
        input: {
          to: providedEmail,
          cc: draft.cc || [],
          bcc: draft.bcc || [],
          subject: draft.subject,
          body: draft.body,
          html: draft.html || "",
          signature: draft.signature || ""
        }
      };

      const preview = {
        to: providedEmail,
        cc: (draft.cc || []).join(", "),
        bcc: (draft.bcc || []).join(", "),
        subject: draft.subject,
        body: draft.body,
        signature: draft.signature || ""
      };

      // Create the confirmation pending record (reuses existing confirmationService)
      const newPending = await createPending({
        tool: "email_draft",
        action: "draft",
        payload: confirmPayload,
        preview,
        title: "Send Email",
        message: "Review and confirm this email before sending.",
        ttlMinutes: 30
      });

      // Store messages in history
      await addMessage("user", userInput);
      await addMessage(
        "assistant",
        `📧 Got it! I'll send to ${providedEmail}. Please review the draft below.`
      );

      await incrementStat("messages");

      // Stream the confirmation response — same protocol as /chat/stream
      res.setHeader("Content-Type", "text/plain");
      res.setHeader("Transfer-Encoding", "chunked");
      res.write("__CONFIRMATION__:" + JSON.stringify(newPending));
      res.end();

    } catch (err) {
      console.error("EMAIL PROVIDE-INPUT ERROR:", err);
      res.status(500).json({
        success: false,
        message: "Internal error processing email input: " + err.message
      });
    }
  }
);

// ============================================================
// GET /models
// Returns the full model registry with all metadata.
// Frontend reads this to populate model cards and dropdowns dynamically.
// ============================================================

app.get(
  "/models",
  (req, res) => {
    try {
      const registry = getModelRegistry();
      const enriched = registry.map(model => {
        const health = getModelHealth(model.key);
        return {
          ...model,
          health:              getModelHealthScore(model.key),
          cooldown:            getCooldownRemaining(model.key),
          averageLatency:      health.avgLatencyMs,
          successRate:         health.successRate,
          failureCount:        health.totalFailures,
          contextSize:         model.contextWindow,
          capabilityScores:    model.scores,
        };
      });
      res.json(enriched);
    } catch (err) {
      console.error("MODELS ERROR:", err);
      res.status(500).json({ error: "Failed to load model registry" });
    }
  }
);

// ============================================================
// GET /models/health
// Runs provider.health(modelId) for each enabled model in parallel.
// Returns { [key]: "online" | "offline" | "disabled" | "local" }
// ============================================================

app.get(
  "/models/health",
  async (req, res) => {
    try {
      const registry = getModelRegistry();

      const { googleProvider }     = await import("./services/providers/googleProvider.js");
      const { groqProvider }       = await import("./services/providers/groqProvider.js");
      const { deepseekProvider }   = await import("./services/providers/deepseekProvider.js");
      const { glmProvider }        = await import("./services/providers/glmProvider.js");
      const { openRouterProvider } = await import("./services/providers/openRouterProvider.js");
      const { ollamaProvider }     = await import("./services/providers/ollamaProvider.js");

      const providerMap = {
        google: googleProvider,
        groq: groqProvider,
        deepseek: deepseekProvider,
        glm: glmProvider,
        openrouter: openRouterProvider,
        ollama: ollamaProvider
      };

      const checks = registry.map(async (model) => {
        if (!model.enabled || model.status === "disabled") {
          return [model.key, "disabled"];
        }
        if (model.provider === "ollama") {
          return [model.key, "local"];
        }
        try {
          const provider = providerMap[model.provider];
          if (provider && typeof provider.health === "function") {
            const healthy = await provider.health(model.modelId);
            return [model.key, healthy ? "online" : "offline"];
          }
          return [model.key, getModelStatus(model.key)];
        } catch {
          return [model.key, "offline"];
        }
      });

      const results = await Promise.all(checks);
      const healthMap = Object.fromEntries(results);
      res.json(healthMap);
    } catch (err) {
      console.error("MODELS HEALTH ERROR:", err);
      res.status(500).json({ error: "Health check failed" });
    }
  }
);

// ============================================================
// POST /models/test/:key
// Sends a lightweight test prompt to the specified model.
// Returns { success, latency, provider, modelId, displayName, tokens, response }
// ============================================================

app.post(
  "/models/test/:key",
  async (req, res) => {
    const { key } = req.params;
    try {
      const modelConfig = getModel(key);
      if (!modelConfig) {
        return res.status(404).json({ success: false, error: `Model "${key}" not found in registry.` });
      }

      if (!modelConfig.enabled) {
        return res.status(400).json({ success: false, error: `Model "${key}" is disabled.` });
      }

      const { googleProvider }     = await import("./services/providers/googleProvider.js");
      const { groqProvider }       = await import("./services/providers/groqProvider.js");
      const { deepseekProvider }   = await import("./services/providers/deepseekProvider.js");
      const { glmProvider }        = await import("./services/providers/glmProvider.js");
      const { openRouterProvider } = await import("./services/providers/openRouterProvider.js");
      const { ollamaProvider }     = await import("./services/providers/ollamaProvider.js");

      const providerMap = {
        google: googleProvider,
        groq: groqProvider,
        deepseek: deepseekProvider,
        glm: glmProvider,
        openrouter: openRouterProvider,
        ollama: ollamaProvider
      };

      const provider = providerMap[modelConfig.provider];
      if (!provider) {
        return res.status(500).json({ success: false, error: `Provider "${modelConfig.provider}" not found.` });
      }

      const testPrompt = "Respond with exactly: OK";
      const startTime = Date.now();
      const response = await provider.generate(modelConfig.modelId, testPrompt, {});
      const latency = Date.now() - startTime;

      const outputTokens = Math.ceil((response || "").length / 4);

      res.json({
        success: true,
        latency,
        provider: modelConfig.provider,
        modelId: modelConfig.modelId,
        displayName: modelConfig.displayName || key,
        tokens: outputTokens,
        response: (response || "").slice(0, 100)
      });
    } catch (err) {
      console.error(`MODEL TEST ERROR [${key}]:`, err.message);
      res.json({
        success: false,
        error: err.message,
        provider: null,
        latency: null,
        tokens: 0
      });
    }
  }
);

// ============================================================
// GET /models/capabilities
// Returns the current capability→model mapping, merged with
// any per-capability overrides the user has saved in Settings.
// Frontend uses this to display active routing configuration.
// ============================================================

app.get(
  "/models/capabilities",
  async (req, res) => {
    try {
      const { loadSettings } = await import("./storage/settingsStorage.js");
      const settings = await loadSettings();
      const overrides = settings.capabilityRoutes || {};

      // Merge default mapping with user overrides
      const effective = { ...capabilityMapping };
      for (const [capability, modelKey] of Object.entries(overrides)) {
        if (modelKey) effective[capability] = modelKey;
      }

      res.json({
        default: capabilityMapping,
        overrides,
        effective
      });
    } catch (err) {
      console.error("CAPABILITIES ERROR:", err);
      res.status(500).json({ error: "Failed to load capability mapping" });
    }
  }
);

// ============================================================
// GET /audio/devices
// Returns discovered ALSA audio input and output devices.
// ============================================================
app.get(
  "/audio/devices",
  async (req, res) => {
    try {
      const { getAudioDevices } = await import("./services/voice/AudioDeviceManager.js");
      const devices = await getAudioDevices();
      res.json(devices);
    } catch (err) {
      console.error("AUDIO DEVICES ERROR:", err);
      res.status(500).json({ error: "Failed to query audio hardware" });
    }
  }
);

// ============================================================
// Start server
// ============================================================

app.listen(
  3001,
  () => {
    console.log("🚀 Personal Agent API running on port 3001");
    console.log("📁 Storage: ~/.personal-agent/");
  }
);

// ============================================================
// Voice Assistant Process Message Handling
// ============================================================

// Initialize voice manager
voiceManager.init().catch(err => console.error("Failed to init voice manager:", err));

if (typeof process.on === "function") {
  process.on("message", async (msg) => {
    if (!msg || !msg.type) return;

    console.log("[Backend IPC] Received message:", msg);

    try {
      switch (msg.type) {
        case "START_VOICE_MODE":
          voiceManager.startVoiceMode();
          break;
        case "STOP_VOICE_MODE":
          voiceManager.stopVoiceMode();
          break;
        case "TOGGLE_VOICE_MODE":
          await voiceManager.toggleVoiceMode();
          break;
        case "START_LISTENING":
          await voiceManager.startListening();
          break;
        case "CANCEL_LISTENING":
          voiceManager.cancelListening();
          break;
        case "STOP_SPEAKING":
          voiceManager.stopSpeaking();
          break;
        case "PAUSE_SPEAKING":
          voiceManager.queue.pause();
          break;
        case "RESUME_SPEAKING":
          voiceManager.queue.resume();
          break;
        case "RELOAD_VOICE_SETTINGS":
          await voiceManager.reloadSettings();
          break;
        default:
          break;
      }
    } catch (err) {
      console.error("[Backend IPC] Error handling process message:", err);
    }
  });
}

// ============================================================
// Phase 2 — Desktop Control API Endpoints
// ============================================================

// GET /desktop/history
// Returns recent desktop actions (last 100) for the Desktop page history panel.
app.get(
  "/desktop/history",
  async (req, res) => {
    try {
      const { loadDesktopHistory } = await import("./storage/desktopHistoryStorage.js");
      const history = await loadDesktopHistory();
      res.json(history);
    } catch (err) {
      console.error("DESKTOP HISTORY ERROR:", err);
      res.status(500).json({ error: "Failed to load desktop history" });
    }
  }
);

// GET /desktop/system-status
// Returns a live snapshot of CPU, memory, battery, WiFi for the SystemStatusWidget.
// Aggregates multiple SystemManager calls in parallel for fast response.
app.get(
  "/desktop/system-status",
  async (req, res) => {
    try {
      const { SystemManager } = await import("./services/desktop/SystemManager.js");
      const sm = new SystemManager();

      const [cpu, memory, battery, wifi] = await Promise.allSettled([
        sm.getCpuUsage(),
        sm.getMemoryUsage(),
        sm.getBattery(),
        sm.getWifiStatus()
      ]);

      // Safely extract values (each result is { status:'fulfilled'|'rejected', value? })
      const pick = (r) => r.status === "fulfilled" ? r.value : null;

      res.json({
        cpu:    pick(cpu),
        memory: pick(memory),
        battery: pick(battery),
        wifi:   pick(wifi),
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error("DESKTOP SYSTEM-STATUS ERROR:", err);
      res.status(500).json({ error: "Failed to retrieve system status" });
    }
  }
);

// GET /desktop/screenshot/:filename
// Serves a saved screenshot file from ~/.personal-agent/screenshots/
// Validates filename to prevent path traversal.
app.get(
  "/desktop/screenshot/:filename",
  async (req, res) => {
    try {
      const { ScreenshotService } = await import("./services/desktop/ScreenshotService.js");
      const { validateFilename }   = await import("./services/desktop/SecurityValidator.js");
      const path = (await import("path")).default;

      const { filename } = req.params;

      const valid = validateFilename(filename);
      if (!valid.valid) {
        return res.status(400).json({ error: valid.error });
      }

      const ss       = new ScreenshotService();
      const filePath = path.join(ss.getScreenshotsDir(), filename);

      res.sendFile(filePath, (err) => {
        if (err) {
          res.status(404).json({ error: "Screenshot not found" });
        }
      });
    } catch (err) {
      console.error("DESKTOP SCREENSHOT SERVE ERROR:", err);
      res.status(500).json({ error: "Failed to serve screenshot" });
    }
  }
);