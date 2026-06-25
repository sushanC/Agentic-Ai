import fs from "fs/promises";

import {
  getStoragePath
} from "./storagePath.js";

const PROFILE_FILE =
  getStoragePath("profile.json");

export async function loadProfile() {

  try {

    const data =
      await fs.readFile(
        PROFILE_FILE,
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
    PROFILE_FILE,
    JSON.stringify(
      profile,
      null,
      2
    )
  );
}