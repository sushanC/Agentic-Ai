import { webSearch }
from "./webSearchService.js";

import { askAI }
from "./ai.js";

import {
  setResearch
}
from "./researchCache.js";

export async function researchTopic(
  topic
) {

  console.log(
    "\n🔬 RESEARCHING:"
  );

  console.log(topic);

  const results =
    await webSearch(
      topic
    );

  const context =
    results
      .slice(0, 5)
      .map(
        r => `
Title:
${r.title}

Snippet:
${r.snippet}
`
      )
      .join("\n\n");

  const prompt = `
Research this topic.

Topic:
${topic}

Sources:

${context}

Return:

1. Summary
2. Key Concepts
3. Learning Tasks
4. Notes

Keep concise.
`;

  const report =
    await askAI(
      prompt
    );
    setResearch(
  report
);

  return report;
}