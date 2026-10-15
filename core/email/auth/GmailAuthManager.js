import { googleAuthManager } from "../../google/GoogleAuthManager.js";

/**
 * GmailAuthManager.js
 *
 * Gmail-specific OAuth2 authentication facade.
 *
 * All real logic now lives in core/google/GoogleAuthManager.js.
 * This class preserves the exact public API that GmailProvider and
 * gmailService.js rely on, ensuring full backward compatibility.
 *
 * Public API (unchanged):
 *   getOAuth2Client()         → google.auth.OAuth2 | null
 *   getStatus()               → Promise<{configured, linked, authUrl}>
 *   getAuthUrl()              → string  (Gmail-scoped)
 *   exchangeCodeForTokens()   → Promise<object>
 *   getAuthenticatedClient()  → Promise<google.auth.OAuth2>
 */
export class GmailAuthManager {
  constructor() {
    // Delegate all operations to the shared GoogleAuthManager singleton
    this._delegate = googleAuthManager;
  }

  /** @returns {google.auth.OAuth2|null} */
  getOAuth2Client() {
    return this._delegate.getOAuth2Client();
  }

  /**
   * Gmail link status. Backward-compatible with original signature.
   * @returns {Promise<{configured: boolean, linked: boolean, authUrl: string}>}
   */
  async getStatus() {
    return this._delegate.getGmailStatus();
  }

  /**
   * Gmail-scoped authorization URL.
   * @returns {string}
   */
  getAuthUrl() {
    return this._delegate.getGmailAuthUrl();
  }

  /**
   * Exchange an authorization code for tokens.
   * @param {string} code
   * @returns {Promise<object>}
   */
  async exchangeCodeForTokens(code, state) {
    return this._delegate.exchangeCodeForTokens(code, state, ["gmail"]);
  }

  /**
   * Get an authenticated OAuth2 client (Gmail).
   * Throws MISSING_CREDENTIALS or UNAUTHORIZED if not set up.
   * @returns {Promise<google.auth.OAuth2>}
   */
  async getAuthenticatedClient() {
    return this._delegate.getAuthenticatedClient();
  }
}

export const gmailAuthManager = new GmailAuthManager();
