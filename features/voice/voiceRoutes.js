import express from "express";
import { postVoiceController } from "./voiceController.js";

const router = express.Router();

router.post("/", postVoiceController);

export default router;
