import {
  speak
} from "../services/ttsService.js";

import {
  listen
} from "../services/sttService.js";

import {
  askAI
} from "../services/ai.js";

export async function handleVoice(
  userMessage
) {

  if (
    userMessage
      .toLowerCase()
      .startsWith(
        "speak "
      )
  ) {

    const text =
      userMessage.replace(
        /^speak /i,
        ""
      );

    console.log(
      "\n🔊 Speaking...\n"
    );

    await speak(
      text
    );

    return true;
  }

  if (
  userMessage
    .toLowerCase() ===
  "voice mode"
) {

  const spoken =
    await listen();

  console.log(
    "\nYou Said:"
  );

  console.log(
    spoken
  );

  const answer =
    await askAI(
      spoken
    );

  console.log(
    "\nAI:"
  );

  console.log(
    answer
  );

  await speak(
    answer
  );

  return true;
}

  return false;
}