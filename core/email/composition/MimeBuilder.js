/**
 * MimeBuilder.js
 *
 * Constructs RFC 2822 MIME messages for email transmission.
 * Supports To, Cc, Bcc, Subject headers, plain text, HTML body, signatures,
 * and base64url encoding.
 */
export class MimeBuilder {
  /**
   * Build base64url-encoded RFC 2822 MIME message.
   *
   * @param {object} params
   * @param {string} params.to - Recipient email address
   * @param {string} [params.cc] - CC email addresses
   * @param {string} [params.bcc] - BCC email addresses
   * @param {string} params.subject - Email subject line
   * @param {string} [params.body=""] - Plain text body
   * @param {string} [params.html=""] - HTML body
   * @param {string} [params.signature=""] - Signature text
   * @param {Array} [params.attachments=[]] - Attachment metadata
   * @returns {string} Base64url encoded MIME message
   */
  static buildMimeMessage({ to, cc, bcc, subject, body = "", html = "", signature = "", attachments = [] }) {
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

    // Base64url encode (no padding, replace + with - and / with _)
    return Buffer.from(message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }
}
