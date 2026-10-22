# Remote deployment and shared-state architecture (Phase 6)

Audit date: 2026-10-18. Scope: checked-out Node.js backend, route registration, storage helpers and existing Phase 1–5 documentation/tests. This is a source audit and design decision, not a penetration test, deployment validation, or claim that remote access is ready.

## Decision

**Initial target topology: A — one Linux server, one backend process, multiple client computers, persistent local filesystem.** Multiple clients do not require multiple backend instances. Use one supported Linux host, Node.js 22, one service process, and a local filesystem on a persistent disk. Continue to use the existing JSON stores and Phase 5 same-host lock/recovery layer as the authoritative store. The lock layer serializes cooperating readers/writers on that host; it is not a distributed lock. Keep port 3001 bound to loopback and require a private-network HTTPS reverse proxy only after the authentication and authorization release gates below are implemented and tested.

This application has no app-user identity or ownership model today. All JSON stores resolve under the backend OS account's `~/.personal-agent/`; any request reaching the current API can read or mutate that account's data. Multiple client computers can share that single account only after authenticated API access exists. Do not treat Google OAuth as API login: it authorizes the server to use the operator's Gmail/Calendar account. `Origin` and CORS checks also do not authenticate clients.

**Database decision for this topology: no database migration in this phase.** A single backend and local persistent disk do not justify PostgreSQL, and replacing the existing files before identity/ownership is designed would add migration risk without enabling the requested client topology. JSON remains authoritative. SQLite is the first database candidate if transactional multi-record workflows or query needs outgrow JSON while deployment remains one host/one instance; it needs a local disk and explicit schema/import/rollback migration. Do not place SQLite on a network filesystem. PostgreSQL is the preferred evaluation for multiple backend instances, multiple hosts, or centrally coordinated concurrent writes; it is not selected or deployed here.

| Topology | Storage and concurrency | Identity and isolation | Recovery, backup and operations | Decision |
|---|---|---|---|---|
| **A. One server, many clients** | Local persistent filesystem. Existing JSON store locking supports cooperating same-host processes; one service process is the supported runtime shape. | Remote use needs an established OIDC identity provider and application authorization. Current global stores are single-owner and cannot safely serve multiple accounts. | Keep Phase 5 restore journal, startup recovery and local backups. Protect host disk and backups; monitor disk, service and recovery failures. | **Recommend, gated.** Existing API remains loopback-only until auth, authorization, data ownership and remote route tests exist. |
| **B. Multiple backend instances/hosts** | PostgreSQL with transactions, constraints, indexes and explicit migrations. Store artifacts in object storage or a deliberately shared artifact service. JSON locks do not coordinate hosts; SQLite/network filesystems are not a substitute. | Shared OIDC identity and authorization required at every instance. | Central backup/PITR, migration coordination, health/rollout strategy, secret management and distributed action-claim semantics required. | **Unsupported.** No distributed database, locking, artifact store, or multi-host recovery implementation exists. |
| **C. Local-first client data** | Each computer owns its local data; synchronization requires a separately specified conflict and merge protocol. | Local OS identity may protect local files, but does not define remote account identity. | Device-level backups plus explicit sync/conflict recovery; server may not be authoritative. | **Unsupported/not selected.** No sync protocol or conflict resolution exists. |

## Trust boundary and current API

`server.js` installs request-ID context, `createLocalApiGuard`, CORS, bounded JSON parsing, then registers routes. It explicitly listens on `127.0.0.1:3001`. The guard rejects non-loopback peers and disallowed browser origins. These are useful local-only controls, not authentication. `SAMGPT_ALLOWED_ORIGINS` is an exact origin allowlist and must not be interpreted as access control. Do not change the bind address or use an untrusted `X-Forwarded-For` value to decide whether a request is local.

The code has no API login/session/JWT middleware and no user IDs in stored records. Google OAuth state is in-process, short-lived, one-use state for linking provider credentials; it does not identify the API caller. Provider API keys and Google client secrets come from environment configuration. Google OAuth tokens are stored in `~/.personal-agent/gmail_token.json`, outside ordinary backups. There is no evidence of a configured TLS proxy, trusted-proxy policy, remote identity provider, account provisioning, token revocation, or secret rotation workflow.

### Route capability inventory

All routes below are currently behind the local-only guard. Every data route is effectively owned by the one server OS account, not by a request user.

| Route group | Capabilities and risk |
|---|---|
| `/chat`, `/chat/stream`, `/history` | Reads and changes global chat history/memory; invokes model and tool workflows. May create external or desktop actions. |
| `/voice` and `/audio/devices` | Uses server audio hardware and voice processing. Remote client/server hardware ownership is not modeled. |
| `/memory` | Reads and deletes global semantic memory. |
| `/notes`, `/tasks`, `/settings`, `/stats`, `/activities` | Reads or mutates global user content/settings/usage. |
| `/pdf/*` | Uploads, lists, searches, asks about, acts on, and deletes documents. Current identifier is a client-influenced PDF name; uploads use Multer `uploads/` relative to process working directory. No per-user artifact boundary exists. |
| `/backup`, `/restore` | Exports personal data or replaces selected global stores. Restore has a journal and rollback/recovery behavior, but is a privileged operation. |
| `/confirm`, `/cancel`, `/pending`, `/email/provide-input` | Lists/claims/cancels durable pending actions; confirmation may send email, modify calendar state, or perform another registered action. Claims prevent re-execution after uncertain outcomes. |
| `/gmail/*`, `/google/*`, `/calendar/status` | Starts and completes provider OAuth linking for the server operator and reports Gmail/Calendar status. Callback is an OAuth protocol endpoint, not general API authentication. Tokens are shared by Gmail/Calendar. |
| `/models`, `/models/health`, `/models/test/:key`, `/models/capabilities` | Exposes provider/model status and settings; model test spends provider resources and returns generated output. Capabilities/settings affect global behavior. |
| `/desktop/history`, `/desktop/system-status`, `/desktop/screenshot/:filename` | Reads server desktop-action history, local system diagnostics, or a server screenshot. Screenshot contents and system facts are sensitive; these routes must remain local/privileged. Desktop tools address the server host, not the client machine. |
| `/audio/devices` | Queries server audio hardware; a remote client cannot assume the server has the client's devices. |

Feature routers add chat, voice, note, task, memory, PDF and settings routes. The repo contains no Electron renderer/preload/bridge source to establish an alternate trusted client boundary. The server process also initializes voice management, further tying current behavior to one host.

## Remote authentication and authorization design

Remote access is **not implemented**. Before any remote network binding or proxy exposure, implement and test:

1. **OIDC authentication, not a new password protocol.** Use an established identity provider and a maintained OIDC/JWT verification library. Validate issuer, audience, signature, expiry and not-before; use stable subject (`sub`) as principal. Do not accept caller-supplied identity headers unless a specifically trusted proxy strips incoming copies, injects verified identity, and is the only network path to the app. Prefer app-side token verification or a tightly constrained trusted-proxy adapter with explicit proxy addresses.
2. **Explicit deployment mode and fail-closed startup.** Keep loopback as default. Remote mode must refuse to start unless issuer/audience, TLS/proxy trust, allowed origin policy, and required authorization configuration are present. The application must remain unreachable except through the configured HTTPS reverse proxy; proxy-to-app traffic stays on loopback or a private socket/network. Never trust forwarded host/protocol/client-IP headers from arbitrary peers.
3. **Ownership before multi-user access.** Add principal/tenant ownership to every user-owned record and artifact, and scope every query/mutation by authenticated principal. Existing JSON is one owner's data. A migration to multiple users must explicitly assign existing data to one configured owner; never infer ownership from client-supplied IDs or expose the global stores to every authenticated account. Until that migration exists, allowlist exactly one configured operator identity and deny other identities.
4. **Route permissions.** Require authenticated identity for all data and provider routes. Separate ordinary read/write from privileged actions. Gate restore, backup export, pending-action list/confirm/cancel, desktop control, Gmail/Calendar linking and actions, model tests/configuration, and diagnostics with explicit permissions and audit events. A confirmation ID is not authorization; pending actions need owner IDs before multi-user use. Desktop control should be disabled for remote sessions unless a separate explicit policy safely addresses the server machine.
5. **Browser and request controls.** Exact CORS allowlist and Origin checks remain useful defense in depth. Add CSRF protection if browser cookies are used; bearer tokens avoid ambient-cookie CSRF but still require XSS controls. Keep JSON body limits; add route-specific upload byte limits, verified PDF type/content checks, request timeouts, and rate limits for login, chat/model use, OAuth initiation and expensive operations. Reject malformed inputs early and return generic errors with request IDs.
6. **Secrets and sessions.** Keep provider keys and OAuth client secrets in a host secret manager or protected service environment; never in JSON application tables, export backups, logs or client config. Protect Google refresh tokens with OS/service-account file permissions or a dedicated encrypted secret store. Define expiry, rotation, revocation and incident response for OIDC sessions and provider credentials before rollout. Do not log bearer tokens, OAuth codes, prompts, memory, file contents, or sensitive paths.
7. **TLS and proxy.** Terminate HTTPS at a maintained reverse proxy on a private network/VPN. Configure trusted proxy hops explicitly; do not enable blanket Express proxy trust. Preserve loopback binding unless a reviewed deployment needs a private socket. CORS is not a network firewall or authentication mechanism.

Required release tests include anonymous rejection, invalid/expired/wrong-audience tokens, allowed and denied principals, cross-user read/write attempts for every data group and artifact, privileged-route denial, spoofed identity/forwarded headers, CSRF if cookies, upload size/type limits, rate limits, safe errors/logs, and verification that direct backend access remains unavailable remotely. Do not test with real emails, calendar mutations, or destructive desktop commands.

## Persistence and incremental migration plan

| Data group and current authoritative location | Owner/access boundary today | Validation and concurrency | Backup/recovery and future migration |
|---|---|---|---|
| Chat history and summary: `~/.personal-agent/chat_history.json`, `summary.json` | One server OS account; globally visible through chat/history endpoints. | JSON shape checks, atomic writes, Phase 5 local-host lock; chat update paths use locked operations. | History included in `/backup`; summary excluded. Keep JSON as source for A. If DB is later justified, import with explicit owner, row counts/checksums and read-only source snapshot; transactionally insert messages then switch one store at a time. |
| Profile/semantic memory: `profile.json`, `memory.json`; preference/project/episodic/reflection stores and `relationship_graph.json` | One global owner; memory API and chat capabilities can read or mutate. | Store-level shape validation and local-host locks; graph/profile derived updates span files and are not a single transaction. | Profile/semantic memory included in current backup; other memory stores/graph excluded. Migration must preserve IDs/keys, graph references and derived-state consistency; use a staged import and reconciliation report. |
| Notes/tasks/settings/stats: `notes.json`, `tasks.json`, `settings.json`, `stats.json` | One global owner; corresponding routes permit read/write. | JSON shape validation and locked updates; task legacy shapes remain accepted. | Included in current `/backup` and restore. Import each category with versioned mapping and validation; rollback via original snapshots/restore journal. |
| PDF metadata/chunks: `pdf_memory.json` | Global map keyed by document name; accessible via PDF routes. | JSON local-host lock; file and metadata are not one transaction. | Excluded from backup; migration must use stable artifact IDs and retain chunk text/embedding compatibility. Build artifact manifest and checksums before moving data. |
| Pending confirmations and `outcome_unknown`: `pendingActions.json` | Global list; IDs are currently not tied to a user. | Locked transitions, owner PID/host and Phase 5 unknown-outcome handling. | Excluded from normal backup. Never replay `executing`/`outcome_unknown`. Migration must preserve status, expiry, payload and uncertainty and must not make an old action newly executable. Add owner identity before multi-user. |
| Workflow/session state | Mostly process-local; no durable workflow checkpoint. | No resume/concurrency persistence contract. | No migration until workflow checkpoint and idempotency semantics are designed. Never replay side effects after crash. |
| Restore journal: `~/.personal-agent/restore-journal/` | Server-wide privileged recovery metadata. | Durable staged snapshots, explicit manifest, startup rollback under same-host lock. | Keep journal and recovery behavior intact. Per-user restore needs scoped category transactions and authorization before it can be enabled for a multi-user database. |
| Google OAuth token: `gmail_token.json`; provider keys/client secrets in environment | One server operator's provider credentials, not application-user credentials. | Token file is private and writes are atomic/locked; env secrets have no in-app lifecycle. | Excluded from ordinary backups. Keep outside app tables and user imports. Multi-user Google linking requires per-principal OAuth credentials and encrypted secret storage, a separate design. |
| DSA/session, AI mode: CWD-relative `dsa_session.json`, `dsa_progress.json`, `ai_mode.json`; generated task reports `sorted_tasks.txt`, `day_plan.txt` | Process working directory/global files, not the home storage root. | JSON helper or atomic report write; runtime location varies with launch directory. | Excluded from backup. For server deployment, configure a stable data root and migrate/copy with checksums only after backup; do not silently relocate or overwrite. |
| Uploads/PDF binaries and screenshots | Upload staging at CWD-relative `uploads/`; screenshots under `~/.personal-agent/screenshots/`; desktop screenshot targets server host. | No unified artifact manifest, per-user auth, full retention, or backup contract. PDF metadata and binaries can diverge. | Separate artifacts from structured DB state; assign random IDs and store owner, media type, byte count, digest, created time and retention status in metadata. Validate content and size, enforce path containment, authorize every get/delete, atomically stage then publish, and delete metadata/binary consistently. For topology A use a private local artifact directory and explicit backup/integrity checks. Object storage is a later option, not present now. |
| Desktop history and process-local activity/working memory | `desktop_history.json`; activity/working-memory mostly process-local. Desktop methods operate on server host. | Desktop history uses local locks; activity may be lost at restart. | Keep local-only; do not make the server's filesystem, clipboard, screenshot, power controls available to remote clients without a separate threat model. |

### Safe migration sequence if SQLite becomes necessary

1. Freeze the schema decision and data ownership model first. Keep JSON authoritative during migration tool development; never run dual writes.
2. Build an offline, repeatable importer that takes a consistent local snapshot under the existing directory lock, validates every source file, writes a new SQLite database at a temporary path, preserves one explicit owner, and reports source/destination counts plus checksums. Do not import secrets, OAuth tokens or provider keys.
3. Run importer twice against test fixtures; verify idempotence or require a new empty DB. Inject failures before/after commit and ensure the original JSON is untouched and the partial DB is discarded/quarantined.
4. Back up JSON and database; do a single maintenance-window cutover with application writes stopped. Verify imported records, graph links, pending-action statuses and `outcome_unknown` state before enabling the database adapter.
5. Rollback means stop writes, restore the pre-cutover JSON snapshot and restart the old adapter. Never attempt simultaneous JSON+DB writes or automatic reverse sync. Keep old JSON snapshot until acceptance and a defined retention period.

For future SQLite: one host/one instance, local filesystem, WAL/transaction configuration verified for the actual filesystem, foreign keys and constraints enabled, schema version table, explicit migrations, bounded transactions, and tested backup/restore. A SQLite file on NFS/SMB/sync folders is unsupported. For B, use PostgreSQL transactions for data/action claims and a migration tool with forward/backward operational plan; exactly-once external effects remain unclaimed without provider idempotency.

## Artifact access and rollout gates

Current artifacts are not ready for remote multi-user access. PDF upload uses a relative staging directory and a filename-like metadata key; screenshots include server-host screen contents and return base64/path information through tool flows. Generated reports are CWD-relative. Before remote support, use opaque artifact IDs, never client-provided paths; validate extension, declared MIME and file signature; enforce a byte limit and decompression/parser limits; use private directories; avoid returning server paths; authorize each artifact by owner; define deletion propagation and retention; and make artifact backups separately verifiable. PDFs, screenshots and reports may contain personal data and must not be exposed through static hosting.

**Phase 6 status (superseded by the Phase 7 implementation note below): local-only.** The backend was loopback-bound and had no API identity at that audit point. Public exposure is out of scope. Phase 5 rollback, startup recovery, cross-process locks and `outcome_unknown` behavior remain required.

## Evidence and limits

Inspected `server.js`, `services/httpSecurity.js`, route modules for chat/voice/notes/tasks/memory/PDF/settings, storage path/store helpers, backup and restore documentation, Phase 1–5 security/reliability docs and existing test coverage. `server.js` registers a loopback guard and listens on `127.0.0.1:3001`. The npm dependencies include Express, CORS and Multer but no OIDC/API-auth library. Route tests cover chat behavior but not all production routes. No frontend/Electron client implementation, reverse proxy, remote host, object store, deployment service unit, secret manager, or multi-user identity configuration was found in the inspected repository. Do not infer their behavior from this audit.

## Phase 7 implementation: provider-neutral single-owner OIDC

Phase 7 adds an OIDC resource-server mode while preserving `SAMGPT_AUTH_MODE=local` as the default. OIDC mode validates signed bearer access tokens with the maintained `jose` package using the configured issuer, audience, HTTPS JWKS URI, `RS256`/`ES256` allowlist, required `exp`/`iat`/`sub`, five-second clock tolerance, and a maximum token age of 15 minutes. No API passwords, client secret, app cookie session, or new login protocol are stored by samGPT. Clients obtain short-lived access tokens from their chosen identity provider and send `Authorization: Bearer …`. The verifier uses cached remote JWKS keys and does not use token-supplied key URLs.

The identity provider has **not been selected**. The backend is provider-neutral. Minimal viable choices are:

- **Authentik**: self-hosted OIDC provider; configure a signing key, JWT access tokens, an audience for `samgpt-api`, and `samgpt:owner` plus `samgpt:admin` scopes. Confirm the provider's discovery `issuer` and JWKS URL match the values configured in samGPT. Authentik documents provider-specific issuer and JWKS behavior in its [OAuth2 provider documentation](https://docs.goauthentik.io/add-secure-apps/providers/oauth2).
- **Keycloak**: self-hosted OIDC provider; configure a realm/client, JWT access tokens, audience mapper for `samgpt-api`, and the two scopes. Obtain issuer and JWKS URI from that realm's OIDC discovery metadata. Keycloak describes securing applications with OIDC in its [official guide](https://www.keycloak.org/securing-apps/oidc-layers).
- **A managed OIDC provider** such as Auth0 or Microsoft Entra ID: use only if it can issue a signed JWT **access token** for the API audience with the required scopes and stable subject. Verify claim shape, signing algorithms, issuer, key rotation and short expiry with that provider before configuration.

Any selected provider must issue a JWT access token with `iss`, `aud`, `sub`, `iat`, `exp`, and a space-separated `scope` or array `scp` claim. Every API token needs `samgpt:owner`; privileged routes also need `samgpt:admin`. An ID token for a login client is not a substitute for an API access token. No provider-specific production credentials are committed or selected.

### OIDC configuration

Local mode remains the default and requires none of these variables. To configure a private deployment, set all of the following in the service environment:

```dotenv
SAMGPT_AUTH_MODE=oidc
SAMGPT_OIDC_ISSUER=https://identity.example/tenant
SAMGPT_OIDC_JWKS_URI=https://identity.example/tenant/keys
SAMGPT_OIDC_AUDIENCE=samgpt-api
SAMGPT_DATA_OWNER_SUBJECT=<stable-sub-claim>
SAMGPT_OWNER_SCOPE=samgpt:owner
SAMGPT_ADMIN_SCOPE=samgpt:admin
SAMGPT_PUBLIC_ORIGIN=https://samgpt.example
SAMGPT_ALLOWED_ORIGINS=https://samgpt.example
SAMGPT_TRUSTED_PROXY_ADDRESSES=127.0.0.1
```

The issuer, audience, JWKS URL, public origin and owner subject are required in OIDC mode; startup fails closed if any value is missing, if the owner manifest does not match issuer and subject, or if the public origin is not in the CORS allowlist. The JWKS and issuer URLs must use HTTPS. `SAMGPT_TRUSTED_PROXY_ADDRESSES` accepts explicit loopback addresses only for this one-host design. The backend still listens on `127.0.0.1:3001` and Express proxy trust remains disabled. The proxy guard accepts requests only from that configured local proxy, with the exact public Host and `X-Forwarded-Proto: https`; it does not read `X-Forwarded-For`, `Forwarded`, or `X-Forwarded-Host`.

The repository does not contain a reverse-proxy or service deployment configuration. Before a private-network pilot, configure a maintained proxy to terminate HTTPS, overwrite `Host` and `X-Forwarded-Proto`, forward `Authorization`, and proxy only to `127.0.0.1:3001`. A starting Nginx template (replace certificate paths, hostname and private-network allow rules) is:

```nginx
# In http {}:
limit_req_zone $binary_remote_addr zone=samgpt_api:10m rate=60r/m;

server {
    listen 80;
    server_name samgpt.example;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name samgpt.example;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_certificate     /etc/ssl/certs/samgpt.fullchain.pem;
    ssl_certificate_key /etc/ssl/private/samgpt.key;
    client_max_body_size 11m;
    # Add allow/deny rules for the intended private network or VPN here.

    location / {
        limit_req zone=samgpt_api burst=30 nodelay;
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Authorization $http_authorization;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Host "";
        add_header Strict-Transport-Security "max-age=31536000" always;
    }
}
```

The app does not trust the forwarded-for value. The proxy must overwrite the forwarded-proto and host values; test this behavior with the selected proxy version. Add TLS certificate renewal and firewall/VPN allowlisting. The app's proxy guard and OIDC tests do not establish that an actual TLS endpoint or firewall is configured.

### Existing-data ownership adoption

The current storage is one global dataset, not per-record multi-tenant data. Phase 7 defines it as a **single-owner partition**: exactly one configured OIDC `sub` owns all application data. Every protected request must have that exact issuer and subject. All application JSON operations also pass through the central JSON helper's request-context owner check; request handlers cannot use a different principal to access history, memory, notes, tasks, settings, PDFs, pending actions, backup/restore journal files, or generated text outputs. Provider credentials (`gmail_token.json`) and the owner manifest are separate system data and are never imported into a user backup.

No owner is guessed. Before enabling OIDC, an operator must deliberately assign the existing data to one identity. Back up the existing data first, then run as the same OS user that runs the service:

```sh
SAMGPT_OIDC_ISSUER='https://identity.example/tenant' \
SAMGPT_DATA_OWNER_SUBJECT='<stable-sub-claim>' \
node scripts/adoptDataOwner.js I_CONFIRM_DATA_OWNER_ADOPTION
```

This creates `~/.personal-agent/data-owner.json` with mode `0600` using exclusive creation; it refuses to replace an existing owner. The data directory must already be private (mode `0700` on Linux); the command and startup fail if its permissions are broader and do not silently change them. Tighten an existing directory explicitly after inspecting it. The command is an operator attestation that **all current data** belongs to that identity. If that claim is not known to be true, do not run it or enable OIDC. This release does not support multiple users, data sharing, or owner reassignment. A transfer to a different subject requires a stopped service, verified backup, explicit offline ownership-transfer procedure, and rollback of the manifest plus data from that backup. No data was adopted during implementation; tests used temporary directories.

The owner manifest does not alter the existing JSON formats. The one-time adoption is reversible before remote use by returning to local mode; the manifest can remain in place. After remote use, to roll back, stop the service, restore the pre-pilot backup if data changed, switch `SAMGPT_AUTH_MODE=local`, and keep the service loopback-only. Never change only `SAMGPT_DATA_OWNER_SUBJECT` to transfer access; startup will fail on manifest mismatch.

### Route authorization matrix

In local mode the previous loopback-only behavior remains. In OIDC mode only the exact method/path patterns below are classified; unmatched routes and methods return 403. CORS `OPTIONS` preflight is handled before bearer authorization and exposes no data.

| Classification | Routes | Required access |
|---|---|---|
| **Public protocol callback** | `GET /gmail/callback`, `GET /google/callback` | HTTPS trusted proxy plus existing one-use, expiring OAuth state validation. These routes do not accept API bearer identity because they are provider redirects. |
| **Owner-scoped** | `GET /history`, `GET /chat/history`; `GET/POST /notes`, `PUT/DELETE /notes/:id`; `GET/POST /tasks`, `PUT/DELETE /tasks/:id`; `GET/DELETE /memory[/key]`; `GET /activities`, `GET /stats`; `GET /pdf/list`, `GET /pdf/search`, `POST /pdf/upload`, `POST /pdf/ask`, `POST /pdf/action`, `DELETE /pdf/:name` | Matching issuer and configured owner subject plus `samgpt:owner`; central data-access check additionally binds each request's file access to that issuer/subject. |
| **Administrator-only** | `POST /chat`, `POST /chat/stream`, `POST /voice`; `GET/POST /settings`; `GET /backup`, `POST /restore`; `POST /confirm`, `POST /cancel`, `GET /pending`, `POST /email/provide-input`; `GET /gmail/status`, `GET /gmail/auth`, `GET /calendar/status`, `GET /google/auth`; `GET /models`, `GET /models/health`, `POST /models/test/:key`, `GET /models/capabilities`; `GET /audio/devices`; `GET /desktop/history`, `GET /desktop/system-status`, `GET /desktop/screenshot/:filename` | Matching issuer and owner subject, both `samgpt:owner` and `samgpt:admin`. Chat and voice are admin because they can route to email/calendar/desktop capabilities. |
| **Default deny** | Every other path/method | 403 in OIDC mode, including newly added routes until explicitly classified. |

The API does not support a second owner account. Therefore, “cross-user isolation” means another valid OIDC subject is denied before handlers run, while JSON data-access checks independently reject a mismatched request principal. Confirmation remains admin-only; pending records retain their existing claim and `outcome_unknown` rules and are not replayed. Backup and restore remain admin-only and keep their existing restore journal. Gmail tokens remain outside backups and the user JSON ownership migration.

### Additional controls and remaining blockers

- JSON request limits remain 100 KiB, restore JSON remains 1 MiB. PDF uploads are staged under `~/.personal-agent/uploads/` with a 10 MiB file cap, one-file/20-field limits, 64 KiB field cap, PDF MIME/extension check, `%PDF-` signature check, 100-page parser limit, 25-page OCR limit, per-request temporary OCR directories and cleanup. The upload directory is private mode `0700`.
- Authenticated traffic is limited per OIDC subject to 120 requests/minute, expensive chat/PDF/model routes to 20/minute, and restore to 3/minute. These in-memory limits reset on restart and are per-process; invalid credentials and perimeter traffic need proxy-level rate limiting. They are not a distributed quota.
- Express `trust proxy` is disabled. OIDC mode requires a loopback proxy request with HTTPS proto and configured Host; forwarded client-IP headers are ignored. Error middleware returns generic bodies and safe error codes. Authorization failures do not log tokens or raw provider errors.
- The short-lived API bearer token is not stored by samGPT; token expiry is validated and maximum token age is 15 minutes. Immediate token revocation is not implemented by the API; configure short access-token lifetimes at the identity provider and revoke provider sessions there. No app cookie is used, so there is no ambient-cookie CSRF session.
- `npm audit --omit=dev` after compatible fixes still reports 5 production vulnerabilities (4 high, 1 critical) through the `@xenova/transformers` → `onnxruntime-web`/`onnx-proto`/`protobufjs`/`sharp` dependency chain. The available npm fix would move `@xenova/transformers` to 1.4.2, a major-version change from the current 2.x dependency. This was not applied; replace or deliberately migrate/test that ML dependency before production remote exposure.
- Unit/integration tests generate a temporary signing key and serve a local JWKS endpoint. They validate JWT cryptography and route policy, not a real provider, provider account setup, client PKCE flow, actual TLS proxy, firewall, remote network access, or production secret configuration.
- **Remote access is not ready to enable.** Blockers: choose/configure the IdP and verify its token claims; implement the client Authorization Code + PKCE flow; configure and test a real HTTPS reverse proxy and firewall/VPN; decide and perform the explicit existing-data owner adoption; add proxy invalid-token/request rate limits; run a private-network review with the selected provider. The backend remains bound to loopback in code.

### Phase 7 verification record

On Node.js v22.23.2, verification completed with:

- `npm test` — 52 tests passed across Phase 1, 2, 3, 4, 5 and 7 (Phase 7 contributes 8 tests).
- `node tests/phase1/security-integrity.test.js && node tests/phase7/remote-access.test.js` — 17 tests passed.
- `node core/calendar/__tests__/tests3_15_all.js` — 89 passed.
- `node scratch/test_error_fallback_system.js` — 38 passed.
- `node --check` on all changed JavaScript files and `git diff --check` — passed.
- `npm audit --omit=dev` — 5 vulnerabilities remain as described above; the command exits nonzero for these advisories.

The authentication tests use generated signing keys and a local-only JWKS server; they do not contact an identity provider. No provider credentials, live email, calendar mutation, destructive desktop operation, or remote deployment was used.

