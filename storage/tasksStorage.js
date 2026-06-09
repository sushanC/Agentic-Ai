import fs from "fs/promises";

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