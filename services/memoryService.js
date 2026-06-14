import {
  loadMemory,
  saveMemory
} from "../storage/memoryStorage.js";

import {
  extractMemory
} from "./ai.js";

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

  Object.assign(
    memory,
    facts
  );

  await saveMemory(
    memory
  );

  console.log(
    "\n🧠 Memory Updated:"
  );

  console.log(
    memory
  );
}