import { loadNotes, saveNotes } from "../../storage/notesStorage.js";
import { incrementStat } from "../../storage/statsStorage.js";
import { addActivity } from "../../storage/activityStorage.js";

export class SaveNoteTool {
  async execute(action) {
    const noteText = typeof action.input === "string"
      ? action.input
      : action.input?.content || action.input?.text || "";

    const notes = await loadNotes();
    notes.push({
      id: Date.now(),
      content: noteText
    });

    await saveNotes(notes);
    await incrementStat("notes_saved");
    addActivity("Saved note");

    return `📝 Note saved: ${noteText}`;
  }
}
