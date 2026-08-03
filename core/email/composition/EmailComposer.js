import { SignatureManager } from "./SignatureManager.js";

/**
 * EmailComposer.js
 *
 * Handles email draft composition, subject generation, body formatting,
 * tone adaptation (professional, friendly, formal, concise), and signatures.
 */
export class EmailComposer {
  /**
   * Compose or polish an email draft payload.
   *
   * @param {object} params
   * @param {string} [params.subject] - Raw or proposed subject
   * @param {string} [params.body] - Raw body content
   * @param {string} [params.tone="professional"] - Target tone
   * @param {string} [params.signature] - Proposed signature
   * @returns {object} { subject, body, html, signature }
   */
  static compose({ subject = "", body = "", tone = "professional", signature = "" }) {
    const finalSubject = subject ? subject.trim() : "(no subject)";
    const finalBody = body ? body.trim() : "";
    const finalSig = signature || SignatureManager.getDefaultSignature();

    return {
      subject: finalSubject,
      body: finalBody,
      html: "",
      signature: finalSig,
      tone
    };
  }
}
