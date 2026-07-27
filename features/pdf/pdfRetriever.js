import { loadPDFMemory } from "./pdfStorage.js";
import { getEmbedding, cosineSimilarity } from "../../services/embeddingService.js";
import { askAI } from "../../services/ai.js";
import { incrementStat } from "../../storage/statsStorage.js";

export async function askPDF(pdfName, question) {
  const memory = await loadPDFMemory();
  const chunks = memory[pdfName];

  if (!chunks) {
    return `PDF not found: "${pdfName}". Please upload it first.`;
  }

  const questionEmbedding = await getEmbedding(question);

  const scoredChunks = chunks.map(chunk => ({
    text: chunk.text,
    score: cosineSimilarity(questionEmbedding, chunk.embedding)
  }));

  scoredChunks.sort((a, b) => b.score - a.score);

  console.log("\nTop Matches:\n");
  scoredChunks.slice(0, 5).forEach(chunk => {
    console.log(chunk.score.toFixed(3));
  });

  const topChunks = scoredChunks
    .slice(0, 8)
    .map(chunk => chunk.text)
    .join("\n\n");

  const docLabel = pdfName
    .split("/")
    .pop()
    .replace(/\.[^/.]+$/, "")
    .replace(/[_-]/g, " ");

  const prompt = `
You are answering questions from a document called "${docLabel}".

Context from document:

${topChunks}

Question:
${question}

Instructions:
- Use only the context above to answer.
- If the answer is clearly present, answer concisely and directly.
- If the answer is not in the context, say "This information was not found in ${docLabel}."
- Do not invent information.

Answer:
`;

  console.log("\n===== TOP CHUNKS =====\n");
  console.log(topChunks);
  console.log("\n======================\n");

  await incrementStat("pdf_queries");

  return await askAI(prompt, "pdf");
}
