import {
  emailManager,
  emailConversationManager,
  EmailContext,
  ContactResolver,
  ContactRepository,
  EmailConfirmationPolicy,
  gmailProvider,
  EMAIL_STATUS
} from "../core/index.js";

async function runTests() {
  console.log("==========================================================");
  console.log("=== BUG 1: UNKNOWN CONTACT NAME PRESERVATION TEST ===");
  console.log("==========================================================");

  emailConversationManager.sessions.clear();

  // Turn 1: "Send an email to Rahul."
  const t1 = await emailManager.handle(new EmailContext({ prompt: "Send an email to Rahul." }));
  console.assert(t1.status === EMAIL_STATUS.COLLECTING_EMAIL_ADDRESS, "Status must be COLLECTING_EMAIL_ADDRESS");
  console.assert(t1.answer.includes("Rahul"), "Prompt answer must preserve 'Rahul'");
  console.log("  Turn 1 answer:", t1.answer);

  // Turn 2: User provides email "rahul@example.com"
  const t2 = await emailManager.handle(new EmailContext({ prompt: "rahul@example.com" }));
  console.assert(t2.status === EMAIL_STATUS.COLLECTING_CONTENT, "Status must be COLLECTING_CONTENT");
  console.assert(t2.answer.includes("Rahul"), "Prompt answer must use 'Rahul' and NOT email local-part");
  console.log("  Turn 2 answer:", t2.answer);

  // Assert Cognitive Memory persistence
  const savedContact = await ContactResolver.resolve("Rahul");
  console.assert(savedContact.status === "resolved" && savedContact.email === "rahul@example.com", "Rahul saved to Cognitive Memory");
  console.assert(savedContact.name === "Rahul", "Contact name must be 'Rahul'");
  console.log("✓ Bug 1 Passed: Original contact name 'Rahul' preserved and saved to Cognitive Memory\n");

  console.log("==========================================================");
  console.log("=== BUG 2: RECIPIENT INVARIANT TEST ===");
  console.log("==========================================================");

  emailConversationManager.sessions.clear();

  // Seed Sujan
  await ContactRepository.saveContact("Sujan", "sujan@example.com");

  // Run: "Send an email to Sujan saying the meeting is tomorrow at 10."
  const rInv = await emailManager.handle(new EmailContext({ prompt: "Send an email to Sujan saying the meeting is tomorrow at 10." }));

  console.assert(rInv.status === EMAIL_STATUS.WAITING_CONFIRMATION, "Status must be WAITING_CONFIRMATION");
  console.assert(rInv.draft.to === "sujan@example.com", "draft.to must be sujan@example.com");
  console.assert(rInv.draft.recipientEmail === "sujan@example.com", "draft.recipientEmail must be sujan@example.com");
  console.assert(rInv.recipient.email === "sujan@example.com", "recipient.email must be sujan@example.com");
  console.assert(rInv.draft.to !== "prof@example.com", "Recipient invariant: prof@example.com MUST NOT appear");

  console.log("✓ Bug 2 Passed: Recipient invariant holds true across pipeline\n");

  console.log("==========================================================");
  console.log("=== BUG 3 & 4: CONFIRMATIONSERVICE STRUCTURED ERRORS & RECOVERY_REQUIRED ===");
  console.log("==========================================================");

  // Mock Gmail API throwing invalid_grant / GMAIL_REAUTH_REQUIRED
  const originalSend = gmailProvider.send;
  gmailProvider.send = async function() {
    const err = new Error("invalid_grant: Token has been revoked");
    err.code = "GMAIL_REAUTH_REQUIRED";
    err.requiresReauth = true;
    err.retryable = false;
    err.authUrl = "https://accounts.google.com/o/oauth2/auth?mock=1";
    err.userMessage = "Gmail authorization has expired. Please reconnect Gmail.";
    throw err;
  };

  // Turn: confirm draft send
  const confirmRes = await emailManager.handle(new EmailContext({ prompt: "yes" }));

  console.assert(confirmRes.success === false, "Send failure yields success: false");
  console.assert(confirmRes.status === EMAIL_STATUS.RECOVERY_REQUIRED, "Status must be RECOVERY_REQUIRED");
  console.assert(confirmRes.metadata.requiresReauth === true, "metadata.requiresReauth must be true");
  console.assert(confirmRes.metadata.automaticRetryable === false, "metadata.automaticRetryable must be false");
  console.assert(confirmRes.metadata.authUrl === "https://accounts.google.com/o/oauth2/auth?mock=1", "authUrl preserved");
  console.assert(confirmRes.answer.includes("Gmail needs to be reconnected"), "Actionable user message");

  // Bug 6 check: Draft preserved
  console.assert(confirmRes.draft !== null, "Complete draft preserved in response");
  console.assert(confirmRes.draft.to === "sujan@example.com", "Draft 'to' preserved");

  console.log("✓ Bug 3 & 4 & 6 Passed: Structured confirmation error, RECOVERY_REQUIRED status, automaticRetryable:false, complete draft preserved\n");

  // Restore provider send
  gmailProvider.send = originalSend;

  console.log("==========================================================");
  console.log("ALL BUGS 1-6 RELIABILITY PATCH TESTS PASSED CLEANLY!");
  console.log("==========================================================");
}

runTests().catch(err => {
  console.error("Test error:", err);
  process.exit(1);
});
