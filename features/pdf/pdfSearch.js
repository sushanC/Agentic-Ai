import { loadPDFMemory } from "./pdfStorage.js";
import { getEmbedding, cosineSimilarity } from "../../services/embeddingService.js";

export async function searchPDFChunks(q, pdf) {
  const memory = await loadPDFMemory();
  const chunks = memory[pdf];

  if (!chunks) {
    return null;
  }

  const queryEmbedding = await getEmbedding(q);

  const scored = chunks.map((chunk, idx) => ({
    text: chunk.text,
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
    page: Math.max(1, Math.round(idx * 0.5) + 1),
    chunkIndex: idx
  }));

  scored.sort((a, b) => b.score - a.score);

  const results = scored
    .filter(item => item.score > 0.25)
    .slice(0, 8)
    .map(item => ({
      page: item.page,
      text: item.text.slice(0, 300),
      score: parseFloat(item.score.toFixed(3))
    }));

  return results;
}

export async function searchPDFMemory(keyword) {
  const pdfMemory = await loadPDFMemory();
  const queryEmbedding = await getEmbedding(keyword);
  const scored = [];

  for (const [file, chunks] of Object.entries(pdfMemory)) {
    chunks.forEach(chunk => {
      scored.push({
        file,
        text: chunk.text,
        score: cosineSimilarity(queryEmbedding, chunk.embedding)
      });
    });
  }

  scored.sort((a, b) => b.score - a.score);

  const matches = scored
    .filter(item => item.score > 0.30)
    .slice(0, 5);

  if (matches.length === 0) {
    console.log("\nAI: No matches found.\n");
    return true;
  }

  console.log("\n📚 Search Results:\n");
  matches.forEach(item => {
    console.log(`Score: ${item.score.toFixed(3)}`);
    console.log(`PDF: ${item.file}`);
    console.log(item.text.slice(0, 400));
    console.log("\n-------------------\n");
  });

  return true;
}
