import { BaseCapability } from "../BaseCapability.js";
import { CapabilityResult } from "../CapabilityResult.js";
import { updateTasks } from "../../../features/tasks/taskStorage.js";
import { incrementStat } from "../../../storage/statsStorage.js";

/**
 * TaskCapability.js
 *
 * Handles task creation and task list management.
 */
export class TaskCapability extends BaseCapability {
  constructor() {
    super("task", "Task Management Capability", 80);
  }

  canHandle(context) {
    if (context.startsWithAny("add task") || context.includesAny("create task", "new task", "add a task")) {
      return 0.88;
    }
    return 0.0;
  }

  async execute(context) {
    const taskText = context.prompt.replace(/add task/i, "").replace(/create task/i, "").trim() || context.prompt;
    await updateTasks(tasks => [...tasks, { id: Date.now(), text: taskText, completed: false }]);
    await incrementStat("tasks_created");

    return CapabilityResult.create({
      capability: this.name,
      tool: "task",
      answer: `✅ Task added: ${taskText}`,
      executedSteps: [{ name: "task_manager", status: "completed" }],
    });
  }
}
