import { createPending } from "../confirmationService.js";
import { addActivity } from "../../storage/activityStorage.js";
import { sendEmail } from "../gmailService.js";
import { askModelCie } from "../ai.js";
import { loadMemory, saveMemory } from "../../storage/memoryStorage.js";

/**
 * emailDraftTool.js
 *
 * Email Draft Tool — Phase 5 (Conversational Action Framework)
 *
 * Replaces the regex-based parseEmailInput() with LLM-powered field
 * extraction and Memory-based contact resolution. Implements the
 * WAITING_FOR_INPUT conversational pattern for missing recipient emails.
 *
 * Reuses (zero new services created):
 *   - askGroq()         — from services/ai.js
 *   - loadMemory()      — from storage/memoryStorage.js
 *   - saveMemory()      — from storage/memoryStorage.js
 *   - createPending()   — from services/confirmationService.js
 *   - sendEmail()       — from services/gmailService.js
 *   - addActivity()     — from storage/activityStorage.js
 *
 * Action dispatch table:
 *   "confirmed_draft" — send email via Gmail API (existing path, UNCHANGED)
 *   "default"         — LLM extraction → contact lookup → draft or wait
 *
 * Email Draft Statuses:
 *   WAITING_FOR_INPUT    — missing required field (recipientEmail)
 *   WAITING_CONFIRMATION — recipient known, awaiting user confirmation
 *   SENDING              — in progress
 *   SENT                 — successfully delivered
 *   FAILED               — send failed (draft preserved for retry)
 *
 * Contact Storage Schema (inside profile.json, no new file):
 *   memory.contacts = {
 *     "Professor": { email: "prof@uni.edu", savedAt: "2026-..." }
 *   }
 */

// ── Email Validation ────────────────────────────────────────────────────────
// Used ONLY for validation — never for parsing input.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(str) {
  return typeof str === "string" && EMAIL_REGEX.test(str.trim());
}

function validateEmailList(list) {
  if (!list || (Array.isArray(list) && list.length === 0)) {
    return { valid: true, errors: [] };
  }
  const arr = Array.isArray(list) ? list : [list];
  const filtered = arr.filter(Boolean);
  const invalid = filtered.filter(e => !isValidEmail(e));
  return { valid: invalid.length === 0, errors: invalid };
}

// ── Draft ID Generator ──────────────────────────────────────────────────────
function generateDraftId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 6);
  return `draft-${ts}-${rand}`;
}

// ── Contact Lookup ──────────────────────────────────────────────────────────
/**
 * Search memory.contacts for a matching contact by name.
 * Case-insensitive substring matching handles variations like
 * "professor", "Professor Smith", etc.
 *
 * @param {string} name - Recipient name from LLM extraction
 * @returns {Promise<string|null>} - Email address or null if not found
 */
async function lookupContact(name) {
  if (!name) return null;

  const memory = await loadMemory();
  const contacts = memory.contacts || {};
  const normalized = name.toLowerCase().trim();

  for (const [key, value] of Object.entries(contacts)) {
    const keyNorm = key.toLowerCase().trim();
    if (
      keyNorm === normalized ||
      keyNorm.includes(normalized) ||
      normalized.includes(keyNorm)
    ) {
      if (value && value.email && isValidEmail(value.email)) {
        return value.email;
      }
    }
  }

  return null;
}

// ── Contact Storage ─────────────────────────────────────────────────────────
/**
 * Persist a new contact into memory.contacts.
 * Reuses loadMemory/saveMemory — no new storage file created.
 *
 * @param {string} name  - Contact display name (e.g. "Professor")
 * @param {string} email - Validated email address
 */
async function saveContact(name, email) {
  const memory = await loadMemory();
  if (!memory.contacts) memory.contacts = {};
  memory.contacts[name] = {
    email: email.trim(),
    savedAt: new Date().toISOString()
  };
  await saveMemory(memory);
  console.log(`\n📧 Contact Saved: "${name}" → ${email}`);
}

// ── LLM Email Extraction ────────────────────────────────────────────────────
/**
 * Use the existing Groq LLM pipeline (askGroq) to extract structured
 * email fields from the user's natural language request.
 *
 * Rules enforced in the prompt:
 *   - Never invent or guess email addresses
 *   - recipientEmail must be "" if not explicitly provided
 *   - Generates a complete, professional email body from context
 *   - Returns ONLY JSON — no markdown, no explanations
 *
 * @param {string} userInput - Raw natural language email request
 * @returns {Promise<object>} - Extracted fields object
 */
async function extractEmailFields(userInput) {
  const raw = await askModelCie("groq", userInput, "EmailExtraction");

  const cleaned = raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  return JSON.parse(cleaned);
}

// ── Main Tool Class ─────────────────────────────────────────────────────────

export class EmailDraftTool {

  /**
   * Flag used by actionExecutor.js to detect this is a confirmation-gated tool.
   */
  requiresConfirmation = true;

  /**
   * Main execute method — conforms to the ToolRegistry interface.
   *
   * @param {object} action - { tool, action, input }
   * @returns {Promise<object|string>}
   */
  async execute(action) {

    // ── confirmed_draft ─────────────────────────────────────────────────────
    // Triggered by POST /confirm (user clicked [Confirm] on ConfirmationCard).
    // Interface UNCHANGED from previous version — the confirmationService and
    // frontend call this path identically. Only adds full validation.
    if (action.action === "confirmed_draft") {
      const { to, cc, bcc, subject, body, html, signature } = action.input || {};

      console.log("\n📧 Sending Gmail...");
      console.log(`   To: ${to}`);
      console.log(`   Subject: ${subject}`);

      // Full validation before any Gmail API call — never call Gmail with bad data
      if (!isValidEmail(to)) {
        console.error(`\n📧 Validation Failed — invalid recipient: "${to}"`);
        return `❌ Cannot send email: "${to}" is not a valid email address. Please try again.`;
      }

      const ccArr = Array.isArray(cc) ? cc.filter(Boolean) : (cc ? [cc] : []);
      const bccArr = Array.isArray(bcc) ? bcc.filter(Boolean) : (bcc ? [bcc] : []);

      const ccCheck = validateEmailList(ccArr);
      if (!ccCheck.valid) {
        console.error(`\n📧 Validation Failed — invalid CC: ${ccCheck.errors.join(", ")}`);
        return `❌ Cannot send email: invalid CC address(es): ${ccCheck.errors.join(", ")}`;
      }

      const bccCheck = validateEmailList(bccArr);
      if (!bccCheck.valid) {
        console.error(`\n📧 Validation Failed — invalid BCC: ${bccCheck.errors.join(", ")}`);
        return `❌ Cannot send email: invalid BCC address(es): ${bccCheck.errors.join(", ")}`;
      }

      console.log("\n📧 Validation Passed");

      try {
        const result = await sendEmail({
          to,
          cc: ccArr.join(", ") || undefined,
          bcc: bccArr.join(", ") || undefined,
          subject,
          body,
          html: html || undefined,
          signature: signature || undefined
        });

        addActivity(`Email sent to: ${to}`);
        console.log("\n📧 Gmail Success");

        return `✅ Email sent successfully to **${to}**!\n\n**Subject:** ${subject}\n**Message ID:** ${result.messageId}`;

      } catch (err) {
        console.error("\n📧 Gmail Failed — Draft Preserved");
        console.error(`   ${err.message}`);

        // Never discard the draft on failure — surface a retryable message
        const authHint = err.details?.authUrl
          ? `\n\n🔗 [Re-authorize Gmail](${err.details.authUrl})`
          : "";

        return `❌ Failed to send email: ${err.message}\n\nYour draft is preserved. Click **Confirm** again to retry.${authHint}`;
      }
    }

    // ── default — Conversational Draft Flow ────────────────────────────────
    // Replaces the old parseEmailInput() regex path entirely.
    const rawInput = typeof action.input === "string"
      ? action.input
      : action.input?.text || action.input?.content || String(action.input || "");

    console.log("\n📧 Draft Created");
    console.log(`   Input: "${rawInput}"`);

    // ── Step 1: LLM Extraction ─────────────────────────────────────────────
    let extracted;
    try {
      extracted = await extractEmailFields(rawInput);
      console.log("\n📧 LLM Extraction:");
      console.log(JSON.stringify(extracted, null, 2));
    } catch (err) {
      console.error(`\n📧 LLM Extraction Failed: ${err.message}`);
      return [
        `❌ Could not parse your email request: ${err.message}.`,
        "",
        "Please try again with more detail, for example:",
        `_"Send an email to john@example.com about the project deadline"_`
      ].join("\n");
    }

    const {
      recipientName = "",
      subject = "(no subject)",
      body = "",
      cc = [],
      bcc = [],
      signature = process.env.GMAIL_SIGNATURE || ""
    } = extracted;

    let recipientEmail = extracted.recipientEmail || "";

    // ── Step 2: Memory Contact Lookup ──────────────────────────────────────
    // Before asking the user, check if we already know this contact.
    if (!isValidEmail(recipientEmail) && recipientName) {
      console.log(`\n📧 Searching Contacts for: "${recipientName}"`);
      const found = await lookupContact(recipientName);

      if (found) {
        recipientEmail = found;
        console.log(`\n📧 Contact Found: "${recipientName}" → ${recipientEmail}`);
      } else {
        console.log(`\n📧 Contact Missing: "${recipientName}" not in memory`);
      }
    }

    // ── Step 3: Build Full Draft Object ───────────────────────────────────
    const now = new Date().toISOString();
    const hasValidEmail = isValidEmail(recipientEmail);

    const draft = {
      id: generateDraftId(),
      recipientName,
      recipientEmail,
      cc: Array.isArray(cc) ? cc.filter(e => typeof e === "string" && e.trim()) : [],
      bcc: Array.isArray(bcc) ? bcc.filter(e => typeof e === "string" && e.trim()) : [],
      subject,
      body,
      html: "",
      signature,
      attachments: [],
      status: hasValidEmail ? "WAITING_CONFIRMATION" : "WAITING_FOR_INPUT",
      missingField: hasValidEmail ? null : "recipientEmail",
      createdAt: now,
      updatedAt: now
    };

    // ── Step 4a: Recipient Known — Go Straight to Confirmation ─────────────
    if (hasValidEmail) {
      console.log("\n📧 Validation Passed — Preparing confirmation preview...");

      const payload = {
        tool: "email_draft",
        action: "confirmed_draft",
        input: {
          to: recipientEmail,
          cc: draft.cc,
          bcc: draft.bcc,
          subject: draft.subject,
          body: draft.body,
          html: draft.html,
          signature: draft.signature
        }
      };

      const preview = {
        to: recipientEmail,
        cc: draft.cc.join(", "),
        bcc: draft.bcc.join(", "),
        subject: draft.subject,
        body: draft.body,
        signature: draft.signature
      };

      addActivity(`Email draft prepared: ${draft.subject}`);

      return await createPending({
        tool: "email_draft",
        action: "draft",
        payload,
        preview,
        title: "Send Email",
        message: "Review and confirm this email before sending.",
        ttlMinutes: 30
      });
    }

    // ── Step 4b: Recipient Unknown — Enter WAITING_FOR_INPUT ───────────────
    console.log("\n📧 Waiting For User Input...");
    console.log(`   Missing field: recipientEmail`);
    console.log(`   Recipient name: "${recipientName}"`);

    const question = recipientName
      ? `What is ${recipientName}'s email address?`
      : "Who should I send this email to? Please provide their email address.";

    // Store the full draft in the pending payload — nothing is lost.
    // POST /email/provide-input will load this, fill in the email address,
    // and create a new confirmed_draft pending record without restarting the planner.
    const waitingPayload = {
      tool: "email_draft",
      action: "resume_draft",
      draft
    };

    const waitingPreview = {
      to: "",
      recipientName: draft.recipientName,
      subject: draft.subject,
      body: draft.body,
      status: "WAITING_FOR_INPUT"
    };

    addActivity(`Email draft waiting for recipient: ${draft.subject}`);

    const pendingRecord = await createPending({
      tool: "email_draft",
      action: "draft",
      payload: waitingPayload,
      preview: waitingPreview,
      title: "Email Draft — Waiting for Recipient",
      message: question,
      ttlMinutes: 30
    });

    // Return waiting_input object — intercepted by actionExecutor and toolRouter,
    // surfaced to the frontend as __WAITING_INPUT__:<json> via server.js.
    return {
      success: true,
      status: "waiting_input",
      confirmationId: pendingRecord.confirmationId,
      tool: "email_draft",
      missingField: "recipientEmail",
      question,
      recipientName,
      draft: {
        subject: draft.subject,
        body: draft.body
      },
      expiresAt: pendingRecord.expiresAt
    };
  }
}
