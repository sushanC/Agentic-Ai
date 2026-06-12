import {
  loadPDFMemory
} from "../storage/pdfStorage.js";

import {
  getEmbedding,
  cosineSimilarity
} from "./embeddingService.js";

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

  const questionEmbedding =
    await getEmbedding(
      question
    );

  const scoredChunks =
    chunks.map(chunk => ({

      text:
        chunk.text,

      score:
        cosineSimilarity(
          questionEmbedding,
          chunk.embedding
        )

    }));

    scoredChunks.sort(
  (a, b) =>
    b.score - a.score
);

console.log(
  "\nTop Matches:\n"
);

scoredChunks
  .slice(0, 5)
  .forEach(chunk => {

    console.log(
      chunk.score.toFixed(3)
    );

  });

  const topChunks =
  scoredChunks
    .slice(0, 8)
    .map(
      chunk =>
        chunk.text
    )
    .join("\n\n");

    const prompt = `
You are answering questions from an Operating Systems PDF.

Context:

${topChunks}

Question:
${question}

Instructions:
- Use only the context above.
- If the answer exists in the context, answer clearly.
- If the answer does not exist, say "Answer not found in PDF".

Answer:
`;
console.log(
  "\n===== TOP CHUNKS =====\n"
);

console.log(
  topChunks
);

console.log(
  "\n======================\n"
);

return await askAI(
  prompt
);

}