import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";

import { askAI } from "./services/ai.js";
import { handleVoice } from "./handlers/voiceHandler.js";
import {
  loadNotes,
  saveNotes
} from "./storage/notesStorage.js";

import {
  loadTasks,
  saveTasks
} from "./storage/tasksStorage.js";

const app = express();
const upload =
  multer({
    dest: "uploads/"
  });

import {
  loadPDF,
  chunkText
} from "./services/pdfService.js";

import {
  getEmbedding
} from "./services/embeddingService.js";

import {
  loadPDFMemory,
  savePDFMemory
} from "./storage/pdfStorage.js";

import {
  askPDF
} from "./services/pdfQAService.js";

app.use(cors());

app.use(express.json());

app.post(
  "/chat",
  async (req, res) => {

    try {

      const { message } =
        req.body;

      const reply =
        await askAI(
          message
        );

      res.json({
        reply
      });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error:
          "AI request failed"
      });
    }
  }
);

app.post(
  "/voice",
  async (req, res) => {

    try {

      const result =
        await handleVoice();

      res.json(result);

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error:
          "Voice failed"
      });
    }
  }
);

app.get(
  "/notes",
  async (req, res) => {

    const notes =
      await loadNotes();

    res.json(notes);
  }
);

app.post(
  "/notes",
  async (req, res) => {

    const { content } =
      req.body;

    const notes =
      await loadNotes();

    notes.push({

      id: Date.now(),

      content
    });

    await saveNotes(
      notes
    );

    res.json({
      success: true
    });
  }
);

app.get(
  "/tasks",
  async (req, res) => {

    const tasks =
      await loadTasks();

    res.json(tasks);
  }
);

app.post(
  "/tasks",
  async (req, res) => {

    const { text } =
      req.body;

    const tasks =
      await loadTasks();

    tasks.push({

      id: Date.now(),

      text,

      completed: false
    });

    await saveTasks(
      tasks
    );

    res.json({
      success: true
    });
  }
);

app.put(
  "/tasks/:id",
  async (req, res) => {

    const tasks =
      await loadTasks();

    const task =
      tasks.find(
        t =>
          t.id ===
          Number(
            req.params.id
          )
      );

    if (task) {

      task.completed =
        !task.completed;

      await saveTasks(
        tasks
      );
    }

    res.json({
      success: true
    });
  }
);

app.post(
  "/pdf/upload",
  upload.single("pdf"),

  async (req, res) => {

    try {

      const path =
        req.file.path;

      const text =
        await loadPDF(path);

      const chunks =
        chunkText(text);

      const embeddedChunks =
        [];

      for (
        const chunk of chunks
      ) {

        const embedding =
          await getEmbedding(
            chunk
          );

        embeddedChunks.push({

          text: chunk,

          embedding
        });
      }

      const memory =
        await loadPDFMemory();

      memory[
        req.file.originalname
      ] =
        embeddedChunks;

      await savePDFMemory(
        memory
      );

      res.json({

        success: true,

        file:
          req.file.originalname
      });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error:
          "Upload failed"
      });
    }
  }
);

app.get(
  "/pdf/list",

  async (req, res) => {

    const memory =
      await loadPDFMemory();

    res.json(
      Object.keys(
        memory
      )
    );
  }
);

app.post(
  "/pdf/ask",
  async (req, res) => {

    try {

      const {
        pdfName,
        question
      } = req.body;

      console.log(
        "PDF:",
        pdfName
      );

      console.log(
        "Question:",
        question
      );

const answer =
  await askPDF(
    pdfName,
    question
  );

      res.json({
        answer
      });

    } catch (err) {

      console.error(
        "PDF ASK ERROR:"
      );

      console.error(err);

      res.status(500).json({
        error:
          err.message
      });
    }
  }
);
app.listen(
  3001,
  () => {

    console.log(
      "🚀 API running on port 3001"
    );
  }
);