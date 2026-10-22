# Storage, recovery and data integrity

Phase 6 deployment and migration decisions and the Phase 7 single-owner OIDC boundary are documented in [remote deployment and shared-state architecture](SAMGPT_REMOTE_DEPLOYMENT.md). The supported current model remains one host with a local filesystem; the Phase 5 locks do not coordinate multiple hosts. OIDC mode requires an explicit owner manifest and central JSON-store ownership checks; existing data is never assigned automatically.

Audit and implementation completed on 2026-10-18. Paths below are derived from the checked-out source. The application stores data under the process user's home directory in `~/.personal-agent/`, except for explicitly noted current-working-directory and upload paths. No user files or credential values were read during this audit.

## Persistent-store inventory

| Store / logical data | Verified path and format | Read/write behavior and recovery | Sensitivity / backup |
|---|---|---|---|
| Chat history | `~/.personal-agent/chat_history.json`, JSON array of legacy message records | Shared by `storage/historyStorage.js` and `features/chat/chatStorage.js`; missing file means `[]`; malformed JSON or a non-array now raises `JSON_STORAGE_CORRUPT`; atomic replacement, mode `0600`; update helpers coordinate local processes | Conversation content; included in `/backup` |
| Summary | `~/.personal-agent/summary.json`, legacy string or object (normally `{summary}`) | Missing file uses `{summary:""}`; malformed/invalid root fails; atomic replacement, `0600`; no transaction with history compaction | Derived conversation content; included only indirectly in context, not `/backup` |
| Semantic profile | `~/.personal-agent/profile.json`, legacy flat key/value object | Shared by CLI `profileStorage` and `SemanticMemoryStore`; both use one JSON helper. Extracted facts merge by key under the cross-process lock; explicit replacement is retained for restore/reset; malformed or wrong-root JSON fails closed; atomic replacement, `0600` | Personal profile; exported as `memory` in `/backup` |
| Preferences and projects | `preferences.json` and `projects.json`, JSON objects | Persistent maps refresh from disk on reads; updates merge/delete keys under the cross-process lock; missing means empty; malformed/wrong-root fails closed; atomic replacement, `0600` | Personal preferences/project knowledge; excluded from `/backup` |
| Episodic and reflection memory | `episodic.json`, `reflections.json`, JSON arrays of memory objects | Missing means empty; malformed/wrong-root fails closed; atomic replacement, `0600` | Potentially personal; excluded from `/backup` |
| Relationship graph | `relationship_graph.json`, object from subject to edge arrays; legacy string edges are normalized in memory | Missing means empty; malformed/wrong-root fails closed; atomic replacement, `0600`; profile deletion removes its derived `user has_property` edge | Derived personal index; excluded from `/backup`; graph/profile updates are not a multi-file transaction |
| Working memory and activity feed | Process-local map and array (activity capped at 20) | Lost on restart; no file write | Not in backup |
| Notes | `~/.personal-agent/notes.json`, JSON array | Missing means empty; malformed/wrong-root fails closed; atomic replacement, `0600`; note service and built-in note tools use locked update operations | User-authored content; included in `/backup` |
| Tasks | `~/.personal-agent/tasks.json`, JSON array with legacy mixed task shapes | Missing means empty; malformed/wrong-root fails closed; atomic replacement, `0600`; task-service CRUD and task creation tools use locked updates | User task data; included in `/backup` |
| Settings | `~/.personal-agent/settings.json`, JSON object merged with defaults on read | Missing means defaults; malformed/wrong-root fails closed; writes merge through a locked atomic update, `0600` | Includes model and voice preferences; included in `/backup` |
| Statistics | `~/.personal-agent/stats.json`, object with counters and `model_usage` | Missing means defaults; malformed/wrong-root fails closed; increments serialize under cross-process locks and atomically replace, `0600` | Usage metadata; included in `/backup` and restore |
| PDF memory | `~/.personal-agent/pdf_memory.json`, map from document name to text chunks and embeddings | Missing means empty; malformed/wrong-root fails closed; updates/deletes use locked atomic writes, `0600` | May contain extracted document text; excluded from `/backup` |
| PDF files | Multer writes uploads under `uploads/` relative to process working directory; repository also has `documents/` and possibly pre-existing upload files | Upload staging/file retention is not comprehensively managed by PDF memory operations | May contain original documents; excluded from `/backup`; path permissions/cleanup remain unverified |
| Pending confirmations | `~/.personal-agent/pendingActions.json`, JSON array with action payload, preview, expiry and status | Missing means empty; malformed/wrong-root fails; atomic replacement, `0600`; transitions and cleanup use cross-process locks. A persisted `executing` record owned by a dead process becomes `outcome_unknown`; a live claim stays claimed; uncertain actions are never automatically replayed | Highly sensitive action data; intentionally excluded from `/backup` |
| Google OAuth tokens | `~/.personal-agent/gmail_token.json`, token object shared by Gmail and Calendar | Core store merges refresh fields to preserve refresh token; atomic replacement, `0600`; malformed JSON fails explicitly. Legacy `storage/gmailTokenStorage.js` delegates to this store | Secret credential; excluded from `/backup`. OAuth client secrets are environment configuration, not backup data |
| Desktop action history | `~/.personal-agent/desktop_history.json`, JSON array capped at 100 | Missing means empty; malformed data now fails closed; atomic replacement, `0600`; append/clear use locked JSON helper; append remains best-effort for diagnostics | May describe sensitive actions; excluded from `/backup` |
| Screenshots | `~/.personal-agent/screenshots/`, image files | Managed by `services/desktop/ScreenshotService.js`; no unified JSON store/retention policy | Highly sensitive; excluded from `/backup`; permissions and cleanup remain unverified |
| DSA and AI mode state | `dsa_session.json`, `dsa_progress.json`, `ai_mode.json`, paths resolved relative to process current working directory | JSON object roots; missing uses empty/default; malformed/wrong-root fails closed; writes now use atomic replacement and `0600` | Local study/configuration data; excluded from `/backup`; cwd-dependent path is a portability risk |
| Generated task reports | `sorted_tasks.txt`, `day_plan.txt`, relative to process current working directory | Atomic replacement through `writeTextFileAtomic`; last-writer-wins derived outputs; not part of task JSON or backup | May contain user task content; private file mode, excluded from `/backup` |
| Workflow/business execution state | No persisted workflow checkpoint store found | Workflow execution, email/calendar conversational sessions, OAuth state and working context are process-local; restart cannot resume them | Pending action payloads are the durable confirmation record; no automatic business-action replay exists |

The hidden home directory is the default data root; newly created `~/.personal-agent/` directories request mode `0700` and JSON files request `0600` (existing directory permissions are not changed). The code does not implement encryption at rest. The CLI (`main.js`) and HTTP server (`server.js`) are separate entrypoints and now coordinate storage access when they use the same home directory on one host and a supported local filesystem.

## Shared JSON and cross-process guarantees

`storage/jsonFile.js` provides `createJsonFileStore`, `readJsonFile`, `writeJsonFile` and `withJsonFileLock`:

- Missing files are distinguished from malformed JSON and other I/O errors. Existing malformed or wrong-shape data is never silently replaced by a default.
- Shape validation happens before replacement. Reads, writes and updates use a per-directory coordination lock and per-file lock; updates hold both across read, mutation and write.
- Writes create an exclusive temporary file in the same directory, write and sync it, then rename it over the destination. Personal JSON stores created through the helper use mode `0600`; a newly created data directory requests mode `0700`.
- If serialization/write/rename fails before replacement, the prior destination remains intact and the temporary file is removed when possible.
- Lock directories use exclusive creation and record PID, host and random ownership token. Dead same-host owners can be reclaimed through a reclaim marker and atomic directory rename; foreign-host/live owners time out after 10 seconds. Lock data uses `0700` directories and `0600` files.
- The strategy assumes one host and a local filesystem that supports exclusive directory creation and same-directory atomic rename. Network filesystems, synchronized folders and multi-host writers are unsupported. Linux with Node 22 is the tested environment; Windows and macOS were not tested.
- Per-directory serialization is conservative and limits parallel JSON operations. It coordinates cooperating built-in processes, not external file edits or external callers that load, mutate and later use compatibility full-replacement `save*` APIs.
- Each file is synced before rename. Restore manifest and snapshot files are synced before applying data. Directory-entry sync is not performed, so power-loss durability is not claimed; the tested guarantee is process-crash recovery on the tested filesystem.

The token and pending-action stores use the same cross-process lock around transitions and merges. Chat history append/trim, note/task CRUD, PDF memory mutations, profile updates, preference/project/episodic/reflection updates, graph edge changes and stats increments use atomic update operations. Full-replacement APIs remain for import/reset compatibility and must not be used with stale snapshots.

## Confirmation recovery and side-effect boundary

The durable confirmation state is `pending → executing → completed|failed`, or `executing → outcome_unknown` after the recorded local process is gone. A live process tracks its executing IDs in memory and persists its PID/host with the claim. Another live process sees `already_claimed`; it does not prematurely mark the action uncertain. A restarted process with a dead or legacy owner marks the action uncertain and retains it for inspection. Confirmation returns an explicit message to check the external service; claiming, cancellation and expiry cleanup do not replay or erase that uncertainty. Expired pending records are removed; active executions are retained even after their confirmation expiry. Expired completed/failed records are eligible for cleanup.

This prevents automatic duplicate execution after restart but cannot determine whether Gmail or Calendar completed a remote action before the crash. The user must reconcile the external service and decide whether to create a new action. Exactly-once external execution is not claimed. A crash can also happen between the remote side effect and persisting `completed`; that outcome remains inherently uncertain without provider-supported idempotency or reconciliation.

There is no persisted workflow/task execution journal. Non-confirmation workflows are not resumed or replayed after restart.

## Backup and restore

`GET /backup` exports version `1.0`: tasks, notes, semantic profile (`memory`), chat history, settings and stats. It holds the same directory coordination lock while reading all categories, giving a consistent view against cooperating writers. It excludes pending actions, OAuth tokens/client secrets, projects, preferences, episodic/reflection memory, relationship graph, PDF memory and files, screenshots, generated task reports and process-local state. Backup JSON includes personal conversation, profile and note content; protect exported files accordingly.

`POST /restore` accepts a partial version `1.0` backup (or an unversioned legacy object); its Express parser is explicitly bounded at 1 MB, while other JSON routes remain at 100 KB. The service validates root types, a 1 MB size ceiling, 64-level depth ceiling and 100,000-node ceiling before touching live stores. Unsupported versions and invalid shapes return 400.

Restore state machine:

```text
no journal -> stage input + snapshots -> prepared -> applying -> completed -> cleanup
                                      crash/error before completed
                                                -> rolling_back -> verify originals -> cleanup
```

Incoming categories and pre-restore snapshots are private JSON files under `~/.personal-agent/restore-journal/`. A version 1 manifest records category order, state and verified progress. Every snapshot and staged value is present before the first live replacement. Categories apply deterministically: tasks, notes, memory, history, settings, stats. Each replacement is re-read and compared before progress advances; completion is recorded only after all selected categories verify. Startup in both `server.js` and `main.js` rolls back every non-completed journal. Recovery validates all snapshots before its first write, applies them in reverse order, verifies originals and then removes the journal. A repeated or interrupted rollback reapplies the same snapshots and is idempotent. A directory without a manifest is treated as an interrupted pre-apply stage and removed. A corrupt manifest or missing/corrupt snapshot fails startup and preserves the journal, preventing normal access to a potentially mixed dataset.

This is process-crash-recoverable rollback, not a multi-file atomic transaction. The same-host directory coordination lock blocks cooperating store reads/writes throughout restore and recovery. Restore excludes credentials and pending actions and does not delete omitted categories. Power loss, hardware failure and unsupported network filesystems are outside the guarantee.

Memory deletion through the existing API deletes the semantic/profile key and its derived `user has_property` graph edge. It does not erase same-named preferences/projects, conversation references, PDF text, notes, or backups already exported. No complete account-data erasure contract exists.

## Remaining gaps and next milestone

- Full-array/object compatibility `save*` functions remain intentional replacements. External load/mutate/save sequences can still overwrite newer state; built-in mutation paths use locked operations.
- Writer audit: tasks/notes/chat and persistent memory mutations, profile/contact updates, graph edges, settings, stats, PDF memory, pending confirmations and OAuth token merges use the shared lock for read-modify-write. Generated task reports use an atomic locked replacement. No append-only file writer was found; chat/episodic/reflection/pending/desktop history appends are JSON updates under the lock. Direct writers outside it are limited to multer upload staging, screenshot image generation, OS/voice pipes and test fixtures; uploads/screenshots are excluded from the backup/transaction contract. Process-local activity/working-memory arrays are not persistent stores.
- CWD-relative DSA/AI-mode files are separate when CLI/server launch from different directories. PDF upload staging and screenshots remain outside JSON coordination and lack complete retention/cleanup. Workflow checkpoints are not persisted.
- The local same-host lock supports concurrent CLI/server use for migrated JSON paths on a supported local filesystem. Do not use network/synchronized storage, multiple hosts, direct edits or stale compatibility snapshots concurrently.
- No encryption-at-rest or retention guarantee is implemented.
