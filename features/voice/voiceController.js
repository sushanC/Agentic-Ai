import { handleVoice } from "./voiceService.js";
import { logSafeError } from "../../services/httpSecurity.js";

export async function postVoiceController(req, res) {
  console.log("VOICE ROUTE HIT");

  try {
    const result = await handleVoice();
    res.json(result);
  } catch (err) {
    logSafeError("Voice request failed", err);
    res.status(500).json({
      error: "Voice failed"
    });
  }
}
