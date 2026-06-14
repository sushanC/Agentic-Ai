import "dotenv/config";
import readline from "readline";

import {
  askAI,
  extractMemory
} from "./services/ai.js";

import {
  loadProfile,
  saveProfile
} from "./storage/profileStorage.js";

import {
  loadHistory,
  saveHistory
} from "./storage/historyStorage.js";

import {
  handleWeb
} from "./handlers/webHandler.js";

import {
  handlePDF
} from "./handlers/pdfHandler.js";

import {
  handleTasks
} from "./handlers/tasksHandler.js";

import {
  handleMemory
} from "./handlers/memoryHandler.js";

import {
  handleNotes
} from "./handlers/notesHandler.js";

import {
  handleDSA
} from "./handlers/dsaHandler.js";

import {
  handleAI
} from "./handlers/aiHandler.js";

import {
  handleVoice
} from "./handlers/voiceHandler.js";

import {
  updateSummary
} from "./summaryService.js";

// =====================
// Readline Helper
// =====================

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {

  return new Promise(
    resolve =>
      rl.question(
        question,
        resolve
      )
  );
}

// =====================
// Main Agent
// =====================

async function main() {

  const profile =
    await loadProfile();

  const history =
    await loadHistory();

  console.log(
    "🤖 Personal Agent Started"
  );

  console.log(
    "Type 'bye' to quit.\n"
  );

  while (true) {

    const userMessage =
      await ask("You: ");

      if (
  await handleVoice(
    userMessage
  )
) continue;

      if (
  await handleDSA(
    userMessage
  )
) continue;

    if (
      userMessage
        .toLowerCase() ===
      "bye"
    ) {

      console.log(
        "👋 Goodbye!"
      );

      break;
    }

    // =====================
    // Command Handlers
    // =====================
    if (
  await handleAI(
    userMessage
  )
) continue;

    if (
      await handleWeb(
        userMessage
      )
    ) continue;

    if (
      await handlePDF(
        userMessage
      )
    ) continue;

    if (
      await handleTasks(
        userMessage,
        profile
      )
    ) continue;

    if (
      await handleMemory(
        userMessage,
        profile
      )
    ) continue;

    if (
      await handleNotes(
        userMessage
      )
    ) continue;

    // =====================
    // Auto Memory Extraction
    // =====================

    try {

      const memory =
        await extractMemory(
          userMessage
        );

      if (
        Object.keys(memory)
          .length > 0
      ) {

        Object.assign(
          profile,
          memory
        );

        await saveProfile(
          profile
        );
      }

    } catch (err) {

      console.log(
        "⚠️ Memory extraction failed."
      );
    }

    const recentHistory =
  history
    .slice(-6)
    .map(
      msg =>
        `${msg.role}: ${msg.content}`
    )
    .join("\n");

    // =====================
    // Normal Chat
    // =====================

    

    const prompt = `
You are a personal AI assistant.

User Profile:
${JSON.stringify(profile, null, 2)}

Recent Conversation:
${recentHistory}

Current User Message:
${userMessage}

Answer naturally and use memory when relevant.
`;

    try {
      console.log(
  "\n===== HISTORY SENT =====\n"
);

console.log(
  recentHistory
);

console.log(
  "\n========================\n"
);

      const responseText =
        await askAI(
          prompt
        );

      console.log(
        "\nAI:",
        responseText,
        "\n"
      );

      history.push({
        role: "user",
        content:
          userMessage
      });

      history.push({
        role: "assistant",
        content:
          responseText
      });

      if (
  history.length > 50
) {

  console.log(
    "\n📝 Creating summary..."
  );

  await updateSummary(
    history
  );

  history.splice(
    0,
    history.length - 10
  );

  await saveHistory(
    history
  );
}

    } catch (err) {

      console.error(
        "Error:",
        err.message
      );
    }
  }

  rl.close();
}

main();