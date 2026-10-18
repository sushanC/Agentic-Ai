import express from "express";

import { createChatController } from "./chatController.js";

export function createChatRouter(controller = createChatController()) {
  const router = express.Router();

  router.post("/", controller.postChat);
  router.post("/stream", controller.postStreamChat);
  router.get("/history", controller.getHistory);
  return router;
}

const router = createChatRouter();
export default router;
