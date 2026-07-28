export function normalizeMemory(
  memory
) {

  const normalized = {};

  for (
    const [key, value]
    of Object.entries(memory)
  ) {

    const cleanKey =
      key
        .toLowerCase()
        .replace(/-/g, "_")
        .trim();

    normalized[
      cleanKey
    ] = value;
  }

  return normalized;
}
