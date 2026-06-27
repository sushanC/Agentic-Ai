import { loadTasks, saveTasks } from "../../storage/tasksStorage.js";
import { incrementStat } from "../../storage/statsStorage.js";
import { addActivity } from "../../storage/activityStorage.js";

export class CreateTaskTool {
  async execute(action) {
    const taskText = typeof action.input === "string"
      ? action.input
      : action.input?.text || action.input?.content || "";

    const tasks = await loadTasks();
    tasks.push({
      id: Date.now(),
      text: taskText,
      completed: false
    });

    await saveTasks(tasks);
    await incrementStat("tasks_created");
    addActivity(`Created task: ${taskText}`);

    return `✅ Task created: ${taskText}`;
  }
}
