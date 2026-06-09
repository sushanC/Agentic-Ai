import fs from "fs/promises";

export async function loadHistory() {

  try {

    const data =
      await fs.readFile(
        "./memory/chat_history.json",
        "utf-8"
      );

    return JSON.parse(data);

  } catch {

    return [];
  }
}

export async function saveHistory(
  history
) {

  await fs.writeFile(
    "./memory/chat_history.json",
    JSON.stringify(
      history,
      null,
      2
    )
  );
}