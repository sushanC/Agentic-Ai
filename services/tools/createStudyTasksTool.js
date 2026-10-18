import { getResearch } from "../researchCache.js";
import { extractTasks } from "../taskExtractor.js";
import { updateTasks } from "../../features/tasks/taskStorage.js";
import { incrementStat } from "../../storage/statsStorage.js";
import { addActivity } from "../../storage/activityStorage.js";

export class CreateStudyTasksTool {
  async execute(action) {
    const report = getResearch();

    const studyTasks = await extractTasks(report);
    await updateTasks(tasks => [...tasks, ...studyTasks.map(task => ({
        id: Date.now() + Math.random(),
        text: task,
        completed: false
      }))]);
    await incrementStat("tasks_created");
    addActivity(`Created ${studyTasks.length} study tasks`);

    return `✅ ${studyTasks.length} study tasks created`;
  }
}
