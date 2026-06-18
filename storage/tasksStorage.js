import fs from "fs/promises";

import {
  getStoragePath
}
from "./storagePath.js";

const TASKS_FILE =
  getStoragePath(
    "tasks.json"
  );

console.log(
  "📁 TASKS FILE:",
  TASKS_FILE
);

export async function loadTasks() {

  try {

    const data =
      await fs.readFile(
        "./tasks.json",
        "utf-8"
      );

    return JSON.parse(data);

  } catch {

    return [];
  }
}

export async function saveTasks(
  tasks
) {

  await fs.writeFile(
    "./tasks.json",
    JSON.stringify(
      tasks,
      null,
      2
    )
  );
}