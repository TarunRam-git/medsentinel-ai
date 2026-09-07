# Verification record

Verified locally on 7 September 2026 with Node 26.7.0 and Python 3.14. GitHub Actions additionally validates Node 24 and Python 3.14 on Linux.

## Automated checks

- TypeScript and ESLint: pass, zero warnings.
- Production Next.js build: pass, no build warnings.
- Engine, ingestion-schema, FHIR, and cryptography tests: **13 passed**.
- Isolated production API/security tests: **37 passed**.
- Model reproducibility, split isolation, and inference tests: **3 passed**.
- Live Python HTTP inference: returned eight feature contributions and the expected known-pattern score. Unauthenticated model requests returned 401.
- npm dependency audit: no known vulnerabilities at verification time.
- Docker Compose configuration: validated with the runtime environment file.
- Standalone output: excludes environment secrets, local database, virtual environment, training artifacts, and source documents. The running local preview uses this standalone production output.
- Tracked-file scan: none of the local encryption, administrator, ingestion, or model-service secrets occur in tracked files.

API checks cover authentication, cookies, origin enforcement, role minimization, registry permissions and associations, duplicate identifiers, invalid numeric ranges, payload limits, event deduplication, FHIR units, review transitions, stale writes, late observations, encrypted storage, append-only audit and evidence versions, restart persistence, logout, rate limiting, account provisioning, and disabling demo access.

## Browser verification

Checked the real app in the connected browser at desktop and narrow mobile dimensions, including a 390×844 viewport. Verified sign-in, responsive navigation, patient search, evidence details, human acknowledgement and saved review history, patient/device/alert relationships, model metrics, and model-backed scenario execution. Registration fields and mobile dialogs were inspected. The mobile alert queue uses cards, and wide data tables scroll within their own containers; the page itself has no horizontal overflow in the checked mobile view.

The backend was restarted into the standalone production build using the same encrypted local database; the existing session and recorded review remained available. Native dialogs provide focus management and Escape dismissal. Hidden mobile navigation is removed from keyboard/assistive-technology visibility.

## Boundaries

The Dockerfiles are provided and the Compose configuration was validated; full Docker image builds were not run on this space-constrained machine. No public hosting deployment or live hospital/SIEM connection was performed. The public GitHub repository and running local app are the delivered surfaces.

No clinical validation, public-dataset benchmark, penetration-test certification, load/SLA guarantee, or complete WCAG conformance audit is claimed. Synthetic test metrics validate this prototype's software workflow, not prospective patient outcomes. See SECURITY.md for the precise security boundaries.
