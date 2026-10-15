import * as memoryService from "./memoryService.js";
import { logSafeError } from "../../services/httpSecurity.js";

export async function getMemory(req, res) {
  try {
    const facts = await memoryService.getMemoryFacts();
    res.json(facts);
  } catch (err) {
    logSafeError("Memory retrieval failed", err);
    res.status(500).json({
      error: "Failed to load memory"
    });
  }
}

export async function deleteMemory(req, res) {
  try {
    await memoryService.deleteMemoryKey(req.params.key);
    res.json({ success: true });
  } catch (err) {
    logSafeError("Memory deletion failed", err);
    res.status(500).json({
      error: "Failed to delete memory"
    });
  }
}
