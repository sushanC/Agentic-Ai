import {
  saveProfile
} from "../storage/profileStorage.js";

export async function handleMemory(
  userMessage,
  profile
) {

  // remember

  if (
    userMessage
      .toLowerCase()
      .startsWith(
        "remember "
      )
  ) {

    const fact =
      userMessage.replace(
        /^remember /i,
        ""
      );

    const parts =
      fact.split("=");

    if (
      parts.length !== 2
    ) {

      console.log(
        "\nUsage:\nremember key = value\n"
      );

      return true;
    }

    const key =
      parts[0].trim();

    const value =
      parts[1].trim();

    profile[key] =
      value;

    await saveProfile(
      profile
    );

    console.log(
      `\n🧠 Remembered ${key} = ${value}\n`
    );

    return true;
  }

  // what do you know about me

  if (
    userMessage
      .toLowerCase() ===
    "what do you know about me"
  ) {

    console.log(
      "\n🧠 Profile:\n"
    );

    console.log(
      JSON.stringify(
        profile,
        null,
        2
      )
    );

    console.log();

    return true;
  }

  // what is my

  if (
    userMessage
      .toLowerCase()
      .startsWith(
        "what is my "
      )
  ) {

    const key =
      userMessage
        .replace(
          /^what is my /i,
          ""
        )
        .trim();

    if (
      profile[key]
    ) {

      console.log(
        `\nAI: Your ${key} is ${profile[key]}\n`
      );

    } else {

      console.log(
        `\nAI: I don't know your ${key} yet.\n`
      );
    }

    return true;
  }

  return false;
}