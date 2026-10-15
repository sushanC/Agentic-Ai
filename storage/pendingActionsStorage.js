import path from "path";
import { getStoragePath } from "./storagePath.js";
import { readJsonFile, withJsonFileLock, writeJsonFile } from "./jsonFile.js";

export function createPendingActionsStorage(filePath = getStoragePath("pendingActions.json")) {
  const pendingFile = path.resolve(filePath);
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
    const now = new Date().toISOString();
    const actions = (await readActions()).filter(a => a.expiresAt > now);
    actions.push(action);
    await writeActions(actions);
    });
  }

  async function removePendingAction(id) {
    return withJsonFileLock(pendingFile, async () => {
    const actions = await readActions();
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
    if (!action.expiresAt || Date.parse(action.expiresAt) <= now.getTime()) {
      actions.splice(index, 1);
      await writeActions(actions);
      return { status: "expired", action: null };
    }
    if (action.status !== "pending") return { status: "already_claimed", action: { ...action } };

    const claimed = { ...action, status: "executing", claimedAt: now.toISOString() };
    actions[index] = claimed;
    await writeActions(actions);
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
      ...(error ? { executionError: error } : {}),
    };
    await writeActions(actions);
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
    if (!action.expiresAt || Date.parse(action.expiresAt) <= now.getTime()) {
      actions.splice(index, 1);
      await writeActions(actions);
      return { status: "expired", action: null };
    }
    if (action.status !== "pending") return { status: "already_claimed", action: { ...action } };
    actions.splice(index, 1);
    await writeActions(actions);
    return { status: "cancelled", action: { ...action } };
    });
  }

  async function getPendingAction(id) {
  const actions = await readActions();
  const action = actions.find(a => a.id === id);
  if (!action) return null;
  if (!action.expiresAt || Date.parse(action.expiresAt) <= Date.now()) {
    await removePendingAction(id);
    return null;
  }
  return action;
  }

  async function cleanExpired() {
    return withJsonFileLock(pendingFile, async () => {
    const actions = await readActions();
    const now = new Date().toISOString();
    const active = actions.filter(a => a.expiresAt > now);
    if (active.length !== actions.length) await writeActions(active);
    return active.length;
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
