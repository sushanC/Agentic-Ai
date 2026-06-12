import {
  speak
} from "../services/ttsService.js";

import {
  listen
} from "../services/sttService.js";

import {
  askAI
} from "../services/ai.js";

export async function handleVoice() {

  console.log(
    "\n🎤 Speak now...\n"
  );

  const text =
    await listen();

  console.log(
    `\nYou Said:\n${text}`
  );

  const answer =
    await askAI(text);

  await speak(answer);

  console.log(
  "\n🎧 Saved audio.wav\n"
);

  return {
    transcript: text,
    answer
  };
}