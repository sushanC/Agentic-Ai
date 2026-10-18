import { test } from "node:test";
import assert from "node:assert/strict";
import { ContextAssembly } from "../../core/context/ContextAssembly.js";
import { createRequestContext, getCurrentRequestContext, runWithRequestContext } from "../../core/request/RequestContext.js";
import { ErrorNormalizer } from "../../core/errors/ErrorNormalizer.js";
import { AgentRuntime } from "../../core/agent/AgentRuntime.js";
import { RequestPipeline } from "../../core/runtime/RequestPipeline.js";
import { CapabilityRegistry } from "../../core/capabilities/CapabilityRegistry.js";
import { WorkflowExecutor } from "../../core/workflow/WorkflowExecutor.js";
import { WorkflowGraph } from "../../core/workflow/WorkflowGraph.js";
import { WorkflowNode } from "../../core/workflow/WorkflowNode.js";
import { WorkflowContext } from "../../core/workflow/WorkflowContext.js";

test("context assembly retrieves chat context once and keeps non-chat ambient data scoped", async () => {
  const calls = [];
  const assembly = new ContextAssembly({
    loadSettings: async () => ({}),
    detectIntent: async () => { calls.push("intent"); return "General"; },
    retrieveChatMemory: async () => { calls.push("chat-memory"); return { profile: "private" }; },
    getHistory: async () => { calls.push("history"); return [{ role: "user" }]; },
    getSummary: async () => { calls.push("summary"); return "summary"; },
    retrieveDomainMemory: async (_prompt, intent) => { calls.push(intent); return { contacts: ["A"], unrelated: "private" }; },
    getUserPreferences: async () => ({ email_preferences: { tone: "brief" } }),
  });
  const chat = await assembly.assembleContext("hello", { capabilities: ["chat"] });
  assert.deepEqual(calls, ["intent", "chat-memory", "history", "summary"]);
  assert.equal(chat.memory.profile, "private");
  calls.length = 0;
  const email = await assembly.assembleContext("draft email", { capabilities: ["email"] });
  assert.deepEqual(calls, ["Email"]);
  assert.deepEqual(email.history, []);
  assert.deepEqual(email.memory.unrelated, "private");
  assert.equal(email.userPreferences.email_preferences.tone, "brief");
});

test("request ids are validated and async-local context stays isolated across concurrent work", async () => {
  assert.equal(createRequestContext("client-id:123").requestId, "client-id:123");
  assert.notEqual(createRequestContext("bad id").requestId, "bad id");
  const seen = await Promise.all(["req-a", "req-b"].map(id => runWithRequestContext({ requestId: id }, async () => {
    await new Promise(resolve => setTimeout(resolve, id === "req-a" ? 5 : 1));
    return getCurrentRequestContext().requestId;
  })));
  assert.deepEqual(seen, ["req-a", "req-b"]);
});

test("error normalization preserves stable code and request id without raw exception details", async () => {
  const normalized = await runWithRequestContext({ requestId: "safe-req" }, () => ErrorNormalizer.normalize(
    Object.assign(new Error("private path /home/person/token=secret"), { code: "GMAIL_REAUTH_REQUIRED" }),
    { capability: "email", tool: "email_send" },
  ));
  assert.equal(normalized.code, "GMAIL_REAUTH_REQUIRED");
  assert.equal(normalized.requestId, "safe-req");
  assert.equal(normalized.technicalMessage.includes("/home/person"), false);
  assert.equal(JSON.stringify(normalized.diagnostics).includes("token=secret"), false);
  assert.equal(normalized.requiresReauth, true);
});

test("AgentRuntime assembles one context snapshot and carries its request id into execution", async () => {
  let assembled = 0;
  let received;
  const runtime = new AgentRuntime({
    events: { beginRequest() {}, endRequest() {}, emitDevEvent() {} },
    contextAssembly: { assembleContext: async (_prompt, options) => { assembled++; return { memory: {}, history: [], summary: "", requestContext: options.requestContext }; } },
    planner: { plan: () => ({ getAllNodes: () => [{ requiredCapability: "chat" }] }) },
    capabilityManager: { executeRequest: async (...args) => { received = args; return { success: true, answer: "ok" }; } },
  });
  const result = await runtime.run("hello", "chat", { requestContext: { requestId: "phase2-id" } });
  assert.equal(result.answer, "ok");
  assert.equal(assembled, 1);
  assert.equal(received[3].requestId, "phase2-id");
  assert.equal(received[2].requestContext.requestId, "phase2-id");
});

test("workflow preserves success:false and skips dependent nodes", async () => {
  const registry = new CapabilityRegistry();
  let dependentCalls = 0;
  registry.register({ name: "first", isInitialized: true, async analyze() {}, async plan() {}, async cleanup() {}, async execute() {
    return { success: false, capability: "first", tool: "first", answer: "safe failure" };
  } });
  registry.register({ name: "dependent", isInitialized: true, async analyze() {}, async plan() {}, async cleanup() {}, async execute() {
    dependentCalls++;
    return { success: true, answer: "should not run" };
  } });
  const graph = new WorkflowGraph();
  graph.addNode(new WorkflowNode({ id: "first", task: "first", requiredCapability: "first" }));
  graph.addNode(new WorkflowNode({ id: "dependent", task: "dependent", requiredCapability: "dependent", dependencies: ["first"] }));
  const result = await new WorkflowExecutor(registry).execute("test-workflow", graph, new WorkflowContext({ prompt: "request" }));
  assert.equal(result.success, false);
  assert.equal(result.answer, "safe failure");
  assert.equal(result.skippedNodes.length, 1);
  assert.equal(dependentCalls, 0);
});

function makePipeline(providers) {
  const candidates = Object.keys(providers).map((provider, index) => ({ provider, name: provider, modelId: provider, displayName: provider, index }));
  return new RequestPipeline({
    providerPool: { getProvider: key => providers[key], recordSuccess() {}, recordFailure() {} },
    fallbackManager: { getCandidates: () => candidates, selectNextCandidate: (items, failed) => items.find(item => !failed.has(item.name)) || null },
    retryManager: { isRetryable: () => false, calculateBackoff: () => 0, sleep: async () => {} },
    diagnostics: { info() {}, warn() {}, error() {}, debug() {} },
    runCie: async () => ({ promptText: "prompt" }),
    contextAssembly: { assembleContext: async () => ({ intent: "General", memory: {}, history: [], summary: "" }) },
  });
}

test("streaming can fall back before the first chunk", async () => {
  let secondCalled = false;
  const providers = {
    first: { stream: async function* () { const error = new Error("provider unavailable"); error.errorType = "NETWORK_ERROR"; error.shouldFallback = true; throw error; } },
    second: { stream: async function* () { secondCalled = true; yield "ok"; } },
  };
  const pipeline = makePipeline(providers);
  const chunks = [];
  for await (const chunk of pipeline.executeStream({ prompt: "hello", modelConfig: { provider: "first", name: "first", displayName: "first" } })) chunks.push(chunk);
  assert.deepEqual(chunks, ["ok"]);
  assert.equal(secondCalled, true);
});

test("streaming does not switch providers after visible output", async () => {
  let secondCalled = false;
  const providers = {
    first: { stream: async function* () { yield "partial"; const error = new Error("provider unavailable"); error.errorType = "NETWORK_ERROR"; error.shouldFallback = true; throw error; } },
    second: { stream: async function* () { secondCalled = true; yield "wrong-provider"; } },
  };
  const pipeline = makePipeline(providers);
  const chunks = [];
  for await (const chunk of pipeline.executeStream({ prompt: "hello", modelConfig: { provider: "first", name: "first", displayName: "first" } })) chunks.push(chunk);
  assert.equal(chunks[0], "partial");
  assert.match(chunks[1], /Sorry for the interruption/);
  assert.equal(secondCalled, false);
});

test("stream cancellation propagates to the provider iterator and stops candidate work", async () => {
  const controller = new AbortController();
  let providerClosed = false;
  let secondCalled = false;
  const providers = {
    first: { stream: async function* (_model, _prompt, { signal }) {
      try {
        yield "partial";
        if (!signal.aborted) await new Promise(resolve => signal.addEventListener("abort", resolve, { once: true }));
      } finally {
        providerClosed = true;
      }
    } },
    second: { stream: async function* () { secondCalled = true; yield "unexpected"; } },
  };
  const pipeline = makePipeline(providers);
  const iterator = pipeline.executeStream({ prompt: "hello", modelConfig: { provider: "first", name: "first", displayName: "first" }, signal: controller.signal });
  assert.deepEqual(await iterator.next(), { value: "partial", done: false });
  controller.abort();
  assert.deepEqual(await iterator.next(), { value: undefined, done: true });
  assert.equal(providerClosed, true);
  assert.equal(secondCalled, false);
});
