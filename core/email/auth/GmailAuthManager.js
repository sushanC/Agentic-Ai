import { google } from "googleapis";
import { loadGmailToken, saveGmailToken } from "../../../storage/gmailTokenStorage.js";

/**
 * GmailAuthManager.js
 *
 * Encapsulates Gmail OAuth2 authentication management, auto token refresh,
 * status checks, authorization URL generation, and authenticated client retrieval.
 * Reuses storage/gmailTokenStorage.js for persistent token storage.
 */
export class GmailAuthManager {
  constructor() {
    this._oauth2Client = null;
  }

  /**
   * Helper to construct OAuth2 client from environment variables.
   * Returns null if client credentials are not configured.
   * @returns {google.auth.OAuth2 | null}
   */
  getOAuth2Client() {
    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;
    const redirectUri = process.env.GMAIL_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      return null;
    }

    if (!this._oauth2Client) {
      const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

      // Automatically save refreshed tokens
      client.on("tokens", async (tokens) => {
        console.log("🔑 [GMAIL AUTH MANAGER] Refreshed tokens received and saved.");
        try {
          const existing = (await loadGmailToken()) || {};
          await saveGmailToken({ ...existing, ...tokens });
        } catch (err) {
          console.error("❌ [GMAIL AUTH MANAGER] Failed to save auto-refreshed tokens:", err.message);
        }
      });

      this._oauth2Client = client;
    }

    return this._oauth2Client;
  }

  /**
   * Returns configuration and link status of Gmail.
   * @returns {Promise<{configured: boolean, linked: boolean, authUrl: string}>}
   */
  async getStatus() {
    const client = this.getOAuth2Client();
    const configured = client !== null;
    let linked = false;
    let authUrl = "";

    if (configured) {
      const tokens = await loadGmailToken();
      linked = tokens !== null && (tokens.access_token !== undefined || tokens.refresh_token !== undefined);
      authUrl = this.getAuthUrl();
    }

    return { configured, linked, authUrl };
  }

  /**
   * Generate authorization URL for the user.
   * @returns {string}
   */
  getAuthUrl() {
    const client = this.getOAuth2Client();
    if (!client) return "";

    return client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: ["https://www.googleapis.com/auth/gmail.send"],
    });
  }

  /**
   * Exchange callback authorization code for OAuth tokens.
   * @param {string} code
   * @returns {Promise<object>} - Saved tokens
   */
  async exchangeCodeForTokens(code) {
    const client = this.getOAuth2Client();
    if (!client) {
      throw new Error("Gmail client credentials are not configured in environment variables.");
    }

    console.log("🔑 [GMAIL AUTH MANAGER] Exchanging authorization code for tokens...");
    const { tokens } = await client.getToken(code);
    await saveGmailToken(tokens);
    console.log("🔑 [GMAIL AUTH MANAGER] Tokens successfully exchanged and stored.");
    return tokens;
  }

  /**
   * Get an authenticated OAuth2 client.
   * Throws structured error if not configured or not linked.
   * @returns {Promise<google.auth.OAuth2>}
   */
  async getAuthenticatedClient() {
    const client = this.getOAuth2Client();
    if (!client) {
      const err = new Error("Gmail API credentials (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URI) are missing.");
      err.code = "MISSING_CREDENTIALS";
      throw err;
    }

    const tokens = await loadGmailToken();
    if (!tokens) {
      const err = new Error("Gmail account is not linked. Please authorize your Gmail account.");
      err.code = "UNAUTHORIZED";
      err.authUrl = this.getAuthUrl();
      throw err;
    }

    client.setCredentials(tokens);
    return client;
  }
}

export const gmailAuthManager = new GmailAuthManager();
