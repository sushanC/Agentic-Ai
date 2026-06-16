export function decideModel(
  message = "",
  tool = "chat"
) {

  const text =
    String(message)
      .toLowerCase();

  // PDF

  if (
    tool === "pdf"
  ) {

    return "groq";
  }

  // Web Search

  if (
    tool === "web"
  ) {

    return "openrouter";
  }

  // Coding

  if (

    text.includes("code") ||

    text.includes("program") ||

    text.includes("java") ||

    text.includes("python") ||

    text.includes("javascript") ||

    text.includes("react") ||

    text.includes("node")
  ) {

    return "deepseek";
  }

  // Math

  if (

    text.includes("equation") ||

    text.includes("solve") ||

    text.includes("gcd") ||

    text.includes("lcm") ||

    text.includes("factorial")
  ) {

    return "groq";
  }

  // Research

  if (

    text.includes("compare") ||

    text.includes("research") ||

    text.includes("analyze") ||

    text.includes("advantages") ||

    text.includes("disadvantages")
  ) {

    return "openrouter";
  }

  // Default

  return "groq";
}