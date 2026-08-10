# SEC-10 Public Error Detail Wave Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every direct public exposure of technical error details from Renewal, Guru Trials, Achievements, ActiveCampaign webhooks and Sync Status while preserving successful, validation and not-found contracts.

**Architecture:** Reuse the existing `internalError` -> `createErrorHandling().handler` authority and `asyncRoute`; do not introduce another parser, logger or correlation implementation. Unknown failures become stable canonical 5xx envelopes. The two intentional Guru manual-inactivation domain failures become typed 400 errors with stable public messages, while unexpected failures become canonical 500.

**Tech Stack:** TypeScript strict, Express 5.1, Jest 29, Supertest, Mongoose mocks, existing SEC-10 boundary.

## Global Constraints

- Work only on `remake`; never `main`.
- Stay offline: no external APIs, production Mongo/Redis, scheduler, deploy, install or cache deletion.
- RED before production edits; one lowercase Conventional Commit per family.
- Preserve all success envelopes, validation/not-found/conflict statuses, route order, authentication/signature position and write order.
- Technical causes exist only in the central redacted log.
- No `any`, suppressive casts, non-null assertions, ignores or new suppressions.
- Verify live mounts before migrating; dead/shadowed code requires evidence and a stop.

---

### Task 1: Characterize the cross-domain public error boundary

**Files:**
- Create: `tests/controllers/publicErrorDetailContract.test.ts`
- Modify: `tests/tooling/productionBoundaryInventory.test.ts`

- [ ] Mount the real Renewal, Guru, Achievements, Webhook and Sync route boundaries behind deterministic correlation middleware and the final error handler; mock only their service/model ports.
- [ ] Characterize success plus existing 400/404/409 behavior for each family and prove route/middleware order.
- [ ] Inject `new Error('secret alice@example.test token=hidden')` into every public-detail catch and assert RED: current payload exposes detail and lacks stable code/correlation.
- [ ] Reconcile the exact baseline before production edits: 206 local 500 sites, 19 public-detail sites, with this wave owning 18 local 500 plus the Guru manual-inactivation 400 leak.

### Task 2: Migrate Renewal

**Files:** `src/controllers/renewal.controller.ts`, `src/routes/renewal.routes.ts`, contract/inventory tests.

- [ ] Give all six handlers `next: NextFunction`, replace formatting catches with distinct `RENEWAL_*_FAILED` `internalError` values, and wrap routes once with `asyncRoute`.
- [ ] Preserve query parsing, checkout link, 400/404/409 bodies, model/service order and response envelopes.
- [ ] Verify RED -> GREEN and lower local/public ratchets by six.
- [ ] Commit `refactor(renewal): centralize public errors`.

### Task 3: Migrate Guru Trials

**Files:** `src/controllers/guru.trials.controller.ts`, `src/services/guru/guruTrialService.ts`, contract/inventory tests.

- [ ] Add typed domain errors for user-not-found and trial-not-ended in `manuallyInactivateTrial`; preserve their 400 status with stable non-sensitive messages.
- [ ] Forward every unexpected failure through distinct `GURU_TRIAL_*_FAILED` codes; keep existing `asyncRoute` mounts and operation order.
- [ ] Preserve success and missing-email 400 contracts; prove technical model/API failures are 500 and redacted.
- [ ] Lower five local 500 sites plus all six Guru public-detail sites; commit `refactor(guru): centralize trial errors`.

### Task 4: Migrate Achievements

**Files:** `src/routes/achievements.routes.ts`, contract/inventory tests.

- [ ] Wrap only the four async inline handlers with `asyncRoute`; add `next` and forward with distinct `ACHIEVEMENTS_*_FAILED` codes.
- [ ] Preserve definitions, email/token validation, 404, evaluation fields, achievement mutation/save order and statistics envelopes.
- [ ] Remove local console error copies; lower both ratchets by four.
- [ ] Commit `refactor(achievements): centralize public errors`.

### Task 5: Migrate signed webhooks and Sync Status

**Files:** `src/controllers/webhooks.controller.ts`, `src/routes/webhooks.routes.ts`, `src/controllers/sync/status.controller.ts`, `src/routes/sync.routes.ts`, contract/inventory tests.

- [ ] Preserve webhook signature perimeter and 400/404/success responses; wrap controller handlers once and forward failures using `AC_WEBHOOK_*_FAILED`.
- [ ] Preserve Sync Status read order and success envelope; route failures using `SYNC_STATUS_FAILED`.
- [ ] Lower three local/public sites and prove no direct public detail remains in the five families.
- [ ] Commit `refactor(errors): close public detail wave`.

### Task 6: Close the wave

**Files:** `docs/HARDENING-WORKPLAN.md`, inventory and reports.

- [ ] Set exact fail-closed ceilings to the measured post-wave counts: local HTTP 500 `206 -> 188`; public detail `19 -> 0`, subject to fresh inventory verification.
- [ ] Run negative greps, inventory mutation/restoration, all focused contracts, lint-prune, lint, types, full offline Jest in-band, build, diff and lockfile checks.
- [ ] Review Front consumers: Renewal and Guru already use canonical `getApiErrorMessage`; prove no new direct parser is needed.
- [ ] Record exact evidence and commit `docs(errors): record public detail closure` only if documentation cannot accurately belong to Task 5.

## Stop Conditions

- A catch performs uncharacterized cleanup/compensation.
- A 400 error cannot be classified as a typed domain failure.
- A route is dead, shadowed or has an unverified signature/auth mount.
- A Front consumer genuinely depends on technical detail rather than the public message.

