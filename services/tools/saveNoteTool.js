import { updateNotes } from "../../features/notes/index.js";
import { incrementStat } from "../../storage/statsStorage.js";
import { addActivity } from "../../storage/activityStorage.js";

export class SaveNoteTool {
  async execute(action) {
    const noteText = typeof action.input === "string"
      ? action.input
      : action.input?.content || action.input?.text || "";

    await updateNotes(notes => [...notes, {
      id: Date.now(),
      content: noteText
    }]);
    await incrementStat("notes_saved");
    addActivity("Saved note");

    return `📝 Note saved: ${noteText}`;
  }
}
