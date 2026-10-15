# Test coverage and verification

## Commands run for this audit

| Script | Result | What it establishes / does not establish |
|---|---:|---|
| `npm test` | **9 passed, 0 failed** | Phase 1 offline tests cover atomic/private JSON storage and corruption, serialized updates, one-time confirmation claims and failure propagation, OAuth state, local API guard, safe error logging, and desktop policy validation. No live services or OS actions are used. |
| `node core/calendar/__tests__/tests3_15_all.js` | **89 passed, 0 failed** | Exercises calendar intent classification, date/time and recurrence helpers, conflict logic, auth result shapes, workflow routing, voice confirm/cancel recognition, timezone priority and related pure/offline logic. Does not prove live OAuth, calendar API calls, route auth, or actual event mutation. |
| `node scratch/test_error_fallback_system.js` | **38 passed, 0 failed** | Exercises result/error normalization and `FallbackManager`/`FallbackPolicy` helper behavior using local candidate fixtures. Does not prove the production `ProviderPool` uses `FallbackPolicy`, live provider availability, real generation/retries, email send, or stream transport. |

`npm test` now runs the Phase 1 security-integrity suite. No build/lint scripts are defined. The test commands made no provider, email, calendar API, or paid external calls; they may emit local diagnostics only.

## Tests discovered but not run

- `core/calendar/__tests__/test1_create_event.js` and `test2_multi_turn.js`; calendar-specific tests with conversation state and date parsing. Not run to keep verification focused; aggregated test covers calendar logic but not complete manager/provider integration.
- `scratch/test_bugs1_6.js`: email conversation/contact tests. Not run because test appears to write contact/memory state and uses confirmation workflow.
- `scratch/test_bugs_patch.js`: mock workflow failure propagation tests. Not run in this pass.
- `testCie.js`: test source sets fake provider keys and includes persistence writes and provider-oriented tests; not run to avoid writes or unexpected network access.
- `testMSE.js`: model-selection tests; not run because it loads `.env` and may exercise configuration-dependent selection.
- `testAgent.js`, `testAgentRouter.js`, `test.js`, `testQwenRouting.js`: ad hoc scripts with no unified runner or assurance of side-effect-free behavior; not run.
- `scratch/test_error_fallback_system.js` is untracked in the current working tree; its passing status describes the observed file only, not committed CI coverage.

## Coverage map

| Area | Evidence found | Confidence / gap |
|---|---|---|
| Calendar intent/scheduling | Aggregated script, 89 assertions | Good unit/helper coverage; no live Google API or route test |
| Provider fallback | 38 assertions on helper classes/candidate fixtures | Runtime integration/order not verified; canonical helper not imported by runtime |
| Workflow failure propagation | A scratch regression script exists | Not run; no package-managed test suite |
| Email V2 | Scratch bug regression script exists | Not run; no Gmail side effects allowed; persistence/recovery race not tested |
| Memory stores | No unified test runner discovered | CRUD, ranking, concurrent writes, retention and context inclusion unverified |
| HTTP/API | Phase 1 pure local guard tests; no route integration tests | Loopback/origin policy helper tested; actual server binding and route behavior not tested end-to-end. Upload limits and broader validation remain open |
| Voice/desktop | Phase 1 desktop policy unit test | Central input and confirmation policy helper tested; no audio/OS action run, symlink race test, or platform-specific behavior verification |
| Electron/frontend contracts | No source found | Cannot be verified in this repo |
| Build/lint/dependencies | No build/lint scripts | No static analysis or dependency audit run |

## Specific unverified claims

- Live provider credentials, model access, fallback under real transient/permanent errors and timeouts.
- Whether runtime candidate order remains stable under health/circuit changes.
- Streaming provider switch behavior through the actual HTTP client, including disconnects and partial streams.
- Workflow graph handling under thrown errors, returned `success:false`, malformed dependency graph and cancellation.
- Email reauthorization draft survival across restart and explicit reconfirmation; confirmation crash recovery and external side effects whose result is uncertain.
- Calendar route authentication, user timezone settings, recurrence edge cases, provider conflict semantics and real event mutations.
- File permissions, firewall/network exposure, Electron parent-child trust boundaries, and production launch configuration.

The historical report of 89 calendar assertions is current and independently reproduced during this audit. No other historical passing count was used as current evidence.
