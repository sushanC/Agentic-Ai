import {
  askAI
} from "../services/ai.js";

import {
  loadDSASession,
  saveDSASession
} from "../storage/dsaStorage.js";

import {
  loadDSAProgress,
  saveDSAProgress
} from "../storage/dsaProgressStorage.js";

export async function handleDSA(
  userMessage
) {

  if (
    userMessage
      .toLowerCase() ===
    "start dsa session"
  ) {

    console.log(
      "\n🚀 DSA Session Started\n"
    );

    console.log(
      "Commands:"
    );

    console.log(
      "- ask dsa <topic>"
    );

    console.log(
      "- give dsa easy"
    );

    console.log(
      "- give dsa medium"
    );

    console.log(
      "- give dsa hard\n"
    );

    return true;
  }

  if (
    userMessage
      .toLowerCase()
      .startsWith(
        "ask dsa "
      )
  ) {

    const topic =
      userMessage
        .replace(
          /^ask dsa /i,
          ""
        )
        .trim();

    const prompt = `
You are a DSA mentor.

Teach the topic:

${topic}

Format:

1. Concept
2. Key Operations
3. Time Complexity
4. Common Interview Questions
5. Example
`;

    const answer =
      await askAI(
        prompt
      );

    console.log(
      "\n📚 DSA Topic:\n"
    );

    console.log(
      answer
    );

    console.log();

    return true;
  }

  if (
    userMessage
      .toLowerCase()
      .startsWith(
        "give dsa "
      )
  ) {

    const difficulty =
      userMessage
        .replace(
          /^give dsa /i,
          ""
        )
        .trim();

    const prompt = `
Generate one ${difficulty}
DSA interview problem.

Include:

1. Problem Statement
2. Example Input
3. Example Output
4. Constraints
5. Hint

Do NOT give solution.
`;

    const question =
      await askAI(
        prompt
      );
      const session =
  await loadDSASession();

session.lastQuestion =
  question;

await saveDSASession(
  session
);

    console.log(
      "\n🧩 DSA Problem:\n"
    );

    console.log(
      question
    );

    console.log();

    return true;
  }

  if (
  userMessage
    .toLowerCase()
    .startsWith(
      "solve dsa "
    )
) {

  const solution =
    userMessage
      .replace(
        /^solve dsa /i,
        ""
      )
      .trim();

  const session =
    await loadDSASession();

  if (
    !session.lastQuestion
  ) {

    console.log(
      "\nAI: Generate a DSA question first.\n"
    );

    return true;
  }

  const prompt = `
You are a FAANG interviewer.

Question:
${session.lastQuestion}

Candidate Solution:
${solution}

Evaluate:

1. Correctness
2. Time Complexity
3. Space Complexity
4. Better Approach
5. Interview Feedback

Give score out of 10.
`;

  const review =
    await askAI(
      prompt
    );

  console.log(
    "\n🎯 Evaluation:\n"
  );

  console.log(
    review
  );

  console.log();

  return true;
}

if (
  userMessage
    .toLowerCase()
    .startsWith(
      "mock interview "
    )
) {

  const topic =
    userMessage
      .replace(
        /^mock interview /i,
        ""
      )
      .trim();

  const prompt = `
You are a senior software engineer.

Conduct a mock DSA interview on:

${topic}

Ask ONLY the first question.

Do not provide answers.
Wait for candidate response.
`;

  const question =
    await askAI(
      prompt
    );

  console.log(
    "\n🎤 Mock Interview:\n"
  );

  console.log(
    question
  );

  console.log();

  return true;
}

if (
  userMessage
    .toLowerCase()
    .startsWith(
      "rate dsa "
    )
) {

  const parts =
    userMessage.split(" ");

  if (
    parts.length < 4
  ) {

    console.log(
      "\nUsage: rate dsa <topic> <score>\n"
    );

    return true;
  }

  const topic =
    parts[2]
      .toLowerCase();

  const score =
    Number(
      parts[3]
    );

  const progress =
    await loadDSAProgress();

  progress[topic] =
    score;

  await saveDSAProgress(
    progress
  );

  console.log(
    `\n✅ Saved ${topic}: ${score}/10\n`
  );

  return true;
}

if (
  userMessage
    .toLowerCase() ===
  "show dsa progress"
) {

  const progress =
    await loadDSAProgress();

  console.log(
    "\n📊 DSA Progress:\n"
  );

  Object.entries(
    progress
  ).forEach(
    ([topic, score]) => {

      console.log(
        `${topic}: ${score}/10`
      );
    }
  );

  console.log();

  return true;
}
if (
  userMessage
    .toLowerCase() ===
  "dsa roadmap"
) {

  const progress =
    await loadDSAProgress();

  const prompt = `
You are a FAANG DSA mentor.

Student Scores:

${JSON.stringify(
  progress,
  null,
  2
)}

Create:

1. Weak Areas
2. Strong Areas
3. Priority Order
4. 30 Day Improvement Plan
`;

  const roadmap =
    await askAI(
      prompt
    );

  console.log(
    "\n🗺️ DSA Roadmap:\n"
  );

  console.log(
    roadmap
  );

  console.log();

  return true;
}
  return false;
}