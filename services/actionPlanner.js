import { askModelCie } from "./ai.js";

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

  try {

    const response = await askModelCie("groq", message, "ActionPlanning");

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