import express from "express";

import {
  postChat,
  postStreamChat,
  getHistory
} from "./chatController.js";

const router = express.Router();

router.post("/", postChat);
router.post("/stream", postStreamChat);
router.get("/history", getHistory);

export default router;
