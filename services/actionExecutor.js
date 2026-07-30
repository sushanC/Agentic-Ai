/**
 * actionExecutor.js — Backward Compatibility Adapter
 *
 * Forwards executeActions calls to core/execution/ActionExecutor.js.
 */
import { executeActions as coreExecuteActions } from "../core/execution/ActionExecutor.js";

export async function executeActions(plan) {
  return await coreExecuteActions(plan);
}