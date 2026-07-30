/**
 * actionPlanner.js — Backward Compatibility Adapter
 *
 * Forwards planActions calls to core/planning/ActionPlanner.js.
 */
import { planActions as corePlanActions } from "../core/planning/ActionPlanner.js";

export async function planActions(message) {
  return await corePlanActions(message);
}