import { askAI }
from "./ai.js";

import {
  loadTasks,
  saveTasks
} from "../storage/tasksStorage.js";

import {
  loadNotes,
  saveNotes
} from "../storage/notesStorage.js";

import {
  askPDF
} from "./pdfQAService.js";

import {
  loadPDFMemory
} from "../storage/pdfStorage.js";

import {
  decideTool
} from "./agentRouter.js";

import {
  loadMemory,
  deleteMemoryKey
} from "../storage/memoryStorage.js";

async function findBestPDF(
  question
) {

  const memory =
    await loadPDFMemory();

  const pdfNames =
    Object.keys(memory);

  // Temporary:
  // always use OSE

  if (
    pdfNames.includes(
      "documents/OSE.pdf"
    )
  ) {

    return "documents/OSE.pdf";
  }

  return pdfNames[0];
}



export async function routeRequest(
  message
) {

    const text =
    message.toLowerCase();

  if (
  text === "show memory"
) {

  const memory =
    await loadMemory();

  return {

    tool: "memory",

    answer:
      JSON.stringify(
        memory,
        null,
        2
      )
  };
}


  // TASK TOOL

  if (
    text.startsWith(
      "add task"
    )
  ) {

    const taskText =
      message
        .replace(
          /add task/i,
          ""
        )
        .trim();

    const tasks =
      await loadTasks();

    tasks.push({

      id: Date.now(),

      text: taskText,

      completed: false
    });

    await saveTasks(
      tasks
    );

    return {

      tool: "task",

      answer:
        `✅ Task added: ${taskText}`
    };
  }

  // NOTE TOOL

  if (
    text.startsWith(
      "remember"
    )
  ) {

    const noteText =
      message
        .replace(
          /remember/i,
          ""
        )
        .trim();

    const notes =
      await loadNotes();

    notes.push({

      id: Date.now(),

      content:
        noteText
    });

    await saveNotes(
      notes
    );

    return {

      tool: "note",

      answer:
        `📝 Note saved: ${noteText}`
    };
  }

  if (
  text.includes(
    "deadlock"
  ) ||

  text.includes(
    "algorithm"
  ) ||

  text.includes(
    "process"
  ) ||

  text.includes(
    "thread"
  )
) {

const pdfName =
  await findBestPDF(
    message
  );

console.log(
  "\n📄 Selected PDF:",
  pdfName
);

console.log(
  "\n🤖 PDF Tool Triggered"
);

  const answer =
    await askPDF(
      pdfName,
      message
    );

  return {

    tool: "pdf",

    answer
  };
}

if (
  text.startsWith(
    "forget "
  )
) {

  const key =
    message
      .replace(
        /forget/i,
        ""
      )
      .trim();

  await deleteMemoryKey(
    key
  );

  return {

    tool: "memory",

    answer:
      `🧠 Forgot: ${key}`
  };
}

  // NORMAL CHAT

  const answer =
    await askAI(
      message
    );

  return {

    tool: "chat",

    answer
  };
}