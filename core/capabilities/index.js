/**
 * core/capabilities/index.js
 *
 * Public entry point for the Capability Framework (`core/capabilities/`).
 * Exports CapabilityManager, CapabilityRegistry, CapabilityRouter,
 * CapabilityContext, CapabilityResult, CapabilityLifecycle, CapabilityDiagnostics,
 * and BaseCapability.
 */

export { CapabilityManager, capabilityManager } from "./CapabilityManager.js";
export { CapabilityRegistry, capabilityRegistry } from "./CapabilityRegistry.js";
export { CapabilityRouter, capabilityRouter } from "./CapabilityRouter.js";
export { CapabilityContext } from "./CapabilityContext.js";
export { CapabilityResult } from "./CapabilityResult.js";
export { CapabilityLifecycle } from "./CapabilityLifecycle.js";
export { CapabilityDiagnostics, capabilityDiagnostics } from "./CapabilityDiagnostics.js";
export { BaseCapability } from "./BaseCapability.js";
