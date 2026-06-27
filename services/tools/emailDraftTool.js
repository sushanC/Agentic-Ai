import { createPending } from "../confirmationService.js";
import { addActivity } from "../../storage/activityStorage.js";
import { sendEmail } from "../gmailService.js";

/**
 * emailDraftTool.js
 *
 * Email Draft Tool — Phase 4 (Gmail API Send Integration)
 *
 * This tool parses the user's email request, creates a pending action for 
 * confirmation, and triggers the actual Gmail send API once confirmed.
 *
 * Usage in planner:
 *   { "tool": "email_draft", "input": "Send email to X about Y" }
 */

export class EmailDraftTool {

  /**
   * Flag used by actionExecutor.js to detect this is a confirmation-gated tool.
   */
  requiresConfirmation = true;

  /**
   * Main execute method — conforms to the ToolRegistry interface.
   *
   * @param {object} action - { tool, action, input }
   * @returns {Promise<object|string>} - A pending_confirmation object or a success string
   */
  async execute(action) {

    // ── Confirmed email sending (Phase 4) ──────────────────────────────────
    if (action.action === "confirmed_draft") {
      const { to, cc, bcc, subject, body, signature } = action.input || {};

      console.log("\n📧 [EMAIL DRAFT TOOL] Confirmed draft action received.");
      console.log({ to, cc, bcc, subject, signature });

      // Execute sending via Google Gmail API
      const result = await sendEmail({ to, cc, bcc, subject, body, signature });

      addActivity(`Email sent to: ${to}`);

      return `✅ Email sent successfully to ${to}!\nSubject: ${subject}\nMessage ID: ${result.messageId}`;
    }
    // ────────────────────────────────────────────────────────────────────────

    const rawInput = typeof action.input === "string"
      ? action.input
      : action.input?.text || action.input?.content || "";

    console.log("\n📧 [EMAIL DRAFT TOOL] Parsing input:");
    console.log(rawInput);

    // Parse the natural language input into structured email fields
    const parsed = parseEmailInput(rawInput);

    console.log("\n📧 [EMAIL DRAFT TOOL] Parsed fields:");
    console.log(parsed);

    // Build the payload that will be re-executed after confirmation
    const payload = {
      tool: "email_draft",
      action: "confirmed_draft",
      input: {
        to: parsed.to,
        cc: parsed.cc,
        bcc: parsed.bcc,
        subject: parsed.subject,
        body: parsed.body,
        signature: parsed.signature,
        originalInput: rawInput
      }
    };

    // The preview is what the frontend displays to the user
    const preview = {
      to: parsed.to,
      cc: parsed.cc,
      bcc: parsed.bcc,
      subject: parsed.subject,
      body: parsed.body,
      signature: parsed.signature
    };

    addActivity(`Email draft prepared: ${parsed.subject}`);
    console.log("[EMAIL DRAFT TOOL] Draft created for confirmation:", parsed.subject);

    // Delegate to confirmationService — no email-specific logic beyond this
    return await createPending({
      tool: "email_draft",
      action: "draft",
      payload,
      preview,
      title: "Send Email",
      message: `Review and confirm this email before sending.`,
      ttlMinutes: 30
    });
  }
}

/**
 * parseEmailInput — Extract email fields from natural language.
 *
 * Supports multiple common phrasings:
 *   "Send an email to john@example.com about the meeting"
 *   "Draft email to john@example.com, subject: Meeting, body: Let's meet at 3pm"
 *   "Email alice@corp.com cc boss@corp.com subject Follow-up body Just checking in"
 *
 * Falls back gracefully — never crashes, always returns an object.
 *
 * @param {string} input
 * @returns {{ to: string, cc: string, bcc: string, subject: string, body: string, signature: string }}
 */
function parseEmailInput(input) {
  const text = input.trim();

  let to = "";
  let cc = "";
  let bcc = "";
  let subject = "";
  let body = "";
  let signature = "";

  // ── Extract "to" email address ──────────────────────────────────────
  const emailPattern = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i;
  const emailMatch = text.match(emailPattern);

  if (emailMatch) {
    to = emailMatch[0];
  } else {
    // Fallback: look for "to <name>" pattern
    const toMatch = text.match(/(?:to|email)\s+([^\s,]+)/i);
    if (toMatch) {
      to = toMatch[1];
    }
  }

  // ── Extract CC ──────────────────────────────────────────────────────
  const ccMatch = text.match(/cc[:\s]+([\w.+-]+@[\w.-]+\.[a-z]{2,}(?:\s*,\s*[\w.+-]+@[\w.-]+\.[a-z]{2,})*)/i);
  if (ccMatch) {
    cc = ccMatch[1].trim();
  }

  // ── Extract BCC ─────────────────────────────────────────────────────
  const bccMatch = text.match(/bcc[:\s]+([\w.+-]+@[\w.-]+\.[a-z]{2,}(?:\s*,\s*[\w.+-]+@[\w.-]+\.[a-z]{2,})*)/i);
  if (bccMatch) {
    bcc = bccMatch[1].trim();
  }

  // ── Extract Signature ───────────────────────────────────────────────
  const signatureMatch = text.match(/signature[:\s]+([\s\S]+?)(?:\s+body[:\s]|\s+subject[:\s]|\s+cc[:\s]|\s+bcc[:\s]|$)/i);
  if (signatureMatch) {
    signature = signatureMatch[1].trim();
  } else if (process.env.GMAIL_SIGNATURE) {
    signature = process.env.GMAIL_SIGNATURE;
  }

  // ── Extract subject ─────────────────────────────────────────────────
  const subjectExplicit = text.match(
    /subject[:\s]+([^,\n]+?)(?:\s+body[:\s]|\s+cc[:\s]|\s+bcc[:\s]|\s+signature[:\s]|,|$)/i
  );

  if (subjectExplicit) {
    subject = subjectExplicit[1].trim();
  } else {
    // Infer subject from "about <topic>" phrasing
    const aboutMatch = text.match(
      /(?:about|regarding|re:?)\s+(.+?)(?:\s+body[:\s]|\s+cc[:\s]|\s+bcc[:\s]|\s+signature[:\s]|,|$)/i
    );
    if (aboutMatch) {
      subject = aboutMatch[1].trim();
    } else {
      // Last fallback: use the first ~60 chars of the input as subject
      subject = text.slice(0, 60).replace(/^(send|draft|write|email|an?)\s+/i, "").trim();
    }
  }

  // ── Extract body ────────────────────────────────────────────────────
  const bodyExplicit = text.match(/body[:\s]+([\s\S]+?)(?:\s+signature[:\s]|$)/i);

  if (bodyExplicit) {
    body = bodyExplicit[1].trim();
  } else {
    // Construct a minimal body by stripping metadata
    body = text
      .replace(emailPattern, "")
      .replace(/(?:send|draft|write)\s+(an?\s+)?email/i, "")
      .replace(/subject[:\s]+[^,\n]+/i, "")
      .replace(/to\s+[\w.+-]+/i, "")
      .replace(/cc[:\s]+[\w.+-]+@[\w.-]+\.[a-z]{2,}/i, "")
      .replace(/bcc[:\s]+[\w.+-]+@[\w.-]+\.[a-z]{2,}/i, "")
      .replace(/signature[:\s]+[\s\S]+/i, "")
      .trim();

    if (!body) {
      body = "(No message body provided — edit before sending)";
    }
  }

  // ── Sanitize ────────────────────────────────────────────────────────
  if (!to) {
    to = "(recipient not detected — please specify)";
  }
  if (!subject) {
    subject = "(no subject)";
  }

  return { to, cc, bcc, subject, body, signature };
}
