import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import { createLocalApiGuard } from "../../services/httpSecurity.js";
import { requestContextMiddleware } from "../../core/request/RequestContext.js";
import { createChatController } from "../../features/chat/chatController.js";
import { createChatRouter } from "../../features/chat/chatRoutes.js";
import { createChatService } from "../../features/chat/chatService.js";
import { createStreamChatService } from "../../features/chat/streamService.js";
import { createChatStorage } from "../../features/chat/chatStorage.js";
import { createConversationService } from "../../features/chat/conversationService.js";
import { ErrorNormalizer } from "../../core/errors/ErrorNormalizer.js";
import { RequestPipeline } from "../../core/runtime/RequestPipeline.js";

async function withTempStorage(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "samgpt-phase3-"));
  try {
    const storage = createChatStorage(path.join(directory, "chat-history.json"));
    const conversation = createConversationService(storage);
    await run({ storage, conversation });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

async function withHttpApp({ chatService, streamService, loadChatHistory } = {}, run) {
  const app = express();
  app.use(requestContextMiddleware);
  app.use(createLocalApiGuard());
  app.use(express.json());
  const controller = createChatController({
    handleStandardChat: chatService,
    handleStreamChatService: streamService,
    loadChatHistory,
    logError: () => {},
  });
  app.use("/chat", createChatRouter(controller));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(baseUrl);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

function defaultStreamDeps(runtime, conversation) {
  return {
    agentRuntime: runtime,
    addMessage: conversation.addMessage,
    updateMemory: async () => {},
    updateSummary: async () => {},
    incrementStat: async () => {},
    getLastModelUsed: () => ({ name: "mock", displayName: "Mock Model", provider: "mock" }),
  };
}

test("POST /chat preserves success shape, propagates request id, and uses isolated history storage", async () => {
  await withTempStorage(async ({ storage, conversation }) => {
    let routedOptions;
    const service = createChatService({
      addMessage: conversation.addMessage,
      updateMemory: async () => {},
      routeRequest: async (_message, _tool, options) => { routedOptions = options; return { success: true, answer: "hello back" }; },
      updateSummary: async () => {},
      incrementStat: async () => {},
      loadHistory: storage.loadHistory,
    });
    await withHttpApp({ chatService: service.handleStandardChat, loadChatHistory: service.loadChatHistory }, async baseUrl => {
      const response = await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-request-id": "route-id-123" },
        body: JSON.stringify({ message: "hello" }),
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-request-id"), "route-id-123");
      assert.deepEqual(await response.json(), { reply: "hello back" });
      assert.equal(routedOptions.requestContext.requestId, "route-id-123");
      assert.deepEqual((await storage.loadHistory()).map(item => [item.role, item.content]), [
        ["user", "hello"], ["assistant", "hello back"],
      ]);
    });
  });
});

test("POST /chat rejects missing or invalid messages without running the service", async () => {
  let serviceCalls = 0;
  await withHttpApp({ chatService: async () => { serviceCalls++; return { reply: "unused" }; } }, async baseUrl => {
    for (const body of [{}, { message: 4 }, { message: "  " }]) {
      const response = await fetch(`${baseUrl}/chat`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
      assert.equal(response.status, 400);
      assert.match(response.headers.get("x-request-id"), /^[A-Za-z0-9._:-]{1,128}$/);
      assert.deepEqual(await response.json(), { error: "message is required" });
    }
  });
  assert.equal(serviceCalls, 0);
});

test("POST /chat normalizes application and provider failures without exposing secrets", async () => {
  await withTempStorage(async ({ conversation }) => {
    const cases = [
      {
        routeRequest: async () => ({ success: false, error: { code: "GMAIL_REAUTH_REQUIRED", message: "OAuth token=synthetic-secret" } }),
        expected: "Gmail needs to be reconnected",
      },
      {
        routeRequest: async () => { throw Object.assign(new Error("provider raw response token=synthetic-secret"), { code: "NETWORK_ERROR" }); },
        expected: "network communication error",
      },
    ];
    for (const item of cases) {
      const service = createChatService({
        addMessage: conversation.addMessage,
        updateMemory: async () => {},
        routeRequest: item.routeRequest,
        updateSummary: async () => {},
        incrementStat: async () => {},
        logError: () => {},
      });
      await withHttpApp({ chatService: service.handleStandardChat }, async baseUrl => {
        const response = await fetch(`${baseUrl}/chat`, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "run operation" }),
        });
        const body = await response.json();
        assert.equal(response.status, 200);
        assert.match(body.reply.toLowerCase(), new RegExp(item.expected.toLowerCase()));
        assert.equal(JSON.stringify(body).includes("synthetic-secret"), false);
      });
    }
  });
});

test("POST /chat replaces malformed caller IDs and an ID does not authorize access", async () => {
  let observedId;
  await withHttpApp({ chatService: async (_message, options) => { observedId = options.requestContext.requestId; return { reply: "ok" }; } }, async baseUrl => {
    const acceptedOrigin = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "bad id", origin: "http://localhost:5173" },
      body: JSON.stringify({ message: "hello" }),
    });
    assert.equal(acceptedOrigin.status, 200);
    assert.match(acceptedOrigin.headers.get("x-request-id"), /^[A-Za-z0-9._:-]{1,128}$/);
    assert.notEqual(acceptedOrigin.headers.get("x-request-id"), "bad id");
    assert.equal(observedId, acceptedOrigin.headers.get("x-request-id"));

    observedId = undefined;
    const response = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "caller-id-is-not-auth", origin: "https://attacker.invalid" },
      body: JSON.stringify({ message: "hello" }),
    });
    assert.equal(response.status, 403);
    assert.match(response.headers.get("x-request-id"), /^[A-Za-z0-9._:-]{1,128}$/);
    assert.equal(response.headers.get("x-request-id"), "caller-id-is-not-auth");
    assert.equal(observedId, undefined);
  });
});

test("POST /chat/stream preserves text markers and propagates request IDs", async () => {
  await withTempStorage(async ({ conversation }) => {
    let seenId;
    const runtime = {
      async runStream(_message, _tool, options) {
        seenId = options.requestContext.requestId;
        await options.beforeContext();
        return { type: "chat_stream", modelUsed: { name: "mock", displayName: "Mock Model", provider: "mock" }, stream: (async function* () { yield "streamed answer"; })() };
      },
    };
    const streamService = createStreamChatService(defaultStreamDeps(runtime, conversation));
    await withHttpApp({ streamService }, async baseUrl => {
      const response = await fetch(`${baseUrl}/chat/stream`, {
        method: "POST", headers: { "content-type": "application/json", "x-request-id": "stream-id-77" },
        body: JSON.stringify({ message: "stream please" }),
      });
      const body = await response.text();
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type").split(";")[0], "text/plain");
      assert.equal(response.headers.get("x-request-id"), "stream-id-77");
      assert.match(body, /^__TIMELINE__:/);
      assert.match(body, /streamed answer/);
      assert.equal(seenId, "stream-id-77");
    });
  });
});

test("stream route returns confirmation and waiting-input markers without executing a second action", async () => {
  await withTempStorage(async ({ conversation }) => {
    let calls = 0;
    const runtime = { async runStream(message) {
      calls++;
      return { type: "result", result: message === "confirm" ?
        { success: true, tool: "confirmation", answer: { id: "confirmation-1", status: "confirmation_required" } } :
        { success: true, tool: "waiting_input", answer: { status: "waiting_input", fields: ["recipient"] } } };
    } };
    const streamService = createStreamChatService(defaultStreamDeps(runtime, conversation));
    await withHttpApp({ streamService }, async baseUrl => {
      for (const [message, marker] of [["confirm", "__CONFIRMATION__:"], ["wait", "__WAITING_INPUT__:"]]) {
        const response = await fetch(`${baseUrl}/chat/stream`, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message }),
        });
        const body = await response.text();
        assert.equal(response.status, 200);
        assert.match(body, /^__TIMELINE__:/);
        assert.match(body, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      }
    });
    assert.equal(calls, 2);
  });
});

test("stream route handles failure before output and interruption after output safely", async () => {
  await withTempStorage(async ({ conversation }) => {
    let invocations = 0;
    const runtime = {
      async runStream() {
        invocations++;
        const stream = (async function* () {
          if (invocations === 1) throw Object.assign(new Error("provider token=synthetic-secret"), { code: "ALL_MODELS_FAILED" });
          yield "partial text";
          throw Object.assign(new Error("provider token=synthetic-secret"), { code: "STREAMING_INTERRUPTED" });
        })();
        return { type: "chat_stream", stream, modelUsed: { name: "mock", displayName: "Mock Model", provider: "mock" } };
      },
    };
    const streamService = createStreamChatService(defaultStreamDeps(runtime, conversation));
    await withHttpApp({ streamService }, async baseUrl => {
      for (const [message, marker] of [["before", "temporarily unable"], ["after", "Sorry for the interruption"]]) {
        const response = await fetch(`${baseUrl}/chat/stream`, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message }),
        });
        const body = await response.text();
        assert.equal(response.status, 200);
        assert.match(body, /^__TIMELINE__:/);
        assert.match(body.toLowerCase(), new RegExp(marker.toLowerCase()));
        assert.equal(body.includes("synthetic-secret"), false);
      }
    });
    assert.equal(invocations, 2, "each incoming stream request starts one runtime stream");
  });
});

test("stream client disconnect aborts the request and closes the provider iterator", async () => {
  await withTempStorage(async ({ conversation }) => {
    let cleanup;
    const providerClosed = new Promise(resolve => { cleanup = resolve; });
    let sawAbort = false;
    const runtime = {
      async runStream(_message, _tool, options) {
        await options.beforeContext();
        return {
          type: "chat_stream",
          modelUsed: { name: "mock", displayName: "Mock Model", provider: "mock" },
          stream: (async function* () {
            try {
              yield "ready-chunk";
              if (!options.signal.aborted) await new Promise(resolve => options.signal.addEventListener("abort", () => { sawAbort = true; resolve(); }, { once: true }));
            } finally {
              cleanup();
            }
          })(),
        };
      },
    };
    const streamService = createStreamChatService(defaultStreamDeps(runtime, conversation));
    await withHttpApp({ streamService }, async baseUrl => {
      const controller = new AbortController();
      const response = await fetch(`${baseUrl}/chat/stream`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "disconnect" }), signal: controller.signal,
      });
      const reader = response.body.getReader();
      let received = "";
      while (!received.includes("ready-chunk")) {
        const next = await reader.read();
        if (next.done) throw new Error("stream ended before first content chunk");
        received += new TextDecoder().decode(next.value);
      }
      controller.abort();
      let timeout;
      try {
        await Promise.race([providerClosed, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("provider iterator did not close")), 2000); })]);
      } finally {
        clearTimeout(timeout);
      }
      assert.equal(sawAbort, true);
    });
  });
});

test("public normalized failure text is consistent with ErrorNormalizer mappings", () => {
  const normalized = ErrorNormalizer.normalize(Object.assign(new Error("private"), { code: "GMAIL_REAUTH_REQUIRED" }));
  assert.match(normalized.userMessage, /Gmail needs to be reconnected/);
});

test("one context snapshot is reused across provider candidates", async () => {
  let contextCalls = 0;
  const snapshots = [];
  const candidates = [
    { provider: "first", name: "first", modelId: "first-model", displayName: "First", maxRetries: 0 },
    { provider: "second", name: "second", modelId: "second-model", displayName: "Second", maxRetries: 0 },
  ];
  const providers = {
    first: { maxRetries: 0, generate: async () => { throw Object.assign(new Error("mock outage"), { errorType: "NETWORK_ERROR", shouldFallback: true }); } },
    second: { maxRetries: 0, generate: async () => "completed" },
  };
  const pipeline = new RequestPipeline({
    providerPool: { getProvider: key => providers[key], recordSuccess() {}, recordFailure() {} },
    fallbackManager: { getCandidates: () => candidates, selectNextCandidate: (items, failed) => items.find(item => !failed.has(item.name)) || null },
    retryManager: { isRetryable: () => false, calculateBackoff: () => 0, sleep: async () => {} },
    diagnostics: { info() {}, warn() {}, error() {}, debug() {} },
    runCie: async (_prompt, _tool, _provider, _system, _pdf, _settings, snapshot) => {
      snapshots.push(snapshot);
      return { promptText: "prompt" };
    },
    contextAssembly: { assembleContext: async () => { contextCalls++; return { intent: "General", memory: { fixture: true }, history: [], summary: "" }; } },
  });
  const result = await pipeline.executeRequest({
    prompt: "hello", modelConfig: { provider: "first", name: "first", displayName: "First" },
  });
  assert.equal(result.response, "completed");
  assert.equal(contextCalls, 1);
  assert.equal(snapshots.length, 2);
  assert.equal(snapshots[0], snapshots[1]);
});
