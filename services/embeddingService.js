import { pipeline } from "@xenova/transformers";

let extractor = null;

export async function getEmbedding(
  text
) {

  if (!extractor) {

    extractor =
      await pipeline(
        "feature-extraction",
        "Xenova/all-MiniLM-L6-v2"
      );
  }

  const output =
    await extractor(
      text,
      {
        pooling: "mean",
        normalize: true
      }
    );

  return Array.from(
    output.data
  );
}
export function cosineSimilarity(
  a,
  b
) {

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (
    let i = 0;
    i < a.length;
    i++
  ) {

    dot += a[i] * b[i];

    magA += a[i] * a[i];

    magB += b[i] * b[i];
  }

  return (
    dot /
    (
      Math.sqrt(magA) *
      Math.sqrt(magB)
    )
  );
}