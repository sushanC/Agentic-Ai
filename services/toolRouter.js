/**
 * toolRouter.js — Backward Compatibility Adapter
 *
 * Forwards routeRequest calls to core/routing/ToolRouter.js.
 */
import { routeRequest as coreRouteRequest } from "../core/routing/ToolRouter.js";

export async function routeRequest(message, toolContext = "chat") {
  return await coreRouteRequest(message, toolContext);
}