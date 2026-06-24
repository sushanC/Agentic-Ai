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

 const merged =
  mergeMemory(
    memory,
    facts
  );

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

  function mergeMemory(
  oldMemory,
  newFacts
) {

  const merged =
    { ...oldMemory };

  for (
    const key of
    Object.keys(
      newFacts
    )
  ) {

    const oldValue =
      merged[key];

    const newValue =
      newFacts[key];

    if (

      Array.isArray(
        oldValue
      ) &&

      Array.isArray(
        newValue
      )
    ) {

      merged[key] =
        [
          ...new Set(
            [
              ...oldValue,
              ...newValue
            ]
          )
        ];

      continue;
    }

    if (

      Array.isArray(
        oldValue
      ) &&

      typeof newValue
      === "string"
    ) {

      merged[key] =
        [
          ...new Set(
            [
              ...oldValue,
              newValue
            ]
          )
        ];

      continue;
    }

    merged[key] =
      newValue;
  }

  return merged;
}
}