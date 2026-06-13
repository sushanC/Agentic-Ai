import fs from "fs/promises";

export async function loadMemory() {

  try {

    const data =
      await fs.readFile(
        "./memory/profile.json",
        "utf-8"
      );

    return JSON.parse(data);

  } catch {

    return {};
  }
}

export async function saveMemory(
  memory
) {

  await fs.writeFile(
    "./memory/profile.json",
    JSON.stringify(
      memory,
      null,
      2
    )
  );
}

export async function deleteMemoryKey(
  key
) {

  const memory =
    await loadMemory();

  delete memory[key];

  await saveMemory(
    memory
  );
}