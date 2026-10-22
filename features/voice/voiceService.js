import { speak } from "./ttsService.js";
import { listen } from "./sttService.js";
import { askAI } from "../../services/ai.js";

export async function handleVoice() {
  console.log("\n🎤 Speak now...\n");

  const recognition = await listen();
  const text = typeof recognition === "string" ? recognition : recognition?.text;

  console.log("[VoiceService] Speech recognized", { characterCount: text?.length || 0 });

  if (!text?.trim()) {
    return { transcript: "", answer: "", error: "No speech was recognized." };
  }

  const answer = await askAI(text.trim());

  const cleanAnswer = answer.replace(/\*\*/g, "");

  await speak(cleanAnswer);

  console.log("\n🎧 Saved audio.wav\n");

  return {
    transcript: text,
    answer
  };
}
