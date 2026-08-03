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
- The central application JWT secret is mandatory, at least 32 characters, and configured before infrastructure. The checked slice does not establish global production debug gating: `/api/curseduca/debug` remains mounted at `src/routes/curseduca.routes.ts:50` without `localDebugOnly`. Secondary student/legacy JWT paths still bypass or fall back around that single authority.
- CORS rejects unknown origins but always merges static localhost/production defaults; it does not require an explicit production allowlist and therefore does not satisfy fail-closed production configuration.
- The canonical pagination helper caps HTTP list pages at 200, preserves cursor-where-needed and explicit projections on migrated surfaces, and has focused tests. Remaining noncanonical HTTP lists and `find({})` calls require migration/inventory; operational scans must use cursor/batch, and every exception must be bounded or covered by an explicit machine-checked finite-set allowlist.
- The central error-handler implementation is mounted and tested, but live routes/controllers still emit ad hoc 500 shapes and at least one exposes `error.message`.

## Selected Approach

Split compound checkboxes into evidence-complete and still-open slices:

1. Close the stale dry-run decision.
2. Close Helmet plus the currently implemented single-instance segmented rate-limit baseline; separately close body/upload/timeouts/non-root. Keep distributed limiter state, consistent 429 envelope/correlation ID, and final CSP policy open.
3. Keep global central-error coverage open. Close the single-redactor/no-new-console guard while explicitly leaving legacy console migration to TOOL-02.
4. Close primary app JWT startup validation and upload hardening only. Keep global production debug gating open (including the `/api/curseduca/debug` mount without `localDebugOnly`) and keep secondary JWT secret centralization and fallback removal open.
5. Keep CORS open and record its production-default gap.
6. Close canonical HTTP pagination on migrated surfaces (including cursor where needed, explicit projections, and zero 10,000 defaults). Keep noncanonical HTTP-list migration and a machine-checked inventory open; operational scans must use cursor/batch, and every `find({})` exception must be bounded or protected by an explicit machine-checked finite-set allowlist.

The resulting mechanical count is expected to move from `79/100` to `85/104` (`81.7%`). The denominator grows because hidden compound debt becomes explicit; the percentage is derived from Markdown checkboxes, not a subjective estimate.

## Safety Boundaries

- Modify documentation only; do not change runtime, tests, dependencies, routes, or deployment configuration.
- Do not weaken or delete an open requirement to improve the percentage.
- Do not claim CORS, central-error coverage, distributed rate limiting, secondary JWT authority, legacy console cleanup, or remaining full-scan governance complete.
- Run offline only: no installs, network, external APIs, production Mongo, deployment, or push.

## Verification

- Task 1 uses the recorded focused runs: **14 suites / 65 tests** for perimeter/upload/observability/pagination and **5 suites / 27 tests** for JWT/CORS/Helmet; these outputs are evidence inputs, not a rerun in this final review.
- Static source checks prove runtime wiring and enumerate the named open contradictions.
- A checkbox count reports exactly `85` checked, `19` open, `104` total.
- Independent review verifies every checked/open split against source and tests.
- `git diff --check` is the static diff gate. Task 2 full lint, TypeScript ratchet, full offline Jest, and build remain **unclaimed/unchecked** until the controller runs them after the final fix/re-review on final HEAD; they remain hard gates.
