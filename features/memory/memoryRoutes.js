import express from "express";
import {
  getMemory,
  deleteMemory
} from "./memoryController.js";

const router = express.Router();

router.get("/", getMemory);
router.delete("/:key", deleteMemory);

export default router;
