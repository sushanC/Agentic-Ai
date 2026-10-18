# Technical debt

## Profile and semantic memory share a file

`storage/profileStorage.js` and `features/memory/stores/SemanticMemoryStore.js` intentionally preserve the same legacy flat `profile.json` format. Phase 4 routed both through `storage/jsonFile.js`; semantic key updates merge under the per-file process lock, and CLI extraction uses `updateProfile()` to avoid rewriting a stale startup snapshot. The overlap remains as a compatibility boundary, not two independent disk writers.

Remaining limits: full profile replacement is still supported for restore/reset, locks are process-local, and profile replacement plus relationship-graph reconciliation spans two files. See [storage and recovery](SAMGPT_STORAGE_AND_RECOVERY.md).
