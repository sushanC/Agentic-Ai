/**
 * desktopHistoryStorage.js
 *
 * Stores and retrieves recent desktop actions (newest first, max 100).
 * Follows the same pattern as notesStorage.js and activityStorage.js.
 *
 * Storage: ~/.personal-agent/desktop_history.json
 */

import fs from 'fs/promises';
import { getStoragePath } from './storagePath.js';

const MAX_HISTORY = 100;
const FILE_NAME   = 'desktop_history.json';

// getStoragePath is synchronous — just call it directly
function getFilePath() {
  return getStoragePath(FILE_NAME);
}

/**
 * Load all desktop action history records.
 * @returns {Promise<object[]>}
 */
export async function loadDesktopHistory() {
  try {
    const data = await fs.readFile(getFilePath(), 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    console.error('[DesktopHistory] Load error:', err.message);
    return [];
  }
}

/**
 * Append a new desktop action record to history.
 * Oldest records are dropped after 100 entries.
 * @param {object} record
 */
export async function addDesktopAction(record) {
  try {
    const history = await loadDesktopHistory();
    history.unshift(record);

    // Enforce maximum size
    if (history.length > MAX_HISTORY) {
      history.length = MAX_HISTORY;
    }

    await fs.writeFile(getFilePath(), JSON.stringify(history, null, 2), 'utf-8');
  } catch (err) {
    // Non-fatal — diagnostics must never crash the action pipeline
    console.error('[DesktopHistory] Write error:', err.message);
  }
}

/**
 * Clear all desktop history records.
 * @returns {Promise<void>}
 */
export async function clearDesktopHistory() {
  try {
    await fs.writeFile(getFilePath(), JSON.stringify([], null, 2), 'utf-8');
  } catch (err) {
    console.error('[DesktopHistory] Clear error:', err.message);
  }
}
