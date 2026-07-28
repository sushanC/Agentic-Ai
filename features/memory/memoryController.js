import * as memoryService from "./memoryService.js";

export async function getMemory(req, res) {
  try {
    const facts = await memoryService.getMemoryFacts();
    res.json(facts);
  } catch (err) {
    console.error(err);
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
    console.error(err);
    res.status(500).json({
      error: "Failed to delete memory"
    });
  }
}
