import fs from "fs/promises";

const FILE =
  "./dsa_progress.json";

export async function loadDSAProgress() {

  try {

    const data =
      await fs.readFile(
        FILE,
        "utf-8"
      );

    return JSON.parse(data);

  } catch {

    return {};
  }
}

export async function saveDSAProgress(
  progress
) {

  await fs.writeFile(
    FILE,
    JSON.stringify(
      progress,
      null,
      2
    )
  );
}