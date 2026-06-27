import { getResearch } from "../researchCache.js";
import { loadNotes, saveNotes } from "../../storage/notesStorage.js";
import { incrementStat } from "../../storage/statsStorage.js";
import { addActivity } from "../../storage/activityStorage.js";

export class SaveResearchNoteTool {
  async execute(action) {
    const report = getResearch();

    if (!report) {
      return "⚠️ No research result to save. Run research first.";
    }

    const notes = await loadNotes();
    notes.push({
      id: Date.now(),
      content: report
    });

    await saveNotes(notes);
    await incrementStat("notes_saved");
    addActivity("Saved research note");

    return "📝 Research note saved";
  }
}
