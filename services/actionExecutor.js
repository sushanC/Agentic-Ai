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

      // ── Confirmation Intercept ────────────────────────────────────────────
      // If the tool returned a structured confirmation object, we stop
      // executing remaining actions and surface the confirmation to the user.
      // This is the ONLY addition for Phase 3 — all other paths are unchanged.
      if (
        result !== null &&
        typeof result === "object" &&
        result.status === "pending_confirmation"
      ) {
        console.log("\n🔒 CONFIRMATION REQUIRED — pausing execution:");
        console.log(`   Tool: ${result.tool}`);
        console.log(`   ID:   ${result.confirmationId}`);

        // Return immediately with the confirmation object.
        // Any actions after this one in the plan are NOT executed yet —
        // they will be re-run by POST /confirm after user approves.
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