import crypto from "crypto";
import {
  addPendingAction,
  claimPendingAction,
  finishPendingAction,
  cancelPendingAction,
  loadPendingActions,
  cleanExpired,
} from "../storage/pendingActionsStorage.js";

const DEFAULT_TTL_MINUTES = 30;
const defaultStorage = { addPendingAction, claimPendingAction, finishPendingAction, cancelPendingAction, loadPendingActions, cleanExpired };

async function executeThroughRegistry(action) {
  const { registry } = await import("./toolRegistry.js");
  return registry.executeTool(action);
}

export function createConfirmationService({ storage = defaultStorage, executeTool = executeThroughRegistry } = {}) {
  async function createPending({ tool, action, payload, preview, title, message, ttlMinutes = DEFAULT_TTL_MINUTES }) {
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + ttlMinutes * 60 * 1000);
    const id = `${Date.now().toString(36)}-${crypto.randomUUID()}`;
    const record = {
      id, tool, action, payload, preview, title, message,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      status: "pending",
    };
    await storage.addPendingAction(record);
    return {
      success: true,
      status: "pending_confirmation",
      confirmationId: id,
      tool,
      action,
      title,
      message,
      preview,
      expiresAt: record.expiresAt,
    };
  }

  async function confirmAction(confirmationId) {
    if (typeof confirmationId !== "string" || confirmationId.length > 160) {
      return { success: false, code: "INVALID_CONFIRMATION_ID", message: "This confirmation request is invalid or has expired." };
    }

    const claim = await storage.claimPendingAction(confirmationId);
    if (claim.status !== "claimed") {
      const messages = {
        missing: "This confirmation request was not found.",
        expired: "This confirmation request has expired.",
        already_claimed: "This action has already been claimed and cannot run again. Check its status before creating a new action.",
        outcome_unknown: "This action may have run before the application restarted. Check the external service before creating a new action.",
      };
      return { success: false, code: claim.status.toUpperCase(), status: claim.status, message: messages[claim.status] };
    }

    const pending = claim.action;
    try {
      const action = { ...pending.payload, _confirmedAt: new Date().toISOString() };
      const result = await executeTool(action);
      const failed = result && typeof result === "object" && result.success === false;
      const proposedCode = result?.code || result?.error?.code;
      const code = typeof proposedCode === "string" && /^[A-Z0-9_-]{1,64}$/.test(proposedCode)
        ? proposedCode
        : "ACTION_FAILED";
      const safeMessage = typeof result?.userMessage === "string"
        ? result.userMessage
        : "The action failed and will not be run again automatically.";
      const requiresReauth = Boolean(result?.requiresReauth || result?.metadata?.requiresReauth || result?.error?.requiresReauth);
      const retryable = Boolean(result?.retryable ?? result?.metadata?.automaticRetryable ?? result?.error?.retryable ?? false);
      const safeResult = failed ? {
        success: false,
        code,
        userMessage: safeMessage,
        retryable,
        requiresReauth,
        ...(typeof result.authUrl === "string" ? { authUrl: result.authUrl } : {}),
      } : result;
      const error = failed ? {
        code,
        requiresReauth,
        retryable,
      } : null;
      await storage.finishPendingAction(confirmationId, { status: failed ? "failed" : "completed", error });
      return {
        success: !failed,
        tool: pending.tool,
        action: pending.action,
        status: failed ? "failed" : "completed",
        ...(failed ? { message: safeMessage, error: { code, requiresReauth, retryable } } : {}),
        result: safeResult,
      };
    } catch (err) {
      const code = typeof err.code === "string" && /^[A-Z0-9_-]{1,64}$/.test(err.code) ? err.code : "EXECUTION_ERROR";
      console.error("[Confirmation] Action execution failed", { tool: pending.tool, code });
      await storage.finishPendingAction(confirmationId, {
        status: "failed",
        error: { code, requiresReauth: Boolean(err.requiresReauth), retryable: Boolean(err.retryable) },
      });
      return {
        success: false,
        status: "failed",
        tool: pending.tool,
        action: pending.action,
        message: err.userMessage || "The action failed and will not be retried automatically.",
        error: {
          code,
          userMessage: err.userMessage || null,
          retryable: Boolean(err.retryable),
          requiresReauth: Boolean(err.requiresReauth),
          authUrl: err.authUrl || null,
        },
      };
    }
  }

  async function cancelAction(confirmationId) {
    const result = await storage.cancelPendingAction(confirmationId);
    if (result.status !== "cancelled") {
      return {
        success: false,
        status: result.status,
        message: result.status === "already_claimed"
          ? "This action has already started and can no longer be cancelled."
          : "Confirmation request not found or expired.",
      };
    }
    return { success: true, status: "cancelled", message: `Action cancelled: ${result.action.title}` };
  }

  async function listPending() {
    await storage.cleanExpired();
    return (await storage.loadPendingActions()).filter(a => ["pending", "executing", "failed", "outcome_unknown"].includes(a.status));
  }

  return { createPending, confirmAction, cancelAction, listPending };
}

const service = createConfirmationService();
export const createPending = (...args) => service.createPending(...args);
export const confirmAction = (...args) => service.confirmAction(...args);
export const cancelAction = (...args) => service.cancelAction(...args);
export const listPending = (...args) => service.listPending(...args);
