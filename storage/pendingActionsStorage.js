import fs from "fs/promises";
import { getStoragePath } from "./storagePath.js";

/**
 * pendingActionsStorage.js
 *
 * Persistent storage for the Confirmation Workflow (Phase 3).
 * All pending actions are stored in:
 *   ~/.personal-agent/pendingActions.json
 *
 * Each pending action record:
 * {
 *   id:          string   — unique confirmation ID (timestamp + random)
 *   tool:        string   — e.g. "email_draft"
 *   action:      string   — e.g. "draft"
 *   payload:     object   — full action object for re-execution
 *   preview:     object   — structured data for frontend preview
 *   title:       string   — human-readable title
 *   message:     string   — human-readable prompt for user
 *   createdAt:   string   — ISO timestamp
 *   expiresAt:   string   — ISO timestamp (createdAt + TTL)
 *   status:      "pending"
 * }
 *
 * Reused by: confirmationService.js
 * Compatible with: Electron, React frontend, existing storage patterns
 */

const PENDING_FILE = getStoragePath("pendingActions.json");

/**
 * Load all pending actions from disk.
 * Returns an empty array if the file does not exist yet.
 */
export async function loadPendingActions() {
  try {
    const data = await fs.readFile(PENDING_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

/**
 * Overwrite the entire pending actions list on disk.
 */
export async function savePendingActions(actions) {
  await fs.writeFile(
    PENDING_FILE,
    JSON.stringify(actions, null, 2)
  );
}

/**
 * Append a new pending action to the list.
 * Automatically removes any already-expired records before saving.
 *
 * @param {object} action - A fully-formed pending action record.
 */
export async function addPendingAction(action) {
  const actions = await loadPendingActions();
  const now = new Date().toISOString();

  // Purge expired records on every write to keep the file clean
  const active = actions.filter(a => a.expiresAt > now);

  active.push(action);
  await savePendingActions(active);
}

/**
 * Remove a single pending action by its ID.
 * Silently succeeds even if the ID is not found.
 *
 * @param {string} id - The confirmation ID to remove.
 */
export async function removePendingAction(id) {
  const actions = await loadPendingActions();
  const updated = actions.filter(a => a.id !== id);
  await savePendingActions(updated);
}

/**
 * Retrieve a single pending action by ID.
 * Returns null if not found or if already expired.
 *
 * @param {string} id
 * @returns {object|null}
 */
export async function getPendingAction(id) {
  const actions = await loadPendingActions();
  const now = new Date().toISOString();

  const action = actions.find(a => a.id === id);

  if (!action) return null;

  // Treat expired records as if they do not exist
  if (action.expiresAt <= now) {
    await removePendingAction(id);
    return null;
  }

  return action;
}

/**
 * Remove all expired pending actions from disk.
 * Called proactively on server startup and on each load.
 */
export async function cleanExpired() {
  const actions = await loadPendingActions();
  const now = new Date().toISOString();
  const active = actions.filter(a => a.expiresAt > now);
  await savePendingActions(active);
  return active.length;
}
