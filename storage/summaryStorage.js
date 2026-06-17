import fs from "fs/promises";

const FILE =
  "./memory/summary.json";

export async function loadSummary() {

  try {

    const data =
      await fs.readFile(
        FILE,
        "utf8"
      );

    return JSON.parse(
      data
    );

  } catch {

    return {
      summary: ""
    };
  }
}

export async function saveSummary(
  summary
) {

  await fs.writeFile(
    FILE,

    JSON.stringify(
      summary,
      null,
      2
    )
  );
}