import { toolRegistry } from "../registry/ToolRegistry.js";

/**
 * ActionExecutor.js
 *
 * Executes a structured action plan produced by ActionPlanner.
 * Delegates execution of individual actions to tools registered in ToolRegistry.
 *
 * Handles Confirmation Workflow:
 * If a tool returns a structured confirmation object (pending_confirmation or waiting_input),
 * execution pauses immediately and returns the object to the caller.
 *
 * @param {object} plan - { actions: Array<{ tool, action, input }> }
 * @returns {Promise<Array<string|object>>} Action results
 */
export async function executeActions(plan) {
  if (!plan || !plan.actions) {
    return ["❌ Invalid plan format"];
  }

  const results = [];
  const steps = [];
  results.steps = steps;

  console.log("[ActionExecutor] Executing tool plan", { actionCount: plan.actions.length });

  for (const action of plan.actions) {
    console.log("[ActionExecutor] Running action", { tool: action.tool });

    steps.push({ name: action.tool, status: "completed" });

    try {
      const result = await toolRegistry.executeTool(action);

      // Confirmation / Waiting Input Intercept
      if (
        result !== null &&
        typeof result === "object" &&
        (result.status === "pending_confirmation" ||
         result.status === "waiting_input")
      ) {
        if (result.status === "pending_confirmation") {
          console.log("\n🔒 CONFIRMATION REQUIRED — pausing execution:");
        } else {
          console.log("\n📧 WAITING FOR INPUT — pausing execution:");
        }
        console.log(`   Tool: ${result.tool}`);
        console.log(`   ID:   ${result.confirmationId}`);

        results.push(result);
        return results;
      }

      results.push(result);
    } catch (err) {
      console.error("[ActionExecutor] Tool execution failed", { tool: action.tool, code: err.code || "EXECUTION_ERROR" });
      const lastStep = steps[steps.length - 1];
      if (lastStep) lastStep.status = "failed";
      results.push(`❌ Action failed: ${action.tool}`);
    }
  }

  return results;
}
