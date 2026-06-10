import fs from "fs/promises";

const FILE =
  "./ai_mode.json";

export async function loadAIMode() {

  try {

    const data =
      await fs.readFile(
        FILE,
        "utf-8"
      );

    return JSON.parse(data);

  } catch {

    return {
      provider: "groq"
    };
  }
}

export async function saveAIMode(
  mode
) {

  await fs.writeFile(
    FILE,
    JSON.stringify(
      mode,
      null,
      2
    )
  );
}