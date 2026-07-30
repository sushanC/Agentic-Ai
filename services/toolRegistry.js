/**
 * toolRegistry.js — Backward Compatibility Adapter
 *
 * Forwards calls to core/registry/ToolRegistry.js.
 */
import { toolRegistry } from "../core/registry/ToolRegistry.js";

export default toolRegistry;
export { toolRegistry as registry };
