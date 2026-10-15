import { google } from "googleapis";
import { randomBytes } from "crypto";
import { loadGoogleToken, saveGoogleToken } from "./googleTokenStorage.js";
import { GOOGLE_SCOPES, hasRequiredScopes } from "./GoogleScopes.js";

/**
 * GoogleAuthManager.js
 *
 * Generic Google OAuth2 authentication manager for samGPT.
 *
 * This is the single source of truth for Google OAuth2 client construction,
 * token storage, and authenticated client retrieval.
 *
 * Architecture:
 *   GoogleAuthManager (generic, scope-configurable)
 *         |
 *         +──── GmailAuthManager (thin wrapper, gmail scopes)
 *         |
 *         +──── GoogleCalendarProvider (uses this directly for calendar scopes)
 *
 * The same GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REDIRECT_URI env vars
 * are reused — these are Google OAuth app credentials, not Gmail-specific.
 *
 * Security:
 *   - Tokens are NEVER logged.
 *   - No credentials are exposed to the frontend or logs.
 */
export class GoogleAuthManager {
  constructor({ now = () => Date.now(), stateTtlMs = 10 * 60 * 1000 } = {}) {
    /** @type {google.auth.OAuth2|null} */
    this._oauth2Client = null;
    this._pendingOAuthStates = new Map();
    this._oauthStateTtlMs = stateTtlMs;
    this._now = now;
  }

  // ─── OAuth Client ─────────────────────────────────────────────────────────

  /**
   * Build an OAuth2 client using GMAIL_* env vars (which are Google app credentials).
   * Returns null if credentials are not configured.
   *
   * @returns {google.auth.OAuth2|null}
   */
  getOAuth2Client() {
    const clientId     = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;
    const redirectUri  = process.env.GMAIL_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) return null;

    if (!this._oauth2Client) {
      const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

      // Automatically persist refreshed tokens without losing refresh_token
      client.on("tokens", async (tokens) => {
        try {
          await saveGoogleToken(tokens);
        } catch (err) {
          console.error("[GoogleAuthManager] Failed to persist refreshed tokens", { code: err.code || "TOKEN_STORAGE_ERROR" });
        }
      });

      this._oauth2Client = client;
    }

    return this._oauth2Client;
  }

  // ─── Authorization URL Builders ───────────────────────────────────────────

  /**
   * Generate an authorization URL for the given scopes.
   *
   * @param {string[]} scopes - OAuth2 scopes to request
   * @param {string} [purpose] - OAuth flow purpose (gmail, calendar, combined)
   * @returns {string} Authorization URL, or "" if client not configured
   */
  getAuthUrl(scopes, purpose = "generic") {
    const client = this.getOAuth2Client();
    if (!client) return "";

    const now = this._now();
    for (const [state, entry] of this._pendingOAuthStates) {
      if (entry.expiresAt <= now) this._pendingOAuthStates.delete(state);
    }
    const state = randomBytes(32).toString("base64url");
    this._pendingOAuthStates.set(state, { purpose, expiresAt: now + this._oauthStateTtlMs });

    const params = {
      access_type: "offline",
      prompt:      "consent",
      scope:       scopes,
      state,
    };

    return client.generateAuthUrl(params);
  }

  /** Validate and consume a one-use OAuth state value. */
  consumeOAuthState(state, allowedPurposes = []) {
    if (typeof state !== "string" || state.length < 32 || state.length > 256) return false;
    const entry = this._pendingOAuthStates.get(state);
    if (!entry || entry.expiresAt <= this._now()) {
      this._pendingOAuthStates.delete(state);
      return false;
    }
    const allowed = Array.isArray(allowedPurposes) ? allowedPurposes : [allowedPurposes];
    if (allowed.length && !allowed.includes(entry.purpose)) return false;
    this._pendingOAuthStates.delete(state);
    return true;
  }

  /**
   * Generate Gmail-only authorization URL.
   * Backward-compatible with GmailAuthManager.getAuthUrl().
   *
   * @returns {string}
   */
  getGmailAuthUrl() {
    return this.getAuthUrl(GOOGLE_SCOPES.gmail, "gmail");
  }

  /**
   * Generate Calendar-only authorization URL.
   *
   * @returns {string}
   */
  getCalendarAuthUrl() {
    return this.getAuthUrl(GOOGLE_SCOPES.calendar, "calendar");
  }

  /**
   * Generate combined Gmail + Calendar authorization URL.
   *
   * @returns {string}
   */
  getCombinedAuthUrl() {
    return this.getAuthUrl(GOOGLE_SCOPES.combined, "combined");
  }

  // ─── Token Exchange ───────────────────────────────────────────────────────

  /**
   * Exchange an authorization code for OAuth2 tokens and persist them.
   *
   * @param {string} code - Authorization code from OAuth callback
   * @returns {Promise<object>} Stored tokens
   */
  async exchangeCodeForTokens(code, state, allowedPurposes = []) {
    if (!this.consumeOAuthState(state, allowedPurposes)) {
      const err = new Error("OAuth state is missing, invalid, expired, or already used.");
      err.code = "INVALID_OAUTH_STATE";
      throw err;
    }
    const client = this.getOAuth2Client();
    if (!client) {
      throw new Error("Google OAuth2 credentials are not configured in environment variables.");
    }

    const { tokens } = await client.getToken(code);
    await saveGoogleToken(tokens);
    return tokens;
  }

  // ─── Authenticated Client ─────────────────────────────────────────────────

  /**
   * Return an authenticated OAuth2 client loaded with stored tokens.
   *
   * Throws a structured error if:
   *   - Credentials are not configured (MISSING_CREDENTIALS)
   *   - Tokens are not stored (UNAUTHORIZED)
   *
   * @returns {Promise<google.auth.OAuth2>}
   */
  async getAuthenticatedClient() {
    const client = this.getOAuth2Client();
    if (!client) {
      const err = new Error(
        "Google OAuth2 credentials (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URI) are missing."
      );
      err.code = "MISSING_CREDENTIALS";
      throw err;
    }

    const tokens = await loadGoogleToken();
    if (!tokens || (!tokens.access_token && !tokens.refresh_token)) {
      const err = new Error("Google account is not linked. Please authorize samGPT with your Google account.");
      err.code = "UNAUTHORIZED";
      err.authUrl = this.getCombinedAuthUrl();
      throw err;
    }

    client.setCredentials(tokens);
    return client;
  }

  /**
   * Return an authenticated client only if the stored token contains
   * the required Calendar scopes. Returns a structured recovery object
   * instead of throwing if Calendar scope is missing.
   *
   * @returns {Promise<{client: google.auth.OAuth2}|{requiresAuthorization: true, authUrl: string}>}
   */
  async getCalendarAuthenticatedClient() {
    const tokens = await loadGoogleToken();

    // If no tokens at all
    if (!tokens || (!tokens.access_token && !tokens.refresh_token)) {
      return {
        requiresAuthorization: true,
        authUrl: this.getCombinedAuthUrl(),
        reason: "NOT_LINKED"
      };
    }

    // If tokens exist but may lack Calendar scope — check the scope field
    const scopeStr = tokens.scope || "";
    const hasCalendarScope = hasRequiredScopes(scopeStr, GOOGLE_SCOPES.calendar);

    if (!hasCalendarScope) {
      // Token exists (Gmail is linked) but Calendar scope is missing
      return {
        requiresAuthorization: true,
        authUrl: this.getCombinedAuthUrl(),
        reason: "MISSING_CALENDAR_SCOPE"
      };
    }

    const client = await this.getAuthenticatedClient();
    return { client };
  }

  // ─── Status ───────────────────────────────────────────────────────────────

  /**
   * Returns Gmail authorization status.
   * Backward-compatible with GmailAuthManager.getStatus().
   *
   * @returns {Promise<{configured: boolean, linked: boolean, authUrl: string}>}
   */
  async getGmailStatus() {
    const client = this.getOAuth2Client();
    const configured = client !== null;
    let linked = false;
    let authUrl = "";

    if (configured) {
      const tokens = await loadGoogleToken();
      linked = tokens !== null && (tokens.access_token !== undefined || tokens.refresh_token !== undefined);
      authUrl = this.getGmailAuthUrl();
    }

    return { configured, linked, authUrl };
  }

  /**
   * Returns Calendar authorization status.
   *
   * @returns {Promise<{configured: boolean, linked: boolean, hasCalendarScope: boolean, authUrl: string}>}
   */
  async getCalendarStatus() {
    const client = this.getOAuth2Client();
    const configured = client !== null;
    let linked = false;
    let hasCalendarScope = false;
    const authUrl = this.getCombinedAuthUrl();

    if (configured) {
      const tokens = await loadGoogleToken();
      linked = tokens !== null && (tokens.access_token !== undefined || tokens.refresh_token !== undefined);
      if (linked) {
        hasCalendarScope = hasRequiredScopes(tokens.scope || "", GOOGLE_SCOPES.calendar);
      }
    }

    return { configured, linked, hasCalendarScope, authUrl };
  }
}

export const googleAuthManager = new GoogleAuthManager();
