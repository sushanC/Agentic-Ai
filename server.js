import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";

import { askAI } from "./services/ai.js";
import { askGroqStream } from "./services/ai.js";
import { SYSTEM_PROMPT } from "./services/systemPrompt.js";
import { handleVoice } from "./handlers/voiceHandler.js";

import {
  loadNotes,
  saveNotes
} from "./storage/notesStorage.js";

import {
  loadTasks,
  saveTasks
} from "./storage/tasksStorage.js";

import {
  updateSummary
} from "./services/summaryService.js";

import {
  loadPDF,
  chunkText
} from "./services/pdfService.js";

import {
  getEmbedding
} from "./services/embeddingService.js";

import {
  loadPDFMemory,
  savePDFMemory,
  deletePDF
} from "./storage/pdfStorage.js";

import {
  askPDF
} from "./services/pdfQAService.js";

import {
  routeRequest
} from "./services/toolRouter.js";

import {
  updateMemory
} from "./services/memoryService.js";

import {
  getRecentHistory,
  addMessage
} from "./services/historyService.js";

import {
  loadMemory,
  saveMemory,
  deleteMemoryKey
} from "./storage/memoryStorage.js";

import {
  loadHistory
} from "./storage/chatHistoryStorage.js";

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
// POST /chat
// Standard (non-streaming) chat endpoint
// ============================================================

app.post(
  "/chat",
  async (req, res) => {

    try {

      const { message } = req.body;

      await addMessage("user", message);
      await updateMemory(message);

      const result = await routeRequest(message);
      const reply = result.answer;

      await addMessage("assistant", reply);
      await updateSummary();
      await incrementStat("messages");

      res.json({ reply });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error: "AI request failed"
      });
    }
  }
);

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
// POST /chat/stream
// Streaming chat endpoint (used by frontend)
// ============================================================

app.post(
  "/chat/stream",
  async (req, res) => {

    try {

      const { message } = req.body;

      // Run memory extraction ONCE
      await updateMemory(message);

      const result = await routeRequest(message);

      // Tool-based results (agent, web, pdf, task, note, memory)
      // — return immediately without streaming
      if (result.tool !== "chat") {

        await addMessage("user", message);
        await addMessage("assistant", result.answer);
        await incrementStat("messages");

        res.setHeader("Content-Type", "text/plain");
        res.setHeader("Transfer-Encoding", "chunked");
        res.write(result.answer);
        return res.end();
      }

      // Normal chat — stream via Groq
      res.setHeader("Content-Type", "text/plain");
      res.setHeader("Transfer-Encoding", "chunked");

      await addMessage("user", message);

      const memory = await loadMemory();
      const history = await getRecentHistory(10);

      const fullPrompt = `
User Profile:

${JSON.stringify(memory, null, 2)}

Recent Conversation:

${history
  .map(msg => `${msg.role}: ${msg.content}`)
  .join("\n")
}

Current User Message:

${message}

${SYSTEM_PROMPT}
`;

      console.log("\n🧠 MEMORY:");
      console.log(memory);
      console.log("\n💬 USER:");
      console.log(message);

      const stream = await askGroqStream(fullPrompt);

      let fullResponse = "";

      for await (const chunk of stream) {

        const content =
          chunk.choices?.[0]?.delta?.content;

        if (content) {
          fullResponse += content;
          res.write(content);
        }
      }

      await addMessage("assistant", fullResponse);
      await updateSummary();
      await incrementStat("messages");

      res.end();

    } catch (err) {

      console.error(err);
      res.status(500).end();
    }
  }
);

// ============================================================
// GET /history
// ============================================================

app.get(
  "/history",
  async (req, res) => {

    try {

      const history = await loadHistory();
      res.json(history);

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error: "Failed to load history"
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
// GET /memory
// POST handled via /chat with "remember ..."
// DELETE /memory/:key
// ============================================================

app.get(
  "/memory",
  async (req, res) => {

    try {

      const memory = await loadMemory();

      const facts = Object.entries(memory)
        .map(([key, value]) => ({
          id: key,
          text: Array.isArray(value)
            ? value.join(", ")
            : String(value),
          category: key
        }));

      res.json(facts);

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error: "Failed to load memory"
      });
    }
  }
);

app.delete(
  "/memory/:key",
  async (req, res) => {

    try {

      await deleteMemoryKey(req.params.key);

      res.json({ success: true });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error: "Failed to delete memory"
      });
    }
  }
);

// ============================================================
// GET /notes
// POST /notes
// PUT /notes/:id
// DELETE /notes/:id
// ============================================================

app.get(
  "/notes",
  async (req, res) => {
    const notes = await loadNotes();
    res.json(notes);
  }
);

app.post(
  "/notes",
  async (req, res) => {

    const { content } = req.body;
    const notes = await loadNotes();

    notes.push({
      id: Date.now(),
      content
    });

    await saveNotes(notes);
    await incrementStat("notes_saved");

    res.json({ success: true });
  }
);

app.put(
  "/notes/:id",
  async (req, res) => {

    const { content } = req.body;
    const notes = await loadNotes();

    const note = notes.find(
      n => n.id === Number(req.params.id)
    );

    if (note) {
      note.content = content;
    }

    await saveNotes(notes);

    res.json({ success: true });
  }
);

app.delete(
  "/notes/:id",
  async (req, res) => {

    const notes = await loadNotes();

    const updated = notes.filter(
      note => note.id !== Number(req.params.id)
    );

    await saveNotes(updated);

    res.json({ success: true });
  }
);

// ============================================================
// GET /tasks
// POST /tasks
// PUT /tasks/:id
// DELETE /tasks/:id
// ============================================================

app.get(
  "/tasks",
  async (req, res) => {
    const tasks = await loadTasks();
    res.json(tasks);
  }
);

app.post(
  "/tasks",
  async (req, res) => {

    const { text } = req.body;
    const tasks = await loadTasks();

    tasks.push({
      id: Date.now(),
      text,
      completed: false
    });

    await saveTasks(tasks);
    await incrementStat("tasks_created");

    res.json({ success: true });
  }
);

app.put(
  "/tasks/:id",
  async (req, res) => {

    const tasks = await loadTasks();

    const task = tasks.find(
      t => t.id === Number(req.params.id)
    );

    if (task) {
      task.completed = !task.completed;
      await saveTasks(tasks);
    }

    res.json({ success: true });
  }
);

app.delete(
  "/tasks/:id",
  async (req, res) => {

    const tasks = await loadTasks();

    const updated = tasks.filter(
      task => task.id !== Number(req.params.id)
    );

    await saveTasks(updated);

    res.json({ success: true });
  }
);

// ============================================================
// POST /pdf/upload
// GET /pdf/list
// POST /pdf/ask
// DELETE /pdf/:name
// ============================================================

app.post(
  "/pdf/upload",
  upload.single("pdf"),

  async (req, res) => {

    try {

      const path = req.file.path;
      const text = await loadPDF(path);
      const chunks = chunkText(text);

      const embeddedChunks = [];

      for (const chunk of chunks) {

        const embedding = await getEmbedding(chunk);

        embeddedChunks.push({
          text: chunk,
          embedding
        });
      }

      const memory = await loadPDFMemory();

      memory[req.file.originalname] = embeddedChunks;

      await savePDFMemory(memory);

      res.json({
        success: true,
        file: req.file.originalname
      });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error: "Upload failed"
      });
    }
  }
);

app.get(
  "/pdf/list",
  async (req, res) => {
    const memory = await loadPDFMemory();
    res.json(Object.keys(memory));
  }
);

app.post(
  "/pdf/ask",
  async (req, res) => {

    try {

      const { pdfName, question } = req.body;

      console.log("PDF:", pdfName);
      console.log("Question:", question);

      const answer = await askPDF(
        pdfName,
        question
      );

      res.json({ answer });

    } catch (err) {

      console.error("PDF ASK ERROR:");
      console.error(err);

      res.status(500).json({
        error: err.message
      });
    }
  }
);

app.delete(
  "/pdf/:name",
  async (req, res) => {

    try {

      await deletePDF(req.params.name);

      res.json({ success: true });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error: "Failed to delete PDF"
      });
    }
  }
);

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
        } = await import("./storage/chatHistoryStorage.js");
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
// Start server
// ============================================================

app.listen(
  3001,
  () => {
    console.log("🚀 Personal Agent API running on port 3001");
    console.log("📁 Storage: ~/.personal-agent/");
  }
);