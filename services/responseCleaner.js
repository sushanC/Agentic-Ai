export function cleanResponse(
  text
) {

  if (!text)
    return "";

  return text

    .replace(/```/g, "")

    .replace(/\*\*/g, "")

    .replace(/#{1,6}\s/g, "")

    .replace(/\n{3,}/g, "\n\n")

    .replace(/\s{2,}/g, " ")

    .trim();
}