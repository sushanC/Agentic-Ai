import { google } from "googleapis";
import { loadGmailToken, saveGmailToken } from "../storage/gmailTokenStorage.js";

/**
 * Helper to construct an OAuth2 client from environment variables.
 * Returns null if client credentials are not configured.
 * @returns {google.auth.OAuth2 | null}
 */
function getOAuth2Client() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const redirectUri = process.env.GMAIL_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );

  // Automatically save refreshed tokens
  oauth2Client.on("tokens", async (tokens) => {
    console.log("🔑 [GMAIL SERVICE] Refreshed tokens received and saved.");
    try {
      const existing = await loadGmailToken() || {};
      await saveGmailToken({ ...existing, ...tokens });
    } catch (err) {
      console.error("❌ [GMAIL SERVICE] Failed to save auto-refreshed tokens:", err.message);
    }
  });

  return oauth2Client;
}

/**
 * Returns configuration and link status of Gmail.
 * @returns {Promise<{configured: boolean, linked: boolean, authUrl: string}>}
 */
export async function getGmailStatus() {
  const client = getOAuth2Client();
  const configured = client !== null;
  let linked = false;
  let authUrl = "";

  if (configured) {
    const tokens = await loadGmailToken();
    linked = tokens !== null && (tokens.access_token !== undefined || tokens.refresh_token !== undefined);
    authUrl = getAuthUrl();
  }

  return { configured, linked, authUrl };
}

/**
 * Generate authorization URL for the user.
 * @returns {string}
 */
export function getAuthUrl() {
  const client = getOAuth2Client();
  if (!client) {
    return "";
  }

  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/gmail.send"],
  });
}

/**
 * Exchange the callback authorization code for OAuth tokens.
 * @param {string} code
 * @returns {Promise<object>} - Saved tokens
 */
export async function exchangeCodeForTokens(code) {
  const client = getOAuth2Client();
  if (!client) {
    throw new Error("Gmail client is not configured.");
  }

  console.log("🔑 [GMAIL SERVICE] Exchanging code for tokens...");
  const { tokens } = await client.getToken(code);
  await saveGmailToken(tokens);
  console.log("🔑 [GMAIL SERVICE] Tokens successfully exchanged and stored.");
  return tokens;
}

/**
 * Get an authenticated OAuth2 client.
 * Throws if not configured or not linked.
 * @returns {Promise<google.auth.OAuth2>}
 */
export async function getAuthenticatedClient() {
  const client = getOAuth2Client();
  if (!client) {
    const err = new Error("Gmail API credentials (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, or GMAIL_REDIRECT_URI) are missing in environment variables.");
    err.code = "MISSING_CREDENTIALS";
    throw err;
  }

  const tokens = await loadGmailToken();
  if (!tokens) {
    const err = new Error("Gmail account is not linked. Please visit /gmail/auth to authorize.");
    err.code = "UNAUTHORIZED";
    err.authUrl = getAuthUrl();
    throw err;
  }

  client.setCredentials(tokens);
  return client;
}

/**
 * Build RFC 2822 MIME message.
 * @param {object} params
 * @returns {string} - Base64url encoded MIME message
 */
export function buildMimeMessage({ to, cc, bcc, subject, body, html, signature }) {
  const parts = [];

  parts.push(`To: ${to}`);
  if (cc) parts.push(`Cc: ${cc}`);
  if (bcc) parts.push(`Bcc: ${bcc}`);
  parts.push(`Subject: ${subject}`);
  parts.push("MIME-Version: 1.0");

  let fullBody = body || "";
  let fullHtml = html || "";

  if (signature) {
    if (fullBody) fullBody += `\n\n--\n${signature}`;
    if (fullHtml) fullHtml += `<br><br>--<br>${signature.replace(/\n/g, "<br>")}`;
  }

  if (fullHtml) {
    const boundary = `====boundary_${Date.now()}====`;
    parts.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    parts.push("");
    
    parts.push(`--${boundary}`);
    parts.push("Content-Type: text/plain; charset=UTF-8");
    parts.push("Content-Transfer-Encoding: 7bit");
    parts.push("");
    parts.push(fullBody);
    
    parts.push(`--${boundary}`);
    parts.push("Content-Type: text/html; charset=UTF-8");
    parts.push("Content-Transfer-Encoding: 7bit");
    parts.push("");
    parts.push(fullHtml);
    
    parts.push(`--${boundary}--`);
  } else {
    parts.push("Content-Type: text/plain; charset=UTF-8");
    parts.push("Content-Transfer-Encoding: 7bit");
    parts.push("");
    parts.push(fullBody);
  }

  const message = parts.join("\r\n");
  
  // Base64url encode (no padding, replaces + with - and / with _)
  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Send an email through the Gmail API.
 * @param {object} params - { to, cc, bcc, subject, body, html, signature }
 * @returns {Promise<{success: boolean, messageId: string}>}
 */
export async function sendEmail({ to, cc, bcc, subject, body, html, signature }) {
  // Validate recipient
  if (!to || typeof to !== "string" || !to.includes("@")) {
    const err = new Error("Invalid recipient email address.");
    err.code = "INVALID_RECIPIENT";
    err.details = { to };
    throw err;
  }

  console.log(`📧 [GMAIL SERVICE] Attempting to send email to: ${to}...`);

  try {
    const auth = await getAuthenticatedClient();
    const gmail = google.gmail({ version: "v1", auth });
    
    const raw = buildMimeMessage({ to, cc, bcc, subject, body, html, signature });
    
    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });

    console.log(`📧 [GMAIL SERVICE] Email sent successfully. Message ID: ${res.data.id}`);
    return {
      success: true,
      messageId: res.data.id
    };

  } catch (err) {
    console.error(`❌ [GMAIL SERVICE] Email sending failed. Reason: ${err.message}`);
    
    // Construct structured error
    const formattedError = new Error(err.message);
    formattedError.code = err.code || "GMAIL_SEND_ERROR";
    formattedError.details = {
      message: err.message,
      code: err.code,
      authUrl: err.authUrl || (err.code === "UNAUTHORIZED" ? getAuthUrl() : undefined)
    };
    throw formattedError;
  }
}
