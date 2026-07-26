import {
  loadNotes,
  saveNotes
} from "./noteStorage.js";

import {
  askAI
} from "../../services/ai.js";

import {
  getEmbedding
} from "../../services/embeddingService.js";

import {
  incrementStat
} from "../../storage/statsStorage.js";

import {
  searchNotes
} from "./noteSearch.js";

export async function getNotes() {
  return await loadNotes();
}

export async function createNote(content) {
  const notes = await loadNotes();

  notes.push({
    id: Date.now(),
    content
  });

  await saveNotes(notes);
  await incrementStat("notes_saved");

  return { success: true };
}

export async function updateNote(id, content) {
  const notes = await loadNotes();

  const note = notes.find(
    n => n.id === Number(id)
  );

  if (note) {
    note.content = content;
  }

  await saveNotes(notes);

  return { success: true };
}

export async function deleteNote(id) {
  const notes = await loadNotes();

  const updated = notes.filter(
    note => note.id !== Number(id)
  );

  await saveNotes(updated);

  return { success: true };
}

export async function askNotes(question) {
  const notes = await loadNotes();

  if (notes.length === 0) {
    console.log(
      "\nAI: No notes found.\n"
    );
    return true;
  }

  const questionWords =
    question
      .toLowerCase()
      .split(" ");

  const matchingNotes =
    notes.filter(
      note =>
        questionWords.some(
          word =>
            note.content
              .toLowerCase()
              .includes(word)
        )
    );

  const relevantNotes =
    matchingNotes.length > 0
      ? matchingNotes
          .map(note => note.content)
          .join("\n")
      : "";

  const prompt = `
You are answering using ONLY
the user's notes.

User Notes:
${relevantNotes}

Question:
${question}

Answer using the notes.
If the answer is not in the notes,
say "I couldn't find that in your notes."
`;

  const answer = await askAI(prompt);

  console.log(
    "\n📚 Notes Answer:\n"
  );
  console.log(answer);
  console.log();

  return true;
}

export async function handleNotes(userMessage) {
  // delete note
  if (
    userMessage
      .toLowerCase()
      .startsWith("delete note ")
  ) {
    const noteId = Number(
      userMessage
        .replace(/^delete note /i, "")
        .trim()
    );

    const notes = await loadNotes();

    const updatedNotes = notes.filter(
      note => note.id !== noteId
    );

    if (updatedNotes.length === notes.length) {
      console.log(
        "\nAI: Note not found.\n"
      );
      return true;
    }

    await saveNotes(updatedNotes);
    console.log(
      `\n🗑️ Deleted note ${noteId}\n`
    );
    return true;
  }

  // search notes
  if (
    userMessage
      .toLowerCase()
      .startsWith("search notes ")
  ) {
    const keyword = userMessage
      .replace(/^search notes /i, "")
      .trim();

    return await searchNotes(keyword);
  }

  // ask notes
  if (
    userMessage
      .toLowerCase()
      .startsWith("ask notes ")
  ) {
    const question = userMessage
      .replace(/^ask notes /i, "")
      .trim();

    return await askNotes(question);
  }

  // save note
  if (
    userMessage
      .toLowerCase()
      .startsWith("save note ")
  ) {
    const noteContent = userMessage.replace(
      /^save note /i,
      ""
    );

    const notes = await loadNotes();
    const embedding = await getEmbedding(noteContent);

    notes.push({
      id: Date.now(),
      content: noteContent,
      embedding
    });

    await saveNotes(notes);
    console.log(
      "\n📝 Note saved.\n"
    );
    return true;
  }

  // show notes
  if (
    userMessage.toLowerCase() === "show notes"
  ) {
    const notes = await loadNotes();

    if (notes.length === 0) {
      console.log(
        "\nAI: No notes found.\n"
      );
      return true;
    }

    console.log(
      "\n📝 Notes:\n"
    );
    notes.forEach(note => {
      console.log(
        `${note.id} - ${note.content}`
      );
    });
    console.log();

    return true;
  }

  return false;
}
