import axios from "axios";
import { askAI } from "../services/ai.js";

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

    return false;
  }

  const query =
    userMessage
      .replace(
        /^web search /i,
        ""
      )
      .trim();

  console.log(
    "\n🔍 Searching web...\n"
  );

  try {

    const response =
      await axios.get(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`
      );

    const webData =
      response.data
        .AbstractText ||
      "No results found.";

    const prompt = `
Answer using this web information.

Web Data:
${webData}

Question:
${query}
`;

    const answer =
      await askAI(prompt);

    console.log(
      "\n🌐 Web Answer:\n"
    );

    console.log(
      answer
    );

    console.log();

  } catch (err) {

    console.log(
      "\nAI: Web search failed.\n"
    );

    console.error(
      err.message
    );
  }

  return true;
}