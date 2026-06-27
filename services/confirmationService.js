import {
  addPendingAction,
  getPendingAction,
  removePendingAction,
  cleanExpired
} from "../storage/pendingActionsStorage.js";

/**
 * confirmationService.js
 *
 * The core Confirmation Layer for the Tool Framework.
 *
 * This service is GENERIC — it contains zero tool-specific logic.
 * Any future tool (calendar, file delete, browser purchase, etc.)
 * uses this same service to create and resolve confirmations.
 *
 * Architecture:
 *   Tool.execute()
 *     → confirmationService.createPending(...)
 *     → returns { status: "pending_confirmation", confirmationId, ... }
 *
 *   POST /confirm { confirmationId }
 *     → confirmationService.confirmAction(id)
 *     → executes the original tool action via the registry
 *     → returns execution result
 *
 *   POST /cancel { confirmationId }
 *     → confirmationService.cancelAction(id)
 *     → deletes pending record
 *     → returns { success: true }
 *
 * Reused by: emailDraftTool.js (Phase 3)
 * Future tools: calendarTool.js, deleteFileTool.js, checkoutTool.js, etc.
 */

const DEFAULT_TTL_MINUTES = 30;

/**
 * Generate a unique confirmation ID.
 * Format: <timestamp>-<4-char random hex>
 */
function generateId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 6);
  return `${ts}-${rand}`;
}

/**
 * Create a pending confirmation for a dangerous action.
 *
 * @param {object} options
 * @param {string}  options.tool         - Tool name (e.g. "email_draft")
 * @param {string}  options.action       - Action name (e.g. "draft")
 * @param {object}  options.payload      - The original action object for re-execution
 * @param {object}  options.preview      - Structured data for frontend to display
 * @param {string}  options.title        - Short human-readable title
 * @param {string}  options.message      - Confirmation prompt shown to user
 * @param {number} [options.ttlMinutes]  - How long this confirmation stays valid (default: 30)
 *
 * @returns {object} - The full confirmation response object (returned to frontend)
 */
export async function createPending({
  tool,
  action,
  payload,
  preview,
  title,
  message,
  ttlMinutes = DEFAULT_TTL_MINUTES
}) {

  const id = generateId();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + ttlMinutes * 60 * 1000);

  const pendingRecord = {
    id,
    tool,
    action,
    payload,
    preview,
    title,
    message,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    status: "pending"
  };

  await addPendingAction(pendingRecord);

  console.log(`\n🔒 CONFIRMATION CREATED [${tool}/${action}]: ${id}`);

  return {
    success: true,
    status: "pending_confirmation",
    confirmationId: id,
    tool,
    action,
    title,
    message,
    preview,
    expiresAt: expiresAt.toISOString()
  };
}

/**
 * Confirm a pending action — execute it and clean up.
 *
 * @param {string} confirmationId
 * @returns {object} - { success: true, result: "..." } or { success: false, message: "..." }
 */
export async function confirmAction(confirmationId) {

  // Always clean stale records before checking
  await cleanExpired();

  const pending = await getPendingAction(confirmationId);

  if (!pending) {
    return {
      success: false,
      message: "Confirmation request not found or has expired."
    };
  }

  console.log(`\n✅ CONFIRMING [${pending.tool}/${pending.action}]: ${confirmationId}`);

  try {

    // Lazy import to avoid circular dependencies
    const { registry } = await import("./toolRegistry.js");

    // Reconstruct the action object that the tool expects
    const actionToExecute = {
      ...pending.payload,
      _confirmedAt: new Date().toISOString()
    };

    // Execute the tool's confirmed logic
    const result = await registry.executeTool(actionToExecute);

    // Remove the pending record now that it has been executed
    await removePendingAction(confirmationId);

    console.log(`\n🎯 CONFIRMATION EXECUTED [${pending.tool}]: ${confirmationId}`);

    return {
      success: true,
      tool: pending.tool,
      action: pending.action,
      result
    };

  } catch (err) {

    console.error(`\n❌ CONFIRMATION EXECUTION ERROR [${confirmationId}]:`, err);

    return {
      success: false,
      message: `Execution failed: ${err.message}`
    };
  }
}

/**
 * Cancel a pending action — remove it without executing.
 *
 * @param {string} confirmationId
 * @returns {object} - { success: true } or { success: false, message: "..." }
 */
export async function cancelAction(confirmationId) {

  const pending = await getPendingAction(confirmationId);

  if (!pending) {
    return {
      success: false,
      message: "Confirmation request not found."
    };
  }

  await removePendingAction(confirmationId);

  console.log(`\n🚫 CONFIRMATION CANCELLED [${pending.tool}/${pending.action}]: ${confirmationId}`);

  return {
    success: true,
    message: `Action cancelled: ${pending.title}`
  };
}

/**
 * List all currently active (non-expired) pending actions.
 * Useful for the GET /pending endpoint and debugging.
 *
 * @returns {object[]}
 */
export async function listPending() {
  await cleanExpired();
  const { loadPendingActions } = await import("../storage/pendingActionsStorage.js");
  return await loadPendingActions();
}
