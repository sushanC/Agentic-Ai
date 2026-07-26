import fs from "fs/promises";

import {
  loadTasks,
  saveTasks
} from "./taskStorage.js";

import {
  loadNotes
} from "../notes/index.js";

import {
  askAI
} from "../../services/ai.js";

import {
  incrementStat
} from "../../storage/statsStorage.js";

export async function getTasks() {
  return await loadTasks();
}

export async function createTask(text) {
  const tasks = await loadTasks();

  tasks.push({
    id: Date.now(),
    text,
    completed: false
  });

  await saveTasks(tasks);
  await incrementStat("tasks_created");

  return { success: true };
}

export async function updateTask(id) {
  const tasks = await loadTasks();

  const task = tasks.find(
    t => t.id === Number(id)
  );

  if (task) {
    task.completed = !task.completed;
    await saveTasks(tasks);
  }

  return { success: true };
}

export async function deleteTask(id) {
  const tasks = await loadTasks();

  const updated = tasks.filter(
    task => task.id !== Number(id)
  );

  await saveTasks(updated);

  return { success: true };
}

async function readSortedTasks() {
  try {
    return await fs.readFile(
      "./sorted_tasks.txt",
      "utf-8"
    );
  } catch {
    return null;
  }
}

export async function handleTasks(
  userMessage,
  profile
) {
  // pending tasks
  if (
    userMessage.toLowerCase() === "pending tasks"
  ) {
    const tasks = await loadTasks();
    const pending = tasks.filter(
      t => t.status === "pending"
    );

    console.log("\n📋 Pending Tasks:\n");
    pending.forEach((t, index) => {
      console.log(`${index + 1}. ${t.task}`);
    });
    console.log();

    return true;
  }

  // completed tasks
  if (
    userMessage.toLowerCase() === "completed tasks"
  ) {
    const tasks = await loadTasks();
    const completed = tasks.filter(
      t => t.status === "completed"
    );

    console.log("\n✅ Completed Tasks:\n");

    if (completed.length === 0) {
      console.log("\nAI: No completed tasks.\n");
      return true;
    }

    completed.forEach((t, index) => {
      console.log(`${index + 1}. ${t.task}`);
    });
    console.log();

    return true;
  }

  // task stats
  if (
    userMessage.toLowerCase() === "task stats"
  ) {
    const tasks = await loadTasks();
    const completed = tasks.filter(
      t => t.status === "completed"
    ).length;

    const pending = tasks.filter(
      t => t.status === "pending"
    ).length;

    console.log("\n📊 Task Stats\n");
    console.log(`Total: ${tasks.length}`);
    console.log(`Completed: ${completed}`);
    console.log(`Pending: ${pending}`);

    const progress =
      tasks.length === 0
        ? 0
        : (completed / tasks.length * 100).toFixed(1);

    console.log(`Progress: ${progress}%`);
    console.log();

    return true;
  }

  // complete task
  if (
    userMessage.toLowerCase().startsWith("complete task ")
  ) {
    const taskName = userMessage
      .replace(/^complete task /i, "")
      .trim();

    const tasks = await loadTasks();
    const task = tasks.find(
      t => t.task.toLowerCase() === taskName.toLowerCase()
    );

    if (!task) {
      console.log("\nAI: Task not found.\n");
      return true;
    }

    task.status = "completed";
    await saveTasks(tasks);

    console.log(`\nAI: Marked "${taskName}" as completed.\n`);
    return true;
  }

  // show tasks
  if (
    userMessage.toLowerCase() === "show tasks"
  ) {
    const tasks = await loadTasks();

    console.log("\n📋 Tasks:\n");

    if (tasks.length === 0) {
      console.log("\nAI: No tasks found.\n");
      return true;
    }

    tasks.forEach((t, index) => {
      console.log(`${index + 1}. ${t.task} (${t.status})`);
    });
    console.log();

    return true;
  }

  // add task
  if (
    userMessage.toLowerCase().startsWith("add task ")
  ) {
    const taskName = userMessage
      .replace(/^add task /i, "")
      .trim();

    const tasks = await loadTasks();

    const exists = tasks.some(
      t => t.task.toLowerCase() === taskName.toLowerCase()
    );

    if (exists) {
      console.log("\nAI: Task already exists.\n");
      return true;
    }

    tasks.push({
      task: taskName,
      status: "pending"
    });

    await saveTasks(tasks);

    console.log(`\nAI: Added task "${taskName}"\n`);
    return true;
  }

  // remove task
  if (
    userMessage.toLowerCase().startsWith("remove task ")
  ) {
    const taskName = userMessage
      .replace(/^remove task /i, "")
      .trim();

    const tasks = await loadTasks();

    const updatedTasks = tasks.filter(
      t => t.task.toLowerCase() !== taskName.toLowerCase()
    );

    if (updatedTasks.length === tasks.length) {
      console.log("\nAI: Task not found.\n");
      return true;
    }

    await saveTasks(updatedTasks);

    console.log(`\nAI: Removed "${taskName}"\n`);
    return true;
  }

  if (
    userMessage.toLowerCase() === "show sorted tasks"
  ) {
    const sortedTasks = await readSortedTasks();

    if (!sortedTasks) {
      console.log(
        "\nAI: No sorted tasks found. Run 'sort tasks' first.\n"
      );
      return true;
    }

    console.log("\n📋 Sorted Tasks:\n");
    console.log(sortedTasks);
    console.log();

    return true;
  }

  if (
    userMessage.toLowerCase() === "sort tasks"
  ) {
    const tasks = await loadTasks();
    const pendingTasks = tasks.filter(
      t => t.status === "pending"
    );

    if (pendingTasks.length === 0) {
      console.log("\nAI: No pending tasks found.\n");
      return true;
    }

    const prompt = `
You are a productivity assistant.

Given these pending tasks:

${pendingTasks.map(t => t.task).join("\n")}

Categorize them into:

1. High Priority
2. Medium Priority
3. Low Priority

Explain each task in 5 words or less.
`;

    const sortedTasks = await askAI(prompt);

    await fs.writeFile("./sorted_tasks.txt", sortedTasks);

    console.log("\n📋 Sorted Tasks:\n");
    console.log(sortedTasks);
    console.log("\n✅ Saved to sorted_tasks.txt\n");

    return true;
  }

  if (
    userMessage.toLowerCase() === "recommend next task"
  ) {
    const tasks = await loadTasks();

    const pendingTasks = tasks.filter(
      t => t.status === "pending"
    );

    if (pendingTasks.length === 0) {
      console.log("\nAI: No pending tasks found.\n");
      return true;
    }

    const prompt = `
You are a productivity coach.

User Profile:
${JSON.stringify(profile, null, 2)}

Pending Tasks:
${pendingTasks.map(t => t.task).join("\n")}

Recommend:

1. Best task to do next
2. Why
3. Next 3 tasks
`;

    const recommendation = await askAI(prompt);

    console.log("\n🎯 Recommendation:\n");
    console.log(recommendation);
    console.log();

    return true;
  }

  if (
    userMessage.toLowerCase() === "plan my day"
  ) {
    const tasks = await loadTasks();

    const pendingTasks = tasks.filter(
      t => t.status === "pending"
    );

    if (pendingTasks.length === 0) {
      console.log("\nAI: No pending tasks found.\n");
      return true;
    }

    const prompt = `
You are a productivity planner.

User Profile:
${JSON.stringify(profile, null, 2)}

Pending Tasks:
${pendingTasks.map(t => t.task).join("\n")}

Create a realistic day plan.
Start at 9 AM.
Include breaks.
`;

    const dayPlan = await askAI(prompt);

    await fs.writeFile("./day_plan.txt", dayPlan);

    console.log("\n📅 Today's Plan:\n");
    console.log(dayPlan);
    console.log();

    return true;
  }

  if (
    userMessage.toLowerCase() === "show plan"
  ) {
    try {
      const plan = await fs.readFile("./day_plan.txt", "utf-8");

      console.log("\n📅 Today's Plan:\n");
      console.log(plan);
      console.log();
    } catch {
      console.log("\nAI: No plan found.\n");
    }

    return true;
  }

  if (
    userMessage.toLowerCase() === "daily review"
  ) {
    const tasks = await loadTasks();
    const notes = await loadNotes();

    const completed = tasks.filter(
      t => t.status === "completed"
    );

    const pending = tasks.filter(
      t => t.status === "pending"
    );

    const prompt = `
You are my productivity coach.

Profile:
${JSON.stringify(profile, null, 2)}

Completed Tasks:
${completed.map(t => t.task).join("\n")}

Pending Tasks:
${pending.map(t => t.task).join("\n")}

Recent Notes:
${notes.slice(-5).map(n => n.content).join("\n")}

Write:

1. Progress Summary
2. Key Achievement
3. Biggest Bottleneck
4. Recommendation for Tomorrow
`;

    const review = await askAI(prompt);

    console.log("\n📊 Daily Review\n");
    console.log(review);
    console.log();

    return true;
  }

  return false;
}
