import { askGroq } from "./ai.js";

export async function planActions(
  message
) {

    console.log(
  "\n🧠 PLANNING:"
);

console.log(
  message
);

  const prompt = `
You are an AI planning engine.

Available actions:

research
web_search
save_note
create_task
memory_lookup
pdf_search
save_research_note

User Request:

${message}

Return ONLY valid JSON.

The JSON MUST always follow this schema:

{
  "actions": [
    {
      "tool": "tool_name",
      "input": "input_text"
    }
  ]
}
Even if there is only ONE action,
it must still be inside the actions array.

If the user says:

Research X

Use:

{
  "actions": [
    {
      "tool":"research",
      "input":"X"
    }
  ]
}

Example:

User:
Research Kubernetes and save notes

Output:
{
  "actions": [
    {
      "tool": "research",
      "input": "Kubernetes"
    },
    {
      "tool": "save_research_note",
      "input": "Kubernetes"
    }
  ]
}
`;

  try {

const response =
  await askGroq(
    prompt
  );

console.log(
  "\n📋 RAW PLAN:"
);

console.log(
  response
);

const cleaned =
  response
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

const plan =
  JSON.parse(cleaned);

if (!plan.actions) {

  return {
    actions: [plan]
  };
}

return plan;

}catch (err) {

  console.log(
    "\n❌ PLANNER ERROR:"
  );

  console.log(err);

  return {
    actions: []
  };
}
}