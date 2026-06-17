export function decideModel(
  message = "",
  tool = "chat"
) {

  const text =
    String(message)
      .toLowerCase();

  // PDF RAG

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

  // Code Generation

  if (

    text.includes("code") ||

    text.includes("program") ||

    text.includes("java") ||

    text.includes("python") ||

    text.includes("javascript") ||

    text.includes("react") ||

    text.includes("node") ||

    text.includes("sql")
  ) {

    return "deepseek";
  }

  // Math

  if (

    text.includes("gcd") ||

    text.includes("lcm") ||

    text.includes("equation") ||

    text.includes("factorial") ||

    text.includes("prime")
  ) {

    return "groq";
  }

  // Research

  if (

    text.includes("compare") ||

    text.includes("research") ||

    text.includes("analyze") ||

    text.includes("advantages") ||

    text.includes("disadvantages") ||

    text.includes("difference between")
  ) {

    return "openrouter";
  }

  return "groq";
}