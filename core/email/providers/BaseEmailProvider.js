/**
 * BaseEmailProvider.js
 *
 * Abstract Base Class for Email Providers (Gmail, Outlook, SMTP, etc.).
 */
export class BaseEmailProvider {
  /**
   * @param {string} name - Provider identifier ("gmail", "outlook", "smtp")
   * @param {string} displayName - Human readable name
   */
  constructor(name, displayName) {
    this.name = name;
    this.displayName = displayName;
  }

  /**
   * Send an email payload.
   *
   * @param {object} params - { to, cc, bcc, subject, body, html, signature, attachments }
   * @returns {Promise<{success: boolean, messageId: string}>}
   */
  async send(params) {
    throw new Error(`BaseEmailProvider.send() not implemented on provider "${this.name}".`);
  }

  /**
   * Extension point for reply.
   */
  async reply(params) {
    return this.send(params);
  }

  /**
   * Extension point for forward.
   */
  async forward(params) {
    return this.send(params);
  }

  /**
   * Get provider authentication status.
   * @returns {Promise<{configured: boolean, linked: boolean, authUrl?: string}>}
   */
  async getStatus() {
    return { configured: true, linked: true };
  }
}
