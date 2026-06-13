import {
  loadHistory,
  saveHistory
} from "../storage/chatHistoryStorage.js";

export async function addMessage(
  role,
  content
) {

  const history =
    await loadHistory();

  history.push({

    role,

    content,

    timestamp:
      Date.now()
  });

  await saveHistory(
    history
  );
}

export async function getRecentHistory(
  limit = 20
) {

  const history =
    await loadHistory();

  return history.slice(
    -limit
  );
}