import {
  loadAIMode,
  saveAIMode
} from "../storage/aiModeStorage.js";

export async function handleAI(
  userMessage
) {

  if (
    userMessage
      .toLowerCase() ===
    "use ollama"
  ) {

    await saveAIMode({

      provider:
        "ollama"
    });

    console.log(
      "\n🤖 Switched to Ollama\n"
    );

    return true;
  }

  if (
    userMessage
      .toLowerCase() ===
    "use groq"
  ) {

    await saveAIMode({

      provider:
        "groq"
    });

    console.log(
      "\n☁️ Switched to Groq\n"
    );

    return true;
  }

  if (
    userMessage
      .toLowerCase() ===
    "current model"
  ) {

    const mode =
      await loadAIMode();

    console.log(
      `\nCurrent Provider: ${mode.provider}\n`
    );

    return true;
  }

  return false;
}