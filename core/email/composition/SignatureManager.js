import { EMAIL_CONFIG } from "../EmailConfig.js";

/**
 * SignatureManager.js
 *
 * Signature template management and injection.
 */
export class SignatureManager {
  /**
   * Get default signature.
   * @returns {string}
   */
  static getDefaultSignature() {
    return process.env.GMAIL_SIGNATURE || EMAIL_CONFIG.DEFAULT_SIGNATURE || "";
  }

  /**
   * Inject signature into body text.
   * @param {string} body
   * @param {string} [signature]
   * @returns {string}
   */
  static applySignature(body, signature = SignatureManager.getDefaultSignature()) {
    if (!signature) return body;
    return `${body}\n\n--\n${signature}`;
  }
}
