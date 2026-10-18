# Request lifecycle

## HTTP non-streaming chat

```mermaid
sequenceDiagram
  participant Client
  participant Express as server.js
  participant Controller as chatController
  participant Chat as chatService
  participant Router as services/toolRouter
  participant AR as AgentRuntime
  participant CA as ContextAssembly
  participant CM as CapabilityManager
  participant WF as WorkflowEngine
  participant Exec as WorkflowExecutor
  participant Cap as Selected capability
  participant AI as services/ai -> RuntimeManager
  participant Store as JSON stores
  Client->>Express: POST /chat {message}
  Express->>Controller: postChat
  Controller->>Chat: handleStandardChat(message)
  Chat->>Store: add user message; update extracted memory
  Chat->>Router: routeRequest(message, toolContext, requestContext)
  Router->>AR: run(prompt, toolContext, options)
  AR->>AR: plan capabilities
  AR->>CA: assembleContext once
  CA-->>AR: scoped context snapshot
  AR->>CM: executeRequest(prompt, toolContext, snapshot, requestContext)
  CM->>WF: execute(CapabilityContext)
  WF->>WF: heuristic plan + validate graph
  WF->>Exec: execute graph in dependency order
  Exec->>Cap: CapabilityLifecycle.run
  Cap->>AI: askAI when model generation is required
  AI->>AI: settings + model selection + RequestPipeline
  AI-->>Cap: response
  Cap-->>Exec: CapabilityResult
  Exec-->>WF: WorkflowResult
  WF-->>CM: result
  CM-->>Router: result
  Router-->>Chat: result
  Chat->>Store: add assistant response; update summary and stats
  Chat-->>Client: JSON {reply}
```

### Observed path and distinctions

`POST /chat` now uses `handleStandardChat()` → `services/toolRouter.routeRequest()` → `core/routing/ToolRouter.routeRequest()` → `AgentRuntime.run()` → `ContextAssembly` → `CapabilityManager` → `WorkflowEngine`. The compatibility `routeRequest(message, toolContext, options)` signature remains. The controller rejects missing, non-string, and blank messages with HTTP 400 and `{error:"message is required"}` before executing the chat service. Request context middleware accepts a syntactically safe `X-Request-Id` or creates one, returns it in the response header before the local API guard, and carries it through async-local storage and capability/workflow contexts. Chat memory extraction and history persistence remain in `chatService`.

The Chat capability calls `askAI(context.prompt, context.toolContext, {requestContext, contextSnapshot})`. `askAI()` calls `RuntimeManager.execute()`, which reuses the snapshot for model token estimates and passes it to `RequestPipeline`; provider-specific token fitting still occurs in CIE. Research, code and other capabilities may also call `askAI` or dedicated feature services.

## Direct requests vs tools vs workflows

- **Direct dialogue:** planner classifies prompt as `chat`; `ChatCapability` calls `askAI`.
- **Capability execution:** planner's ordered regex rules map the prompt to one capability; lifecycle wraps its execute method. `CapabilityRouter` exists and scores `canHandle`, but `WorkflowExecutor` selects the capability by `WorkflowNode.requiredCapability` from the registry; the router is not the planner's selection mechanism on this path.
- **Multi-step request:** connector regexes split prompt text, each segment is classified independently, and nodes are linked in a sequential dependency chain. Upstream outputs enter later node context as `workingMemory`; the prompt is composed by `WorkflowContext`.
- **Confirmation-gated action:** email/calendar managers create pending actions and return structured waiting/confirmation results. Generic `POST /confirm` executes via `toolRegistry`. Calendar/email conversational flows also handle affirmative/cancel text through their managers. Sending is distinct from drafting and requires confirmation by policy.
- **Streaming:** `POST /chat/stream` invokes `handleStreamChatService` → `AgentRuntime.runStream`. Chat plans stream through `ChatCapability.executeStream` → `askAIStream` → `RuntimeManager.executeStream` → `RequestPipeline.executeStream`; non-chat results execute the capability workflow once. The existing `__TIMELINE__`, `__CONFIRMATION__`, and `__WAITING_INPUT__` markers remain. Client disconnects signal cancellation to the installed provider adapters; provider switching is allowed only before the first content chunk.

## Result and error boundaries

Capability returns retain `CapabilityResult` fields `success`, `capability`, `tool`, `answer`/`response`, `executedSteps`, `toolCalls`, `artifacts`, `diagnostics`, and `metadata`. Workflow executor observes `success === false`, marks the node failed, skips dependents and aggregates a `WorkflowResult`. `ErrorNormalizer` supplies stable codes, safe user messages and the request ID. The HTTP response-body contracts remain `{reply}` for standard chat and the existing marker-based text protocol for streaming; direct `POST /confirm` still has its own shape.

## Provider lifecycle

See the routing diagram and ordering discussion in [backend architecture](SAMGPT_BACKEND_ARCHITECTURE.md). Intent/model selection chooses the primary model, `ProviderPool` builds candidates, `RequestPipeline` applies provider retries/fallback, and `ResponsePipeline` cleans standard answers. Streaming uses the same candidate pipeline; provider fallback stops after any content is emitted. Request IDs are carried end-to-end, but idempotency keys and durable workflow checkpoints are not implemented.

## Recovery gaps to track

The request lifecycle does not persist an in-progress workflow, cancellation token or execution checkpoint. A server restart can lose in-memory conversation sessions and cannot resume a workflow. Persisted confirmation records left `executing` are marked `outcome_unknown` when next observed and are never automatically replayed; external effects must be reconciled. Provider retries and fallback are separate from business-action retry; a failed business operation should not be replayed simply because an AI provider failed. See [storage and recovery](SAMGPT_STORAGE_AND_RECOVERY.md) and [security and reliability audit](SAMGPT_SECURITY_AND_RELIABILITY_AUDIT.md).

## Phase 3 verification boundary

The Express chat router, controller and request middleware are exercised over an ephemeral loopback server with injected service/runtime/provider behavior and temporary history storage. The production `server.js` entrypoint itself is not imported because it starts the listener and initializes voice hardware on module load. Live SDK/network cancellation, client rendering of mixed marker/text chunks, and unrelated API routes are not covered by this suite.
