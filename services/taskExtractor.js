import { askAI } from "./ai.js";

export async function extractTasks(
  report
) {

  const prompt = `
Extract study tasks from this research.

Research:

${report}

Return ONLY JSON.

Example:

[
  "Learn Kubernetes Pods",
  "Learn Deployments",
  "Learn Services"
]
`;

  const response =
    await askAI(prompt);

  const cleaned =
    response
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

  return JSON.parse(
    cleaned
  );
}