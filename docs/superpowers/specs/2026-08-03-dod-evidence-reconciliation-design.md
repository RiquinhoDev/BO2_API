# DoD Evidence Reconciliation Design

**Date:** 2026-08-03

**Status:** Approved by the standing `remake` mandate and the instruction to advance to the proposed DoD-reconciliation block.

## Goal

Reconcile stale or compound open checkboxes in `docs/HARDENING-WORKPLAN.md` with the current runtime and focused offline tests. Close only independently proven slices, preserve every real gap as an explicit open item, and avoid runtime changes.

## Evidence Baseline

- The stale dry-run decision at the top of the workplan is marked open even though the preceding checked entry records its implementation and review.
- Helmet is installed, configured in `src/security/httpPerimeter.ts`, and mounted before routes in `src/app.ts`.
- Login, webhook, and heavy-operation rate limiters are separate, mounted, and tested. They currently use per-process `MemoryStore` and return an ad hoc 429 envelope.
- JSON bodies are capped, user-import uploads validate size/count/content and clean temporary files, server header/keep-alive timeouts are explicit, and the container runs as `node`.
- `redactSensitiveData` is the single generic redactor shared by Winston and the central error handler. ESLint plus its ratchet test rejects new console calls, while a large legacy console baseline still exists.
- The central application JWT secret is mandatory, at least 32 characters, and configured before infrastructure. Secondary student/legacy JWT paths still bypass or fall back around that single authority.
- CORS rejects unknown origins but always merges static localhost/production defaults; it does not require an explicit production allowlist and therefore does not satisfy fail-closed production configuration.
- The canonical pagination helper caps HTTP list pages at 200 and the migrated list surfaces have focused tests. Remaining `find({})` calls include deliberate full-set/config reads and operational scans; they are not protected by a machine-checked inventory ratchet.
- The central error-handler implementation is mounted and tested, but live routes/controllers still emit ad hoc 500 shapes and at least one exposes `error.message`.

## Selected Approach

Split compound checkboxes into evidence-complete and still-open slices:

1. Close the stale dry-run decision.
2. Close Helmet plus the currently implemented single-instance segmented rate-limit baseline; separately close body/upload/timeouts/non-root. Keep distributed limiter state, consistent 429 envelope/correlation ID, and final CSP policy open.
3. Keep global central-error coverage open. Close the single-redactor/no-new-console guard while explicitly leaving legacy console migration to TOOL-02.
4. Close primary app JWT startup validation, production debug-route prohibition, and upload hardening. Keep secondary JWT secret centralization and fallback removal open.
5. Keep CORS open and record its production-default gap.
6. Close the canonical HTTP pagination slice and zero 10,000 defaults. Keep a machine-checked inventory and bounded/streamed treatment of remaining operational `find({})` scans open.

The resulting mechanical count is expected to move from `79/100` to `85/104` (`81.7%`). The denominator grows because hidden compound debt becomes explicit; the percentage is derived from Markdown checkboxes, not a subjective estimate.

## Safety Boundaries

- Modify documentation only; do not change runtime, tests, dependencies, routes, or deployment configuration.
- Do not weaken or delete an open requirement to improve the percentage.
- Do not claim CORS, central-error coverage, distributed rate limiting, secondary JWT authority, legacy console cleanup, or remaining full-scan governance complete.
- Run offline only: no installs, network, external APIs, production Mongo, deployment, or push.

## Verification

- Focused offline suites prove each checked slice.
- Static source checks prove runtime wiring and enumerate the named open contradictions.
- A checkbox count reports exactly `85` checked, `19` open, `104` total.
- Independent review verifies every checked/open split against source and tests.
- `git diff --check`, lint, TypeScript ratchet, full offline Jest, and build pass on final HEAD.
