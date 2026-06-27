import { askGroq } from "./ai.js";

/**
 * actionPlanner.js
 *
 * Takes a user request and returns a structured
 * action plan as JSON for actionExecutor to run.
 *
 * Available actions:
 *   research        — search the web and synthesize a report
 *   web_search      — raw web search results
 *   summarize       — summarize a topic or content
 *   analyze         — analyze content or data
 *   plan            — create a structured plan or roadmap
 *   save_note       — save specific text as a note
 *   save_research_note — save the last research result as a note
 *   create_task     — create a single task
 *   create_study_tasks — extract and create multiple study tasks
 *   memory_lookup   — retrieve from memory
 *   pdf_search      — search uploaded PDFs
 *   email_draft     — prepare an email draft for user confirmation (Phase 3)
 */
export async function planActions(
  message
) {

  console.log("\n🧠 PLANNING:");
  console.log(message);

  const prompt = `
You are an AI planning engine.

Available actions:

research
web_search
summarize
analyze
plan
save_note
save_research_note
create_task
create_study_tasks
memory_lookup
pdf_search
email_draft

Definitions:

research: Search the web and generate a detailed report on a topic.
web_search: Perform a raw web search.
summarize: Summarize a topic, document, or content into key points.
analyze: Analyze something and provide insights.
plan: Create a structured plan, roadmap, or step-by-step guide.
save_note: Save specific text as a note.
save_research_note: Save the last research result as a note.
create_task: Create a single actionable task.
create_study_tasks: Extract and create multiple study tasks from research.
email_draft: Prepare an email draft for user confirmation before sending. Use when user wants to send, write, draft, or compose an email.

User Request:

${message}

Return ONLY valid JSON. No markdown. No code fences. No explanation.

Schema:
{
  "actions": [
    {
      "tool": "tool_name",
      "input": "input_text"
    }
  ]
}

Even if there is only ONE action, it must still be inside the actions array.

Examples:

User: Research Kubernetes and save notes
Output:
{
  "actions": [
    { "tool": "research", "input": "Kubernetes" },
    { "tool": "save_research_note", "input": "Kubernetes" }
  ]
}

User: Summarize machine learning
Output:
{
  "actions": [
    { "tool": "summarize", "input": "machine learning" }
  ]
}

User: Create a plan to learn React
Output:
{
  "actions": [
    { "tool": "plan", "input": "Learn React from scratch" }
  ]
}

User: Analyze the pros and cons of microservices
Output:
{
  "actions": [
    { "tool": "analyze", "input": "pros and cons of microservices" }
  ]
}

User: Add task finish DSA assignment
Output:
{
  "actions": [
    { "tool": "create_task", "input": "Finish DSA assignment" }
  ]
}

User: Draft an email to john@example.com about the project update
Output:
{
  "actions": [
    { "tool": "email_draft", "input": "Draft an email to john@example.com about the project update" }
  ]
}

User: Send email to alice@corp.com subject: Meeting Tomorrow body: Are you free at 3pm?
Output:
{
  "actions": [
    { "tool": "email_draft", "input": "Send email to alice@corp.com subject: Meeting Tomorrow body: Are you free at 3pm?" }
  ]
}
`;

  try {

    const response = await askGroq(prompt);

    console.log("\n📋 RAW PLAN:");
    console.log(response);

    const cleaned = response
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const plan = JSON.parse(cleaned);

    if (!plan.actions) {
      return { actions: [plan] };
    }

    return plan;

  } catch (err) {

    console.log("\n❌ PLANNER ERROR:");
    console.log(err);

    return { actions: [] };
  }
}