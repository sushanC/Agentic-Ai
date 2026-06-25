import fs from "fs/promises";

import {
  getStoragePath
} from "./storagePath.js";

const TASKS_FILE =
  getStoragePath(
    "tasks.json"
  );

export async function loadTasks() {

  try {

    const data =
      await fs.readFile(
        TASKS_FILE,
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
    TASKS_FILE,
    JSON.stringify(
      tasks,
      null,
      2
    )
  );
}