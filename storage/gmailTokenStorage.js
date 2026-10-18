/** Backward-compatible aliases for the shared Google token store. */
import {
  loadGoogleToken,
  saveGoogleToken,
  deleteGoogleToken,
} from "../core/google/googleTokenStorage.js";

export const loadGmailToken = loadGoogleToken;
export const saveGmailToken = saveGoogleToken;
export const deleteGmailToken = deleteGoogleToken;
