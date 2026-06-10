import fs from "fs/promises";

const FILE =
  "./dsa_session.json";

export async function loadDSASession() {

  try {

    const data =
      await fs.readFile(
        FILE,
        "utf-8"
      );

    return JSON.parse(data);

  } catch {

    return {};
  }
}

export async function saveDSASession(
  session
) {

  await fs.writeFile(
    FILE,
    JSON.stringify(
      session,
      null,
      2
    )
  );
}