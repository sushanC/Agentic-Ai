import {
  loadHistory,
  saveHistory
}
from "../storage/chatHistoryStorage.js";

import {
  loadSummary,
  saveSummary
}
from "../storage/summaryStorage.js";

import {
  askGroq
} from "./ai.js";

export async function updateSummary() {

  const history =
    await loadHistory();

  if (
    history.length < 50
  ) {

    return;
  }

const oldMessages =
  history.slice(
    -100
  );

  const prompt = `
Create a concise summary.

Include:
- user goals
- preferences
- projects
- ongoing work
- important context

Conversation:

${oldMessages
  .map(
    m =>
      `${m.role}: ${m.content}`
  )
  .join("\n")}
`;

let summary;

try {

  summary =
    await askGroq(
      prompt
    );

} catch (err) {

  console.log(
    "⚠️ Summary generation failed"
  );

  console.log(
    err.message
  );

  return;
}

  await saveSummary({

    summary
  });
  

  await saveHistory(
    history.slice(-20)
  );

  console.log(
    "\n📝 SUMMARY UPDATED"
  );
}