import { BaseCapability } from "../BaseCapability.js";
import { CapabilityResult } from "../CapabilityResult.js";
import { loadNotes, saveNotes } from "../../../features/notes/index.js";
import { incrementStat } from "../../../storage/statsStorage.js";

/**
 * NotesCapability.js
 *
 * Handles note creation and storage.
 */
export class NotesCapability extends BaseCapability {
  constructor() {
    super("note", "Notes Capability", 75);
  }

  canHandle(context) {
    if (context.includesAny("save note", "create note", "take note", "save as note")) {
      return 0.85;
    }
    return 0.0;
  }

  async execute(context) {
    const notes = await loadNotes();
    notes.push({ id: Date.now(), content: context.prompt });
    await saveNotes(notes);
    await incrementStat("notes_saved");

    return CapabilityResult.create({
      capability: this.name,
      tool: "note",
      answer: `📝 Note saved.`,
      executedSteps: [{ name: "notes", status: "completed" }],
    });
  }
}
