import { updateTasks } from "../../features/tasks/taskStorage.js";
import { incrementStat } from "../../storage/statsStorage.js";
import { addActivity } from "../../storage/activityStorage.js";

export class CreateTaskTool {
  async execute(action) {
    const taskText = typeof action.input === "string"
      ? action.input
      : action.input?.text || action.input?.content || "";

    await updateTasks(tasks => [...tasks, {
      id: Date.now(),
      text: taskText,
      completed: false
    }]);
    await incrementStat("tasks_created");
    addActivity(`Created task: ${taskText}`);

    return `✅ Task created: ${taskText}`;
  }
}
