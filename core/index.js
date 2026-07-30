/**
 * core/index.js
 *
 * Public entry point for the Agent Core package (`core/`).
 * Re-exports all core registries, routers, planner, executor, context, runtime, and events modules.
 */

// Agent Runtime & Reliability Layer
export { AgentRuntime, agentRuntime } from "./agent/AgentRuntime.js";
export * from "./runtime/index.js";

// Planning & Execution
export { planActions } from "./planning/ActionPlanner.js";
export { executeActions } from "./execution/ActionExecutor.js";

// Routing
export { routeRequest, decideTool, isAgentRequest, isDesktopRequest } from "./routing/ToolRouter.js";
export { decideModel } from "./routing/ModelRouter.js";

// Registries
export { ToolRegistry, toolRegistry } from "./registry/ToolRegistry.js";
export { modelRegistry, resolveModel, getModel, getEnabledModels } from "./registry/ModelRegistry.js";
export { FeatureRegistry, featureRegistry } from "./registry/FeatureRegistry.js";

// Context
export { ContextAssembly } from "./context/ContextAssembly.js";

// Events & Diagnostics
export { developerEvents } from "./events/DeveloperEvents.js";
