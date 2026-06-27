import { webSearch } from "../webSearchService.js";

export class WebSearchTool {
  async execute(action) {
    const query = typeof action.input === "string"
      ? action.input
      : action.input?.query || action.input?.text || "";

    try {
      const searchResults = await webSearch(query);
      const topResults = searchResults
        .slice(0, 3)
        .map(result => `• ${result.title}`)
        .join("\n");

      return `🔍 Search Results:\n\n${topResults}`;
    } catch (err) {
      console.log(err.message);
      return "❌ Search failed";
    }
  }
}
