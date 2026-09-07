# Security model

This is a research implementation. It is not certified, clinically validated, or a replacement for hospital governance.

## Implemented controls

- Per-route authorization for five roles. Security and biomedical responses omit patient demographics and unauthorized evidence streams. Researchers cannot record operational reviews. Only administrators register patients/devices. SIEM exports omit names, observations, and free-text notes.
- Eight-hour opaque sessions, with SHA-256 token digests persisted in SQLite. Cookies are HttpOnly and SameSite=Strict; Secure is enabled when APP_ORIGIN uses HTTPS. Logout revokes the server-side session.
- Passwords use scrypt with a random salt. Local setup generates unique administrator, encryption, ingestion, and model-service secrets. No usable credential is committed.
- Mutating browser APIs verify Origin against APP_ORIGIN. Bearer-only ingestion does not use browser cookies. Structured input validation, 64 KB streamed-body limit, numeric ranges, and database-backed rate limits protect ingestion and actions.
- AES-256-GCM with a random nonce encrypts record and audit payloads before SQLite writes. IDs, collection names, timestamps, account metadata, and session indexes remain plaintext. This is **payload encryption**, not full-database encryption. Put the data volume and backups on encrypted storage to meet the PDF's full at-rest requirement.
- Audit rows have keyed chained hashes; SQLite triggers reject UPDATE/DELETE. This detects record modification and internal deletion during verification. It does not establish an independently trusted head, detect removal of a valid tail by an attacker with file access, or resist an attacker holding both the database and encryption key. Use externally anchored, immutable audit retention for production.
- Patient/device association validation, UTC normalization, ingestion deduplication, a five-minute evidence window, evidence IDs, provenance, model version capture, and optimistic concurrency checks preserve traceability.
- The app never issues a treatment, device-setting, or network-containment command.
- Every alert write also appends an encrypted evidence/model snapshot to `alert_versions`, whose triggers reject updates and deletes. Human review preserves the inspected version and does not erase previous explanations. Received vital observations update the patient view only when newer than the stored timestamp for that measurement.

## Deployment requirements

When demo mode is disabled, existing demo sessions are rejected and researcher accounts receive no clinical record arrays or SIEM export. They retain model-insight access. Institution-approved de-identification must be implemented before widening research access to real records.

1. Set ENABLE_DEMO=false. Demo access deliberately permits any local visitor to assume a synthetic role and must never coexist with real patient data.
2. Set a canonical HTTPS APP_ORIGIN; terminate TLS using a trusted reverse proxy. HTTP loopback is supported for local testing only.
3. Keep DATA_ENCRYPTION_KEY in a secret manager, separately backed up. Losing it makes encrypted payloads unrecoverable. Key rotation needs an explicit decrypt/re-encrypt migration; replacing the environment value alone is not rotation.
4. Use one persistent Node instance for the embedded SQLite database. Do not use ephemeral serverless storage, NFS, multiple replicas, or an unbacked container filesystem.
5. Restrict the model service to loopback/private networking. It loads only operator-produced artifacts. Never load uploaded pickle/joblib files or untrusted model artifacts.
6. Back up SQLite using its backup interface or a stopped application; do not copy only the DB file while ignoring active WAL state.
7. Extend institution-specific authorization, account lifecycle, MFA/SSO, retention, trusted audit export, monitoring, and load testing before real deployment.

The API's rate limiter protects this single-instance prototype. It is not a substitute for a gateway/WAF or institution-wide abuse controls. The minimal CSP disables embedding, plugins, and foreign form destinations; it does not provide a strict nonce-based script policy.

Report vulnerabilities privately through the repository owner's GitHub contact channels; do not post credentials or patient data in public issues.
