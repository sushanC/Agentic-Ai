import { handleVoice } from "./voiceService.js";

export async function postVoiceController(req, res) {
  console.log("VOICE ROUTE HIT");

  try {
    const result = await handleVoice();
    res.json(result);
  } catch (err) {
    console.error("VOICE ERROR:", err);
    res.status(500).json({
      error: "Voice failed"
    });
  }
}
