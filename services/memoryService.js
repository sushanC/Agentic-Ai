import {
  loadMemory,
  saveMemory
} from "../storage/memoryStorage.js";

import {
  extractMemory
} from "./ai.js";

import {
  normalizeMemory
} from "./memoryNormalizer.js";

export async function updateMemory(
  userMessage
) {

  let facts = {};

  try {

    facts =
      await extractMemory(
        userMessage
      );

  } catch (err) {

    console.log(
      "\n⚠️ Memory extraction skipped."
    );

    console.log(
      err.message
    );

    return;
  }

  if (
    Object.keys(facts)
      .length === 0
  ) {

    return;
  }

  const memory =
    await loadMemory();

  const merged = {

    ...memory,

    ...facts
  };

  const cleaned =
    normalizeMemory(
      merged
    );

  await saveMemory(
    cleaned
  );

  console.log(
    "\n🧠 Memory Updated:"
  );

  console.log(
    cleaned
  );
}