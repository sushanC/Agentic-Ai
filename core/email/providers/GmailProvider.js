import { BaseEmailProvider } from "./BaseEmailProvider.js";
import { google } from "googleapis";
import { gmailAuthManager } from "../auth/GmailAuthManager.js";
import { MimeBuilder } from "../composition/MimeBuilder.js";

/**
 * GmailProvider.js
 *
 * Gmail Email Provider implementing BaseEmailProvider using Google Gmail API.
 * Normalizes OAuth authentication failures (invalid_grant) into structured recovery states.
 */
export class GmailProvider extends BaseEmailProvider {
  constructor() {
    super("gmail", "Google Gmail API");
    this.authManager = gmailAuthManager;
  }

  async send({ to, cc, bcc, subject, body, html, signature, attachments }) {
    if (!to || typeof to !== "string" || !to.includes("@")) {
      const err = new Error("Invalid recipient email address.");
      err.code = "INVALID_RECIPIENT";
      throw err;
    }

    console.log(`📧 [GMAIL PROVIDER] Sending email to: ${to}...`);

    try {
      const auth = await this.authManager.getAuthenticatedClient();
      const gmail = google.gmail({ version: "v1", auth });

      const raw = MimeBuilder.buildMimeMessage({ to, cc, bcc, subject, body, html, signature, attachments });

      const res = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw }
      });

      console.log(`📧 [GMAIL PROVIDER] Email sent successfully. Message ID: ${res.data.id}`);
      return {
        success: true,
        messageId: res.data.id
      };

    } catch (err) {
      console.error(`❌ [GMAIL PROVIDER] Email sending failed: ${err.message}`);

      const msg = err.message || String(err);
      const isReauthRequired =
        msg.includes("invalid_grant") ||
        err.code === "UNAUTHORIZED" ||
        err.code === "GMAIL_REAUTH_REQUIRED" ||
        msg.includes("Token has been expired or revoked");

      if (isReauthRequired) {
        const formattedError = new Error("Gmail authorization has expired or was revoked. Please reconnect Gmail.");
        formattedError.code = "GMAIL_REAUTH_REQUIRED";
        formattedError.requiresReauth = true;
        formattedError.retryable = false;
        formattedError.authUrl = this.authManager.getAuthUrl();
        formattedError.userMessage = "I couldn't send the email because Gmail needs to be reconnected. Your draft is still saved.";
        throw formattedError;
      }

      const formattedError = new Error(msg);
      formattedError.code = err.code || "GMAIL_SEND_ERROR";
      formattedError.authUrl = err.authUrl;
      throw formattedError;
    }
  }

  async getStatus() {
    return await this.authManager.getStatus();
  }
}

export const gmailProvider = new GmailProvider();
