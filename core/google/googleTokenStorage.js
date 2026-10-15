import fs from "fs/promises";
import { getStoragePath } from "../../storage/storagePath.js";
import { readJsonFile, withJsonFileLock, writeJsonFile } from "../../storage/jsonFile.js";

/**
 * googleTokenStorage.js
 *
 * Unified Google OAuth2 token storage for samGPT.
 *
 * Storage strategy:
 *   - Uses the SAME file as gmail_token.json (backward compatible).
 *   - Gmail and Calendar share the same Google OAuth client credentials
 *     and the same Google account, so a single token file is correct.
 *   - When Calendar scopes are added via re-authorization, the new token
 *     (which includes both Gmail and Calendar scopes) is saved here.
 *   - Existing gmail_token.json files are loaded transparently — no migration needed.
 *
 * Security:
 *   - Tokens are NEVER logged.
 *   - Tokens are NEVER returned to the frontend.
 *   - Token file stays inside ~/.personal-agent/ (outside the project repo).
 */

const TOKEN_FILE = getStoragePath("gmail_token.json");

/**
 * Load Google OAuth tokens from storage.
 * Returns null if not found. Corrupt JSON is surfaced as JSON_STORAGE_CORRUPT.
 *
 * @returns {Promise<object|null>}
 */
export async function loadGoogleToken() {
  return readJsonFile(TOKEN_FILE, null);
}

/**
 * Save Google OAuth tokens to storage.
 * Merges with existing tokens to preserve the refresh_token.
 *
 * IMPORTANT: Never call this with partial tokens if you risk losing the refresh_token.
 * This function always merges: existing_tokens + new_tokens so refresh_token is preserved.
 *
 * @param {object} tokens - Partial or full token object from OAuth2 client
 */
export async function saveGoogleToken(tokens) {
  return withJsonFileLock(TOKEN_FILE, async () => {
    const existing = await loadGoogleToken() || {};
    // Merge partial refresh responses without dropping the stored refresh token.
    const merged = { ...existing, ...tokens };
    if (existing.refresh_token && !merged.refresh_token) merged.refresh_token = existing.refresh_token;
    await writeJsonFile(TOKEN_FILE, merged, { mode: 0o600 });
    return merged;
  });
}

/**
 * Delete Google OAuth tokens (logout / revoke).
 */
export async function deleteGoogleToken() {
  return withJsonFileLock(TOKEN_FILE, async () => {
    try {
      await fs.unlink(TOKEN_FILE);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  });
}

// ─── Backward compatibility aliases for existing code that imports from gmailTokenStorage ─────
// These are NOT exported from this file — callers should migrate to these functions.
// gmailTokenStorage.js itself is kept for backward compatibility.
export const loadGmailToken  = loadGoogleToken;
export const saveGmailToken  = saveGoogleToken;
export const deleteGmailToken = deleteGoogleToken;
