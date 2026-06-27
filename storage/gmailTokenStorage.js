import fs from "fs/promises";
import { getStoragePath } from "./storagePath.js";

const TOKEN_FILE = getStoragePath("gmail_token.json");

/**
 * Load Gmail OAuth tokens from storage.
 * Returns null if not found or invalid.
 * @returns {Promise<object|null>}
 */
export async function loadGmailToken() {
  try {
    const data = await fs.readFile(TOKEN_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Save Gmail OAuth tokens to storage.
 * @param {object} token
 */
export async function saveGmailToken(token) {
  await fs.writeFile(TOKEN_FILE, JSON.stringify(token, null, 2));
}

/**
 * Delete Gmail OAuth tokens from storage (logout/revoke).
 */
export async function deleteGmailToken() {
  try {
    await fs.unlink(TOKEN_FILE);
  } catch {
    // Ignore if file doesn't exist
  }
}
