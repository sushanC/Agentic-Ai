import fs from "fs/promises";
import { askGroq } from "./ai.js";

export async function loadSummary() {

  try {

    const data =
      await fs.readFile(
        "./memory/summary.json",
        "utf-8"
      );

    return JSON.parse(data);

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
    "./memory/summary.json",
    JSON.stringify(
      { summary },
      null,
      2
    )
  );
}

export async function updateSummary(
  history
) {

  const oldMessages =
    history.slice(0, 40);

  const prompt = `
Summarize the following conversation.

Focus on:
- user goals
- projects
- preferences
- important facts

Keep under 15 bullet points.

${JSON.stringify(
  oldMessages,
  null,
  2
)}
`;

  const summary =
    await askGroq(prompt);

  await saveSummary(
    summary
  );

  return summary;
}