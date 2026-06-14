import axios from "axios";
import { askAI } from "../services/ai.js";

async function webSearch(query) {

  const response =
    await axios.post(
      "https://google.serper.dev/search",
      {
        q: query
      },
      {
        headers: {
          "X-API-KEY":
            process.env.SERPER_API_KEY,
          "Content-Type":
            "application/json"
        }
      }
    );

  return response.data.organic || [];
}

export async function handleWeb(
  userMessage
) {

  if (
    !userMessage
      .toLowerCase()
      .startsWith(
        "web search "
      )
  ) {

    return null;
  }

  const query =
    userMessage
      .replace(
        /^web search /i,
        ""
      )
      .trim();

      console.log(
  "\n🔍 SERPER SEARCH:"
);

console.log(query);

  try {

    const results =
      await webSearch(query);

    const context =
      results
        .slice(0, 5)
        .map(
          r => `
Title:
${r.title}

Snippet:
${r.snippet}
`
        )
        .join("\n\n");

    const prompt = `
Answer the question using the web results.

Question:
${query}

Web Results:
${context}

Provide a clear answer.
`;

    const answer =
      await askAI(prompt);

    return answer;

  } catch (err) {

    console.error(
      err.message
    );

    return "Web search failed.";
  }
}