import { askModelCie } from "../../services/ai.js";

/**
 * ActionPlanner.js
 *
 * Takes a user request and converts it into a structured
 * action plan as JSON for ActionExecutor to run.
 *
 * @param {string} message - User request prompt
 * @returns {Promise<{actions: Array<{tool: string, action?: string, input: any}>}>}
 */
export async function planActions(message) {
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
