/**
 * agentRouter.js — Backward Compatibility Adapter
 *
 * Forwards decideTool calls to core/routing/ToolRouter.js.
 */
import { decideTool as coreDecideTool } from "../core/routing/ToolRouter.js";

export async function decideTool(message) {
  return await coreDecideTool(message);
}