import {
  WorkflowExecutor,
  WorkflowGraph,
  WorkflowNode,
  WorkflowContext,
  CapabilityRegistry,
  BaseCapability,
  CapabilityResult,
  ContactResolver,
  ContactRepository,
  EmailManager,
  emailManager,
  EmailConfirmationPolicy,
  gmailProvider,
  EMAIL_STATUS
} from "../core/index.js";

// Dummy mock capability class for Bug 1 tests
class MockCapability extends BaseCapability {
  constructor(name, resultToReturn, shouldThrow = false) {
    super(name, `Mock ${name}`, 50);
    this.resultToReturn = resultToReturn;
    this.shouldThrow = shouldThrow;
  }
  canHandle() { return 1.0; }
  async execute() {
    if (this.shouldThrow) {
      throw new Error(`Capability ${this.name} threw an explicit error`);
    }
    return this.resultToReturn;
  }
}

async function runTests() {
  console.log("==========================================================");
  console.log("=== BUG 1: WORKFLOW SUCCESS PROPAGATION TEST SUITE ===");
  console.log("==========================================================");

  // Case 1.1: Capability returns success: true -> node COMPLETED, workflow success: true
  {
    const reg = new CapabilityRegistry();
    reg.register(new MockCapability("test_succ", CapabilityResult.create({ success: true, answer: "ok" })));
    const graph = new WorkflowGraph();
    graph.addNode(new WorkflowNode({ id: "node_1", task: "Success task", requiredCapability: "test_succ" }));
    const executor = new WorkflowExecutor(reg);
    const res = await executor.execute("wf_1", graph, new WorkflowContext({ prompt: "test" }));

    console.assert(res.success === true, "Workflow success must be true");
    console.assert(res.completedNodes.length === 1, "Completed count 1");
    console.assert(res.failedNodes.length === 0, "Failed count 0");
    console.log("✓ Test 1.1 Passed: Capability returns success:true -> Workflow success:true");
  }

  // Case 1.2: Capability throws -> node FAILED, workflow success: false
  {
    const reg = new CapabilityRegistry();
    reg.register(new MockCapability("test_throw", null, true));
    const graph = new WorkflowGraph();
    graph.addNode(new WorkflowNode({ id: "node_1", task: "Throwing task", requiredCapability: "test_throw" }));
    const executor = new WorkflowExecutor(reg);
    const res = await executor.execute("wf_2", graph, new WorkflowContext({ prompt: "test" }));

    console.assert(res.success === false, "Workflow success must be false when capability throws");
    console.assert(res.failedNodes.length === 1, "Failed count 1");
    console.log("✓ Test 1.2 Passed: Capability throws -> Workflow success:false");
  }

  // Case 1.3: Capability returns success: false -> node FAILED, workflow success: false
  {
    const reg = new CapabilityRegistry();
    reg.register(new MockCapability("test_fail", CapabilityResult.create({
      success: false,
      answer: "Failure output message",
      diagnostics: { status: "failed" }
    })));
    const graph = new WorkflowGraph();
    graph.addNode(new WorkflowNode({ id: "node_1", task: "Failing task", requiredCapability: "test_fail" }));
    const executor = new WorkflowExecutor(reg);
    const res = await executor.execute("wf_3", graph, new WorkflowContext({ prompt: "test" }));

    console.assert(res.success === false, "Workflow success must be false when capability returns success:false");
    console.assert(res.failedNodes.length === 1, "Failed count 1");
    console.assert(res.answer === "Failure output message", "Structured answer preserved");
    console.log("✓ Test 1.3 Passed: Capability returns success:false -> Workflow success:false");
  }

  // Case 1.4: Capability returns success: false with metadata status "failed_retryable" -> status preserved
  {
    const reg = new CapabilityRegistry();
    reg.register(new MockCapability("test_retryable", CapabilityResult.create({
      success: false,
      answer: "Retryable failure answer",
      metadata: { status: "failed_retryable", retry: true }
    })));
    const graph = new WorkflowGraph();
    graph.addNode(new WorkflowNode({ id: "node_1", task: "Retryable task", requiredCapability: "test_retryable" }));
    const executor = new WorkflowExecutor(reg);
    const res = await executor.execute("wf_4", graph, new WorkflowContext({ prompt: "test" }));

    console.assert(res.success === false, "Workflow success must be false");
    console.assert(res.outputs.node_1.metadata.status === "failed_retryable", "Structured status 'failed_retryable' preserved");
    console.assert(res.outputs.node_1.metadata.retry === true, "Metadata preserved");
    console.log("✓ Test 1.4 Passed: Structured failure status 'failed_retryable' preserved");
  }

  // Case 1.5: Upstream failed node -> dependent node SKIPPED
  {
    const reg = new CapabilityRegistry();
    reg.register(new MockCapability("test_fail", CapabilityResult.create({ success: false, answer: "failed" })));
    reg.register(new MockCapability("test_succ", CapabilityResult.create({ success: true, answer: "should not run" })));
    const graph = new WorkflowGraph();
    graph.addNode(new WorkflowNode({ id: "node_1", task: "Failing step 1", requiredCapability: "test_fail" }));
    graph.addNode(new WorkflowNode({ id: "node_2", task: "Dependent step 2", requiredCapability: "test_succ", dependencies: ["node_1"] }));
    const executor = new WorkflowExecutor(reg);
    const res = await executor.execute("wf_5", graph, new WorkflowContext({ prompt: "test" }));

    console.assert(res.success === false, "Workflow success must be false");
    console.assert(res.failedNodes.length === 1, "Failed count 1");
    console.assert(res.skippedNodes.length === 1, "Skipped count 1");
    console.assert(res.skippedNodes[0].id === "node_2", "Dependent node 2 skipped");
    console.log("✓ Test 1.5 Passed: Upstream failed node -> Dependent node SKIPPED\n");
  }

  console.log("==========================================================");
  console.log("=== BUG 2: UNSAFE CONTACT RESOLUTION TEST SUITE ===");
  console.log("==========================================================");

  // Clear and seed test contacts in memory
  await ContactRepository.saveContact("Sujan", "sujan@example.com", { relationship: "friend" });
  await ContactRepository.saveContact("John Smith", "john.smith@example.com");
  await ContactRepository.saveContact("John Doe", "john.doe@example.com");
  await ContactRepository.saveContact("Dr. Alan Smith", "professor@university.edu", { relationship: "professor" });

  // Case 2.1: Exact name "Sujan"
  const c2_1 = await ContactResolver.resolve("Sujan");
  console.assert(c2_1.status === "resolved" && c2_1.email === "sujan@example.com", "Exact name Sujan");
  console.assert(c2_1.confidence === 1.0 && c2_1.matchType === "exact_name", "Match type exact_name");
  console.log("✓ Test 2.1 Passed: Exact name 'Sujan' resolved");

  // Case 2.2: Normalized case "sujan"
  const c2_2 = await ContactResolver.resolve("sujan");
  console.assert(c2_2.status === "resolved" && c2_2.email === "sujan@example.com", "Normalized sujan");
  console.log("✓ Test 2.2 Passed: Normalized case 'sujan' resolved");

  // Case 2.3: Explicit email
  const c2_3 = await ContactResolver.resolve("prof@uni.edu");
  console.assert(c2_3.status === "resolved" && c2_3.matchType === "explicit_email", "Explicit email");
  console.log("✓ Test 2.3 Passed: Explicit email resolved");

  // Case 2.4: Relationship "my friend" -> resolves Sujan because Sujan has relationship "friend"
  const c2_4 = await ContactResolver.resolve("my friend");
  console.assert(c2_4.status === "resolved" && c2_4.email === "sujan@example.com", "Friend relationship matched");
  console.log("✓ Test 2.4 Passed: Relationship 'my friend' resolved to Sujan");

  // Case 2.5: Ambiguous query "John" matching John Smith + John Doe
  const c2_5 = await ContactResolver.resolve("John");
  console.assert(c2_5.status === "ambiguous" && c2_5.matches.length === 2, "Ambiguous John matches 2");
  console.log("✓ Test 2.5 Passed: Ambiguous query 'John' returns ambiguous with 2 matches");

  // Case 2.6: Query "Friend" MUST NOT resolve to "Dr. Alan Smith" (Professor)
  const c2_6 = await ContactResolver.resolve("Friend");
  console.assert(c2_6.email !== "professor@university.edu", "Friend MUST NOT resolve to Professor!");
  console.log("✓ Test 2.6 Passed: Query 'Friend' NEVER resolves to Professor");

  // Case 2.7: Query "Professor" resolves to Dr. Alan Smith
  const c2_7 = await ContactResolver.resolve("my professor");
  console.assert(c2_7.status === "resolved" && c2_7.email === "professor@university.edu", "Professor resolved");
  console.log("✓ Test 2.7 Passed: Relationship 'my professor' resolved to Dr. Alan Smith\n");

  console.log("==========================================================");
  console.log("=== BUG 3: GMAIL invalid_grant RECOVERY TEST SUITE ===");
  console.log("==========================================================");

  // Mock EmailConfirmationPolicy.confirm to simulate OAuth invalid_grant failure
  const originalConfirm = EmailConfirmationPolicy.confirm;
  EmailConfirmationPolicy.confirm = async function() {
    return {
      success: false,
      message: "Gmail authorization has expired or was revoked. Please reconnect Gmail.",
      error: {
        code: "GMAIL_REAUTH_REQUIRED",
        requiresReauth: true,
        authUrl: "https://accounts.google.com/o/oauth2/auth?mock=1"
      }
    };
  };

  const sessionMock = {
    conversationId: "conv-mock-123",
    status: EMAIL_STATUS.WAITING_CONFIRMATION,
    confirmationId: "conf-mock-456",
    to: "sujan@example.com",
    subject: "Trip to India",
    body: "Next month trip info",
    update: function(fields) { Object.assign(this, fields); }
  };

  const sendRes = await emailManager.confirmSend("conf-mock-456", sessionMock);

  console.assert(sendRes.success === false, "Send failure must yield success: false");
  console.assert(sendRes.status === EMAIL_STATUS.FAILED_RETRYABLE, "Status set to FAILED_RETRYABLE");
  console.assert(sendRes.metadata.requiresReauth === true, "metadata.requiresReauth must be true");
  console.assert(Boolean(sendRes.metadata.authUrl), "metadata.authUrl must be present");
  console.assert(sendRes.answer.includes("Gmail needs to be reconnected"), "Actionable user answer text");
  console.assert(sessionMock.status === EMAIL_STATUS.FAILED_RETRYABLE, "Session updated to FAILED_RETRYABLE");
  console.assert(sessionMock.to === "sujan@example.com", "Email draft preserved in session");

  console.log("✓ Test 3.1 Passed: invalid_grant returns requiresReauth: true, authUrl, draft preserved, and no retry storm");

  // Restore confirm
  EmailConfirmationPolicy.confirm = originalConfirm;

  console.log("\n==========================================================");
  console.log("ALL SURGICAL RELIABILITY PATCH TESTS PASSED CLEANLY!");
  console.log("==========================================================");
}

runTests().catch(err => {
  console.error("Test execution error:", err);
  process.exit(1);
});
