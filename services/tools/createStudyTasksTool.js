import { getResearch } from "../researchCache.js";
import { extractTasks } from "../taskExtractor.js";
import { loadTasks, saveTasks } from "../../features/tasks/index.js";
import { incrementStat } from "../../storage/statsStorage.js";
import { addActivity } from "../../storage/activityStorage.js";

export class CreateStudyTasksTool {
  async execute(action) {
    const report = getResearch();

    const studyTasks = await extractTasks(report);
    const tasks = await loadTasks();

    for (const task of studyTasks) {
      tasks.push({
        id: Date.now() + Math.random(),
        text: task,
        completed: false
      });
    }

    await saveTasks(tasks);
    await incrementStat("tasks_created");
    addActivity(`Created ${studyTasks.length} study tasks`);

    return `✅ ${studyTasks.length} study tasks created`;
  }
}
