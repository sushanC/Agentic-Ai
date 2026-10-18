# Storage, recovery and data integrity

Audit and implementation completed on 2026-10-18. Paths below are derived from the checked-out source. The application stores data under the process user's home directory in `~/.personal-agent/`, except for explicitly noted current-working-directory and upload paths. No user files or credential values were read during this audit.

## Persistent-store inventory

| Store / logical data | Verified path and format | Read/write behavior and recovery | Sensitivity / backup |
|---|---|---|---|
| Chat history | `~/.personal-agent/chat_history.json`, JSON array of legacy message records | Shared by `storage/historyStorage.js` and `features/chat/chatStorage.js`; missing file means `[]`; malformed JSON or a non-array now raises `JSON_STORAGE_CORRUPT`; atomic replacement, mode `0600`; update helpers serialize within one process | Conversation content; included in `/backup` |
| Summary | `~/.personal-agent/summary.json`, legacy string or object (normally `{summary}`) | Missing file uses `{summary:""}`; malformed/invalid root fails; atomic replacement, `0600`; no transaction with history compaction | Derived conversation content; included only indirectly in context, not `/backup` |
| Semantic profile | `~/.personal-agent/profile.json`, legacy flat key/value object | Shared by CLI `profileStorage` and `SemanticMemoryStore`; both now use one JSON helper. Extracted facts merge by key under an in-process lock; explicit replacement is retained for restore/reset; malformed or wrong-root JSON fails closed; atomic replacement, `0600` | Personal profile; exported as `memory` in `/backup` |
| Preferences and projects | `preferences.json` and `projects.json`, JSON objects | Persistent maps loaded on first use; missing means empty; malformed/wrong-root fails closed; atomic replacement, `0600` | Personal preferences/project knowledge; excluded from `/backup` |
| Episodic and reflection memory | `episodic.json`, `reflections.json`, JSON arrays of memory objects | Missing means empty; malformed/wrong-root fails closed; atomic replacement, `0600` | Potentially personal; excluded from `/backup` |
| Relationship graph | `relationship_graph.json`, object from subject to edge arrays; legacy string edges are normalized in memory | Missing means empty; malformed/wrong-root fails closed; atomic replacement, `0600`; profile deletion removes its derived `user has_property` edge | Derived personal index; excluded from `/backup`; graph/profile updates are not a multi-file transaction |
| Working memory and activity feed | Process-local map and array (activity capped at 20) | Lost on restart; no file write | Not in backup |
| Notes | `~/.personal-agent/notes.json`, JSON array | Missing means empty; malformed/wrong-root fails closed; atomic replacement, `0600`; note service and built-in note tools use locked update operations | User-authored content; included in `/backup` |
| Tasks | `~/.personal-agent/tasks.json`, JSON array with legacy mixed task shapes | Missing means empty; malformed/wrong-root fails closed; atomic replacement, `0600`; task-service CRUD and task creation tools use locked updates | User task data; included in `/backup` |
| Settings | `~/.personal-agent/settings.json`, JSON object merged with defaults on read | Missing means defaults; malformed/wrong-root fails closed; writes merge through a locked atomic update, `0600` | Includes model and voice preferences; included in `/backup` |
| Statistics | `~/.personal-agent/stats.json`, object with counters and `model_usage` | Missing means defaults; malformed/wrong-root fails closed; increments serialize under a per-file process lock and atomically replace, `0600` | Usage metadata; included in `/backup` and restore |
| PDF memory | `~/.personal-agent/pdf_memory.json`, map from document name to text chunks and embeddings | Missing means empty; malformed/wrong-root fails closed; updates/deletes use locked atomic writes, `0600` | May contain extracted document text; excluded from `/backup` |
| PDF files | Multer writes uploads under `uploads/` relative to process working directory; repository also has `documents/` and possibly pre-existing upload files | Upload staging/file retention is not comprehensively managed by PDF memory operations | May contain original documents; excluded from `/backup`; path permissions/cleanup remain unverified |
| Pending confirmations | `~/.personal-agent/pendingActions.json`, JSON array with action payload, preview, expiry and status | Missing means empty; malformed/wrong-root fails; atomic replacement, `0600`; transitions and cleanup are serialized within a process. On restart, a persisted `executing` record becomes `outcome_unknown` when observed by confirmation, lookup or list cleanup; it is never automatically replayed | Highly sensitive action data; intentionally excluded from `/backup` |
| Google OAuth tokens | `~/.personal-agent/gmail_token.json`, token object shared by Gmail and Calendar | Core store merges refresh fields to preserve refresh token; atomic replacement, `0600`; malformed JSON fails explicitly. Legacy `storage/gmailTokenStorage.js` delegates to this store | Secret credential; excluded from `/backup`. OAuth client secrets are environment configuration, not backup data |
| Desktop action history | `~/.personal-agent/desktop_history.json`, JSON array capped at 100 | Missing means empty; malformed data now fails closed; atomic replacement, `0600`; append/clear use locked JSON helper; append remains best-effort for diagnostics | May describe sensitive actions; excluded from `/backup` |
| Screenshots | `~/.personal-agent/screenshots/`, image files | Managed by `services/desktop/ScreenshotService.js`; no unified JSON store/retention policy | Highly sensitive; excluded from `/backup`; permissions and cleanup remain unverified |
| DSA and AI mode state | `dsa_session.json`, `dsa_progress.json`, `ai_mode.json`, paths resolved relative to process current working directory | JSON object roots; missing uses empty/default; malformed/wrong-root fails closed; writes now use atomic replacement and `0600` | Local study/configuration data; excluded from `/backup`; cwd-dependent path is a portability risk |
| Generated task reports | `sorted_tasks.txt`, `day_plan.txt`, relative to process current working directory | Direct text writes/reads in `features/tasks/taskService.js`; not part of task JSON or backup | May contain user task content; writes are not atomic and files are excluded from `/backup` |
| Workflow/business execution state | No persisted workflow checkpoint store found | Workflow execution, email/calendar conversational sessions, OAuth state and working context are process-local; restart cannot resume them | Pending action payloads are the durable confirmation record; no automatic business-action replay exists |

The hidden home directory is the default data root; newly created `~/.personal-agent/` directories request mode `0700` and JSON files request `0600` (existing directory permissions are not changed). The code does not implement encryption at rest. The CLI (`main.js`) and HTTP server (`server.js`) are separate entrypoints that can use the same home data directory; JSON helper locks are process-local, so they do not coordinate those processes. Concurrent CLI/server use or direct file edits can still overwrite one another. Atomic rename prevents readers from observing a partially written individual JSON file; it does not provide a transaction across several files or guarantee power-loss durability of the directory entry on every filesystem.

## Shared JSON guarantees

`storage/jsonFile.js` provides `createJsonFileStore`, `readJsonFile`, `writeJsonFile` and `withJsonFileLock`:

- Missing files are distinguished from malformed JSON and other I/O errors. Existing malformed or wrong-shape data is never silently replaced by a default.
- Shape validation happens before replacement. Updates hold a process-local, per-path lock across read, mutation and write.
- Writes create an exclusive temporary file in the same directory, write and sync it, then rename it over the destination. Personal JSON stores created through the helper use mode `0600`; a newly created data directory requests mode `0700`.
- If serialization/write/rename fails before replacement, the prior destination remains intact and the temporary file is removed when possible.
- These controls apply to the migrated stores listed above. They do not turn separate files into a transaction or provide cross-process locking.

The token and pending-action stores continue to use the lower-level helper directly. Chat history, notes and tasks expose atomic update operations; the main note/task mutation paths use them. Read-then-save operations by external callers can still race with other callers even though each final file replacement is atomic.

## Confirmation recovery and side-effect boundary

The durable confirmation state is `pending → executing → completed|failed`. A live process tracks its executing IDs in memory. If another process instance loads an `executing` record, it changes the record to `outcome_unknown` and retains it for inspection. Confirmation returns an explicit message to check the external service; claiming, cancellation and expiry cleanup do not replay or erase that uncertainty. Expired pending records are removed; active in-process executions are retained even after their confirmation expiry. Expired completed/failed records are eligible for cleanup.

This prevents automatic duplicate execution after restart but cannot determine whether Gmail or Calendar completed a remote action before the crash. The user must reconcile the external service and decide whether to create a new action. Exactly-once external execution is not claimed. A crash can also happen between the remote side effect and persisting `completed`; that outcome remains inherently uncertain without provider-supported idempotency or reconciliation.

There is no persisted workflow/task execution journal. Non-confirmation workflows are not resumed or replayed after restart.

## Backup and restore

`GET /backup` exports version `1.0`: tasks, notes, semantic profile (`memory`), chat history, settings and stats. It excludes pending actions, OAuth tokens/client secrets, projects, preferences, episodic/reflection memory, relationship graph, PDF memory and files, screenshots, generated task reports and process-local state. Backup JSON includes personal conversation, profile and note content; protect exported files accordingly.

`POST /restore` accepts a partial version `1.0` backup (or an unversioned legacy object); its Express parser is explicitly bounded at 1 MB, while other JSON routes remain at 100 KB. The service validates root types, a 1 MB size ceiling, 64-level depth ceiling and 100,000-node ceiling before writing. Unsupported versions and invalid shapes return 400. Each selected store is snapshotted before writes. Writes happen sequentially; a later write failure attempts reverse-order rollback to the snapshots and reports whether rollback completed. Each JSON file replacement is atomic, but the multi-file restore is **best-effort rollback**, not an atomic transaction. A process crash during restore can leave a subset applied. Restore does not import credentials or pending actions and does not delete omitted categories.

Memory deletion through the existing API deletes the semantic/profile key and its derived `user has_property` graph edge. It does not erase same-named preferences/projects, conversation references, PDF text, notes, or backups already exported. No complete account-data erasure contract exists.

## Remaining gaps and next milestone

- No cross-process file lock, database transaction, journal or durable workflow checkpoint exists. Keep a single server process per data directory.
- Several compatibility paths still expose full-array/object `save*` functions. Callers that separately load, mutate and save can lose concurrent changes; move them to store-specific locked update operations before adding background workers or multiple processes.
- Generated text reports, PDF upload staging and screenshot files do not share atomic writes, consistent permissions or a complete retention/cleanup policy.
- Restore is rollback-based rather than crash-atomic across files. The next milestone should add a versioned manifest and staged restore/commit protocol, then audit all remaining read-modify-write call sites. A SQLite migration is not required for this step.
- No encryption-at-rest or retention guarantee is implemented.
