# Test coverage and verification

## Commands run for this audit

| Script | Result | What it establishes / does not establish |
|---|---:|---|
| `npm test` | **27 passed, 0 failed** | Phase 1 security-integrity, Phase 2 request lifecycle, and Phase 3 HTTP route tests cover context assembly, request ID isolation, safe error normalization, workflow failure propagation, stream fallback/cancellation, response contracts, temporary storage, and snapshot reuse. No live services or OS actions are used. |
| `node --test tests/phase3/chat-route.integration.test.js` | **10 passed, 0 failed** | Exercises actual Express chat routes/controllers and middleware over loopback HTTP with mock runtime/provider behavior and temporary history files. Covers success, validation, safe app/provider errors, correlation IDs, markers, pre/post-output failure, disconnect cleanup, and snapshot reuse. |
| `node core/calendar/__tests__/tests3_15_all.js` | **89 passed, 0 failed** | Exercises calendar intent classification, date/time and recurrence helpers, conflict logic, auth result shapes, workflow routing, voice confirm/cancel recognition, timezone priority and related pure/offline logic. Does not prove live OAuth, calendar API calls, route auth, or actual event mutation. |
| `node scratch/test_error_fallback_system.js` | **38 passed, 0 failed** | Exercises result/error normalization and `FallbackManager`/`FallbackPolicy` helper behavior using local candidate fixtures. Does not prove the production `ProviderPool` uses `FallbackPolicy`, live provider availability, real generation/retries, email send, or stream transport. |

`npm test` runs the Phase 1 security-integrity, Phase 2 request lifecycle, and Phase 3 chat route suites. No build/lint scripts are defined. The test commands made no provider, email, calendar API, or paid external calls; route tests use ephemeral loopback HTTP servers and temporary history files.

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
| Provider fallback | Phase 2 mocked stream tests plus 38 helper assertions | Pre-output fallback and post-output stop are verified with mocks; real provider availability, candidate order and HTTP transport are not verified |
| Workflow failure propagation | Phase 2 mock workflow test confirms `success:false` and dependent skip | Malformed graphs and thrown failures across every capability remain untested |
| Email V2 | Scratch bug regression script exists | Not run; no Gmail side effects allowed; persistence/recovery race not tested |
| Memory stores | No unified test runner discovered | CRUD, ranking, concurrent writes, retention and context inclusion unverified |
| HTTP/API | Phase 1 guard tests plus Phase 3 loopback route tests | Chat router/controller, request IDs, local origin rejection and established response formats tested with mock services. Full `server.js` startup, all other routes, browser clients and body/upload limits remain untested |
| Voice/desktop | Phase 1 desktop policy unit test | Central input and confirmation policy helper tested; no audio/OS action run, symlink race test, or platform-specific behavior verification |
| Electron/frontend contracts | No source found | Cannot be verified in this repo |
| Build/lint/dependencies | No build/lint scripts | No static analysis or dependency audit run |

## Specific unverified claims

- Live provider credentials, model access, fallback under real transient/permanent errors and timeouts.
- Whether runtime candidate order remains stable under health/circuit changes.
- Real SDK/network behavior during streaming cancellation; route disconnect and pipeline fallback boundaries are covered with mocks only.
- Workflow graph handling under malformed dependency graphs and thrown failures across every capability; streaming cancellation is covered only with a mocked provider iterator.
- Email reauthorization draft survival across restart and explicit reconfirmation; confirmation crash recovery and external side effects whose result is uncertain.
- Calendar route authentication, user timezone settings, recurrence edge cases, provider conflict semantics and real event mutations.
- File permissions, firewall/network exposure, Electron parent-child trust boundaries, and production launch configuration.

The historical report of 89 calendar assertions is current and independently reproduced during this audit. No other historical passing count was used as current evidence.
