import {
  loadNotes
} from "./noteStorage.js";

import {
  getEmbedding,
  cosineSimilarity
} from "../../services/embeddingService.js";

export async function searchNotes(
  keyword
) {

  const notes =
    await loadNotes();

  const queryEmbedding =
    await getEmbedding(
      keyword
    );

  const scored =
    notes
      .filter(
        note =>
          note.embedding
      )
      .map(note => ({
        note,
        score:
          cosineSimilarity(
            queryEmbedding,
            note.embedding
          )
      }));

  scored.sort(
    (a, b) =>
      b.score - a.score
  );
  console.log(
    "\nSimilarity Scores:\n"
  );

  scored.forEach(item => {

    console.log(
      item.score.toFixed(3),
      "-",
      item.note.content
    );
  });

  const matches =
    scored
      .filter(
        item =>
          item.score > 0.35
      )
      .slice(0, 3);

  if (
    matches.length === 0
  ) {

    console.log(
      "\nAI: No matching notes found.\n"
    );

    return true;
  }

  console.log(
    "\n📚 Matching Notes:\n"
  );

  matches.forEach(item => {

    const note =
      item.note;

    console.log(
      `Score: ${item.score.toFixed(3)}`
    );

    console.log(
      `ID: ${note.id}`
    );

    console.log(
      note.content
    );

    console.log(
      "\n-------------------\n"
    );
  });

  if (matches.length === 0) {

    console.log(
      "\nNo strong match found."
    );

    console.log(
      "\nClosest note:\n"
    );

    const best =
      scored[0];

    console.log(
      `Score: ${best.score.toFixed(3)}`
    );

    console.log(
      best.note.content
    );

    return true;
  }

  return true;
}
