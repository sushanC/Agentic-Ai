import axios from "axios";

export async function webSearch(
  query
) {

  console.log(
    "\n🔍 SERPER SEARCH:"
  );

  console.log(
    query
  );

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

  return (
    response.data
      .organic || []
  );
}