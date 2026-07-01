export function buildPrompt({
  userPrompt,
  memory,
  history,
  summary,
  pdfContext
}) {
  const parts = [];

  if (memory && Object.keys(memory).length > 0) {
    parts.push(`User Profile:\n\n${JSON.stringify(memory, null, 2)}`);
  }

  if (summary && summary.trim()) {
    parts.push(`Conversation Summary:\n\n${summary.trim()}`);
  }

  if (pdfContext && pdfContext.trim()) {
    parts.push(`Retrieved Document Context:\n\n${pdfContext.trim()}`);
  }

  if (history && history.length > 0) {
    const historyStr = history
      .map(msg => `${msg.role}: ${msg.content}`)
      .join("\n");
    parts.push(`Recent Conversation:\n\n${historyStr}`);
  }

  parts.push(`Current User Message:\n\n${userPrompt.trim()}`);

  return parts.join("\n\n");
}
