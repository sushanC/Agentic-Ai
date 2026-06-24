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
    return "gemini";
  }

  // Research

  if (
    tool === "web"
  ) {
    return "gemini";
  }

  // Planning

  if (

    text.includes("plan") ||

    text.includes("roadmap") ||

    text.includes("strategy") ||

    text.includes("research and save") ||

    text.includes("analyze")
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

    text.includes("node") ||

    text.includes("sql") ||

    text.includes("bug") ||

    text.includes("error")
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

  // Offline

  if (

    text.includes("offline") ||

    text.includes("local mode")
  ) {

    return "ollama";
  }

  return "groq";
}