import fs from "fs/promises";

export async function loadProfile() {

  try {

    const data =
      await fs.readFile(
        "./memory/profile.json",
        "utf-8"
      );

    return JSON.parse(data);

  } catch {

    return {};
  }
}

export async function saveProfile(
  profile
) {

  await fs.writeFile(
    "./memory/profile.json",
    JSON.stringify(
      profile,
      null,
      2
    )
  );
}