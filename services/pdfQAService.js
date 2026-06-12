import {
  loadPDFMemory
} from "../storage/pdfStorage.js";

import {
  askAI
} from "./ai.js";

export async function askPDF(
  pdfName,
  question
) {

  const memory =
    await loadPDFMemory();

  const chunks =
    memory[pdfName];

  if (!chunks) {

    return "PDF not found.";
  }

  const context =
    chunks
      .slice(0, 3)
      .map(
        c => c.text
      )
      .join("\n\n");

  const prompt = `
Answer only using this PDF content.

${context}

Question:
${question}
`;

  return await askAI(
    prompt
  );
}