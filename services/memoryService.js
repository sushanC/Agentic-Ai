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

  const facts =
    await extractMemory(
      userMessage
    );

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