/**
 * modelRouter.js — Backward Compatibility Adapter
 *
 * Forwards decideModel calls to core/routing/ModelRouter.js.
 */
import { decideModel as coreDecideModel } from "../core/routing/ModelRouter.js";

export async function decideModel(
  message = "",
  tool = "chat",
  overrides = {},
  _healthScores = {},
  settings = {}
) {
  return await coreDecideModel(message, tool, overrides, _healthScores, settings);
}