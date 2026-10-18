import { getResearch } from "../researchCache.js";
import { updateNotes } from "../../features/notes/index.js";
import { incrementStat } from "../../storage/statsStorage.js";
import { addActivity } from "../../storage/activityStorage.js";

export class SaveResearchNoteTool {
  async execute(action) {
    const report = getResearch();

    if (!report) {
      return "⚠️ No research result to save. Run research first.";
    }

    await updateNotes(notes => [...notes, {
      id: Date.now(),
      content: report
    }]);
    await incrementStat("notes_saved");
    addActivity("Saved research note");

    return "📝 Research note saved";
  }
}
