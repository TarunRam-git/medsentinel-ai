# MedSentinel AI implementation plan

Based on the supplied MedSentinel AI review-one documentation. This repository implements a research prototype, not a validated medical device.

## Product scope

- Next.js App Router UI and authenticated HTTP API.
- Hospital overview, alert investigations, patient context, device inventory, model evaluation, integration status, and audit history.
- Durable SQLite storage with AES-256-GCM encrypted evidence payloads, hashed sessions, role enforcement, schema validation, rate limits, and tamper-evident audit records.
- Time-normalized, deduplicated ingestion, FHIR Observation adapter, explicit provenance, consistency rules, five competing root-cause hypotheses, and independent patient-risk factors.
- Human acknowledgement, investigation, resolution, and false-positive feedback; no therapy or device actuation.
- Python inference service for XGBoost, Random Forest, Isolation Forest, and feature contributions; reproducible grouped synthetic evaluation. Public-dataset training is supported through normalized feature CSVs. Synthetic evaluation does not establish clinical accuracy.
- SIEM JSON export and authenticated ingestion. No invented live hospital connections.
- Responsive browser verification, engine and API/security tests, production build, CI, deployment instructions, and conventional commits pushed to the public GitHub repository.

## Boundaries

MIMIC access requires a data-use agreement and is not downloaded automatically. Prospective validation, calibrated clinical thresholds, institutional governance, external identity provider enrollment, TLS termination, full-volume encryption, and off-host immutable audit retention are deployment responsibilities. The local demo uses synthetic records exclusively.

The user explicitly requested Next.js, so the application preserves the actual Next.js Node runtime rather than adopting the Sites vinext starter. A Node/SQLite service needs a persistent volume; it cannot be uploaded directly as a Sites Cloudflare Worker.
