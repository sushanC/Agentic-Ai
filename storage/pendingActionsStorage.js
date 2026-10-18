import path from "path";
import os from "os";
import { getStoragePath } from "./storagePath.js";
import { readJsonFile, withJsonFileLock, writeJsonFile } from "./jsonFile.js";

export function createPendingActionsStorage(filePath = getStoragePath("pendingActions.json")) {
  const pendingFile = path.resolve(filePath);
  const activeClaims = new Set();
  async function claimIsLive(action) {
    if (activeClaims.has(action.id)) return true;
    if (action.executionHost !== os.hostname() || !Number.isSafeInteger(action.executionPid)) return false;
    try { process.kill(action.executionPid, 0); return true; }
    catch (error) { return error.code === "EPERM"; }
  }
  async function readActions() {
    const actions = await readJsonFile(pendingFile, []);
    if (!Array.isArray(actions)) {
      const err = new Error("Pending action storage must contain a JSON array.");
      err.code = "JSON_STORAGE_CORRUPT";
      throw err;
    }
    return actions;
  }
  async function writeActions(actions) {
    return writeJsonFile(pendingFile, actions, { mode: 0o600 });
  }

  async function loadPendingActions() { return readActions(); }

  async function savePendingActions(actions) {
    if (!Array.isArray(actions)) throw new TypeError("Pending actions must be an array.");
    return withJsonFileLock(pendingFile, () => writeActions(actions));
  }

  async function addPendingAction(action) {
    return withJsonFileLock(pendingFile, async () => {
    const now = new Date();
    const actions = [];
    for (const a of await readActions()) {
      if (a.status === "executing" && !(await claimIsLive(a))) {
        a.status = "outcome_unknown";
        a.recoveredAt = now.toISOString();
        actions.push(a);
        continue;
      }
      const expired = !a.expiresAt || Date.parse(a.expiresAt) <= now.getTime();
      if (!expired || !["pending", "completed", "failed"].includes(a.status)) actions.push(a);
    }
    actions.push(action);
    await writeActions(actions);
    });
  }

  async function removePendingAction(id) {
    return withJsonFileLock(pendingFile, async () => {
    const actions = await readActions();
    const existing = actions.find(a => a.id === id);
    if (existing && existing.status !== "pending") return false;
    const updated = actions.filter(a => a.id !== id);
    await writeActions(updated);
    return updated.length !== actions.length;
    });
  }

/** Atomically transition pending -> executing; only one caller can claim it. */
  async function claimPendingAction(id, now = new Date()) {
    return withJsonFileLock(pendingFile, async () => {
    const actions = await readActions();
    const index = actions.findIndex(a => a.id === id);
    if (index < 0) return { status: "missing", action: null };

    const action = actions[index];
    if (action.status === "executing" && !(await claimIsLive(action))) {
      const recovered = { ...action, status: "outcome_unknown", recoveredAt: now.toISOString() };
      actions[index] = recovered;
      await writeActions(actions);
      return { status: "outcome_unknown", action: { ...recovered } };
    }
    if (action.status !== "pending") {
      return { status: action.status === "outcome_unknown" ? "outcome_unknown" : "already_claimed", action: { ...action } };
    }
    if (!action.expiresAt || Date.parse(action.expiresAt) <= now.getTime()) {
      actions.splice(index, 1);
      await writeActions(actions);
      return { status: "expired", action: null };
    }

    const claimed = { ...action, status: "executing", claimedAt: now.toISOString(), executionPid: process.pid, executionHost: os.hostname() };
    actions[index] = claimed;
    await writeActions(actions);
    activeClaims.add(id);
    return { status: "claimed", action: { ...claimed } };
    });
  }

/** Mark a claimed action terminal without making its payload executable again. */
  async function finishPendingAction(id, { status, error = null } = {}) {
  if (!new Set(["completed", "failed"]).has(status)) {
    throw new TypeError("A pending action must finish as completed or failed.");
  }
    return withJsonFileLock(pendingFile, async () => {
    const actions = await readActions();
    const index = actions.findIndex(a => a.id === id);
    if (index < 0 || actions[index].status !== "executing") return false;
    actions[index] = {
      ...actions[index],
      status,
      finishedAt: new Date().toISOString(),
      executionPid: undefined,
      executionHost: undefined,
      ...(error ? { executionError: error } : {}),
    };
    await writeActions(actions);
    activeClaims.delete(id);
    return true;
    });
  }

/** Cancellation only succeeds before an action has been claimed. */
  async function cancelPendingAction(id, now = new Date()) {
    return withJsonFileLock(pendingFile, async () => {
    const actions = await readActions();
    const index = actions.findIndex(a => a.id === id);
    if (index < 0) return { status: "missing", action: null };
    const action = actions[index];
    if (action.status !== "pending") return { status: "already_claimed", action: { ...action } };
    if (!action.expiresAt || Date.parse(action.expiresAt) <= now.getTime()) {
      actions.splice(index, 1);
      await writeActions(actions);
      return { status: "expired", action: null };
    }
    actions.splice(index, 1);
    await writeActions(actions);
    return { status: "cancelled", action: { ...action } };
    });
  }

  async function getPendingAction(id) {
    return withJsonFileLock(pendingFile, async () => {
      const actions = await readActions();
      const index = actions.findIndex(a => a.id === id);
      if (index < 0) return null;
      const action = actions[index];
      if (action.status === "executing" && !(await claimIsLive(action))) {
        const recovered = { ...action, status: "outcome_unknown", recoveredAt: new Date().toISOString() };
        actions[index] = recovered;
        await writeActions(actions);
        return null;
      }
      if (action.status !== "pending") return null;
      if (!action.expiresAt || Date.parse(action.expiresAt) <= Date.now()) {
        actions.splice(index, 1);
        await writeActions(actions);
        return null;
      }
      return action;
    });
  }

  async function cleanExpired() {
    return withJsonFileLock(pendingFile, async () => {
    const actions = await readActions();
    const now = new Date();
    let changed = false;
    const retained = [];
    for (const action of actions) {
      const expired = !action.expiresAt || Date.parse(action.expiresAt) <= now.getTime();
      if (action.status === "executing" && !(await claimIsLive(action))) {
        action.status = "outcome_unknown";
        action.recoveredAt = now.toISOString();
        changed = true;
        retained.push(action);
        continue;
      }
      if (!expired) { retained.push(action); continue; }
      if (action.status === "pending" || action.status === "completed" || action.status === "failed") {
        changed = true;
        continue;
      }
      retained.push(action);
    }
    if (changed) await writeActions(retained);
    return retained.filter(a => a.status === "pending").length;
    });
  }

  return { loadPendingActions, savePendingActions, addPendingAction, removePendingAction, claimPendingAction, finishPendingAction, cancelPendingAction, getPendingAction, cleanExpired };
}

const defaultStorage = createPendingActionsStorage();
export const loadPendingActions = (...args) => defaultStorage.loadPendingActions(...args);
export const savePendingActions = (...args) => defaultStorage.savePendingActions(...args);
export const addPendingAction = (...args) => defaultStorage.addPendingAction(...args);
export const removePendingAction = (...args) => defaultStorage.removePendingAction(...args);
export const claimPendingAction = (...args) => defaultStorage.claimPendingAction(...args);
export const finishPendingAction = (...args) => defaultStorage.finishPendingAction(...args);
export const cancelPendingAction = (...args) => defaultStorage.cancelPendingAction(...args);
export const getPendingAction = (...args) => defaultStorage.getPendingAction(...args);
export const cleanExpired = (...args) => defaultStorage.cleanExpired(...args);
