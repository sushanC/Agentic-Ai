# Technical debt notes

`storage/profileStorage.js` and `features/memory/stores/SemanticMemoryStore.js` preserve one legacy flat `profile.json` format. Built-in semantic key updates merge under the shared cross-process store lock; explicit replacement remains for restore/reset. Profile and relationship graph updates are separate files and do not form a general multi-file transaction.

## Remaining persistence limits

- Public full-replacement `save*` functions remain for compatibility. Callers that load, mutate and later save a snapshot can overwrite intervening updates; built-in CRUD/update paths have been migrated to atomic store mutations.
- Coordination assumes cooperating processes on one host and a local filesystem. Network/synchronized folders and multi-host use are unsupported. Directory-entry sync is not performed, so sudden power loss is outside the restore guarantee.
- DSA and AI-mode files remain current-working-directory relative. Their paths differ if CLI and server start from different directories.
- PDF uploads and screenshots are outside JSON coordination and lack complete retention/cleanup handling. Generated task reports use locked atomic replacement but remain last-writer-wins outputs.
- Workflows are not persisted for resume. A pending action that was executing at process death becomes `outcome_unknown`; no uncertain remote operation is replayed.

See [storage and recovery](SAMGPT_STORAGE_AND_RECOVERY.md) for the writer inventory, restore protocol, supported assumptions and failure-injection evidence.
