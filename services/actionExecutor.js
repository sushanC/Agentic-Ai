import registry from "./toolRegistry.js";

/**
 * Execute a structured action plan produced by actionPlanner.js.
 * Delegates execution of individual actions to tools registered in the
 * ToolRegistry.
 *
 * Phase 3 — Confirmation Workflow:
 * If a tool returns a structured confirmation object
 * (i.e. { status: "pending_confirmation", ... }), the executor
 * intercepts it and returns it directly so the calling layer
 * (toolRouter / server) can forward it to the frontend unchanged.
 *
 * This keeps actionPlanner, toolRegistry, and all existing tools
 * completely unmodified.
 *
 * @param {Object} plan - { actions: Array<{ tool, action, input }> }
 * @returns {Promise<Array<string|object>>} - Results for each action.
 *   Most results are strings. A confirmation-gated tool returns an object.
 */
export async function executeActions(plan) {
  if (!plan.actions) {
    return ["❌ Invalid plan format"];
  }

  const results = [];

  console.log("\n⚙️ EXECUTING PLAN (Tool Registry Framework):");
  console.log(JSON.stringify(plan, null, 2));

  for (const action of plan.actions) {
    console.log("\n▶ ACTION:");
    console.log(action);

    try {
      const result = await registry.executeTool(action);

      // ── Confirmation / Waiting Intercept ─────────────────────────────────
      // If the tool returned a structured pending_confirmation or waiting_input
      // object, stop executing remaining actions and surface it to the caller.
      // Phase 3: pending_confirmation (user must confirm before execution)
      // Phase 5: waiting_input (AI is asking for missing information)
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

        // Return immediately — any remaining plan actions are NOT executed.
        // Execution resumes when the user provides the missing info or confirms.
        return [result];
      }
      // ─────────────────────────────────────────────────────────────────────

      results.push(result);
    } catch (err) {
      console.error(`Error executing tool "${action.tool}":`, err);
      results.push(`❌ Action failed: ${action.tool}`);
    }
  }

  return results;
}