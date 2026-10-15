# Request lifecycle

## HTTP non-streaming chat

```mermaid
sequenceDiagram
  participant Client
  participant Express as server.js
  participant Controller as chatController
  participant Chat as chatService
  participant Router as services/toolRouter
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
  Chat->>Router: routeRequest(message)
  Router->>CM: executeRequest(prompt, toolContext)
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

`POST /chat` does not call `AgentRuntime.run()`. It uses `handleStandardChat()` → `services/toolRouter.routeRequest()` → `core/routing/ToolRouter.routeRequest()` → `CapabilityManager.executeRequest()` → `WorkflowEngine`. `AgentRuntime.run()` separately assembles memory/history/summary/PDF context and delegates to `CapabilityManager`, but no route was found invoking it. The `CapabilityContext` constructor in `CapabilityManager` receives the optional assembled context, which is `{}` on the compatibility route.

The Chat capability calls `askAI(context.prompt, context.toolContext)`. `askAI()` calls `RuntimeManager.execute()`, which loads settings, chooses a model through `ModelRouter`/model-selection and runs `RequestPipeline`. This is the main non-stream generation path. Research, code and other capabilities may also call `askAI` or dedicated feature services.

## Direct requests vs tools vs workflows

- **Direct dialogue:** planner classifies prompt as `chat`; `ChatCapability` calls `askAI`.
- **Capability execution:** planner's ordered regex rules map the prompt to one capability; lifecycle wraps its execute method. `CapabilityRouter` exists and scores `canHandle`, but `WorkflowExecutor` selects the capability by `WorkflowNode.requiredCapability` from the registry; the router is not the planner's selection mechanism on this path.
- **Multi-step request:** connector regexes split prompt text, each segment is classified independently, and nodes are linked in a sequential dependency chain. Upstream outputs enter later node context as `workingMemory`; the prompt is composed by `WorkflowContext`.
- **Confirmation-gated action:** email/calendar managers create pending actions and return structured waiting/confirmation results. Generic `POST /confirm` executes via `toolRegistry`. Calendar/email conversational flows also handle affirmative/cancel text through their managers. Sending is distinct from drafting and requires confirmation by policy.
- **Streaming:** `POST /chat/stream` invokes `handleStreamChatService`. Non-chat tool results are returned with line-oriented text protocol markers `__TIMELINE__`, `__CONFIRMATION__`, and `__WAITING_INPUT__`. Plain chat calls legacy `askGroqStream`, not the `RuntimeManager.executeStream()` method.

## Result and error boundaries

Capability returns are normalized with `CapabilityResult` fields `success`, `capability`, `tool`, `answer`/`response`, `executedSteps`, `toolCalls`, `artifacts`, `diagnostics`, and `metadata`. Workflow executor observes `success === false`, marks the node failed, skips dependents and aggregates a `WorkflowResult`. Unexpected workflow exceptions are normalized through `ErrorNormalizer`. The standard chat service catches a thrown request error and returns a generic message if no answer is available. In contrast, streaming response formats and direct `POST /confirm` response shapes differ; there is no single API-wide error envelope.

## Provider lifecycle

See the routing diagram and ordering discussion in [backend architecture](SAMGPT_BACKEND_ARCHITECTURE.md). In brief: intent/model selection chooses primary model, `ProviderPool` builds candidates, `RequestPipeline` retries candidate generation and falls back through candidates; response pipeline cleans answer. Streaming has separate candidate handling in RuntimeManager if called, but the HTTP streaming service uses older `askGroqStream` code. Neither request path exposes a consistent request ID or idempotency key in the inspected contract.

## Recovery gaps to track

The request lifecycle does not persist an in-progress workflow, cancellation token or execution checkpoint. A server restart can lose in-memory conversation sessions and cannot resume a workflow. Provider retries and fallback are separate from business-action retry; a failed business operation should not be replayed simply because an AI provider failed. See [security and reliability audit](SAMGPT_SECURITY_AND_RELIABILITY_AUDIT.md).
