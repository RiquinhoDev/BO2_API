# SEC-10 Tag Monitoring Error Wave Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all 27 locally formatted HTTP 500 responses from the live Tag Monitoring domain while preserving every success response, validation response, route, middleware order and side effect.

**Architecture:** The existing Front error boundary and Back `asyncRoute`/`internalError`/final handler are already implemented and remain authoritative. Each controller forwards unknown failures through `next(internalError(publicMessage, code, cause))`; existing 400/404 responses, successful envelopes and service/model call order remain unchanged. Routes gain the shared async adapter only where required to ensure forwarded async failures reach the final handler.

**Tech Stack:** TypeScript strict, Express 5.1, Mongoose 8, Jest 29, Supertest, React/Vite Front contract tests, ESLint 10.

## Global Constraints

- Work only on `remake`; never `main`.
- Stay offline: no external APIs, production Mongo/Redis, Discord, scheduler, deploy, `npm install`, `npm ci`, or deletion of `node_modules`.
- Preserve all success payloads, 400/404 payloads, business rules, authentication order and database write order.
- Canonical 5xx payload is `{ success: false, code, message, correlationId }`; technical causes exist only in the redacted central log.
- Use `redactSensitiveData` only through the existing central error boundary; do not add controller log copies.
- Apply rule #9 before editing each controller; dead, shadowed or duplicate handlers require a stop and evidence.
- Follow RED -> GREEN -> refactor. One lowercase Conventional Commit per controller family.
- Do not add `any`, casts used to silence types, non-null assertions, ignores or suppression debt.
- Preserve unrelated Front changes in `.claude/settings.local.json` and `scripts/git-hooks/`.

---

### Task 1: Characterize the Tag Monitoring error boundary

**Files:**
- Create: `tests/controllers/tagMonitoringErrorContract.test.ts`
- Modify: `tests/tooling/productionBoundaryInventory.test.ts`

**Interfaces:**
- Consumes: `createErrorHandling`, `internalError`, `asyncRoute`, the mounted `/api/tag-monitoring` router.
- Produces: a reusable test app with deterministic correlation ID `tag-monitoring-request`; baseline assertions for the three controller families.

- [ ] **Step 1: Prove every handler is live before migration**

Read `src/routes/tagMonitoring.routes.ts`, `src/runtime/registerRoutes.ts`, and the Front consumers under `src/features/tagMonitoring` and `src/pages/gerirAlunos/syncUtilizadores/hooks`. Record the mounted handler names in the test and fail if any exported handler in the three controller objects is neither mounted nor intentionally private.

- [ ] **Step 2: Write RED contract tests for central 500 behavior**

Build an Express app with the correlation middleware before the router and the final handler after it. Mock one dependency in each controller family to reject with `new Error('secret alice@example.test token=hidden')`. Assert status 500, exact body `{ success: false, code: <stable code>, message: <current public message>, correlationId: 'tag-monitoring-request' }`, matching `X-Request-ID`, and absence of `secret`, email and token in the response.

- [ ] **Step 3: Run the focused suite and verify RED**

Run:

```powershell
$env:MONGOMS_RUNTIME_DOWNLOAD='false'
npx jest --ci --runInBand tests/controllers/tagMonitoringErrorContract.test.ts
```

Expected: RED because the controllers still send local `{ success, message, error }` payloads and do not reach the final handler.

- [ ] **Step 4: Confirm the inventory baseline before production edits**

Run `npx jest --ci --runInBand tests/tooling/productionBoundaryInventory.test.ts` and record exactly 27 local 500 sites across `tagMonitoring.controller.ts` (10), `tagNotification.controller.ts` (9), and `criticalTag.controller.ts` (8). Do not weaken line-membership or mutation checks.

---

### Task 2: Migrate monitoring snapshots, stats and config

**Files:**
- Modify: `src/controllers/tagMonitoring/tagMonitoring.controller.ts`
- Modify: `src/routes/tagMonitoring.routes.ts`
- Modify: `tests/controllers/tagMonitoringErrorContract.test.ts`
- Modify: `tests/tooling/productionBoundaryInventory.test.ts`

**Interfaces:**
- Consumes: `asyncRoute` from `src/security/asyncRoute.ts`; `internalError` from `src/security/errorHandling.ts`.
- Produces: ten handlers that accept `next: NextFunction` and forward failures with stable domain codes.

- [ ] **Step 1: Preserve success and validation contracts**

Add exact assertions for snapshot list/count, snapshot comparison, manual result, global/weekly stats, scope config, scope update, toggle and students-by-priority. Preserve current 400 and 404 bodies byte-for-byte at JSON-field level.

- [ ] **Step 2: Replace formatting-only catches**

For each of the ten handlers, remove the local `logger.error` plus `res.status(500).json(...)` pair and call:

```ts
next(internalError('<existing public message>', 'TAG_MONITORING_<OPERATION>_FAILED', cause))
```

Use a distinct stable uppercase code per operation. Type caught values as `unknown`. Do not change query parsing, default limits, service calls or response envelopes outside the 500 path.

- [ ] **Step 3: Wrap the ten mounted handlers with the shared adapter**

In `tagMonitoring.routes.ts`, import `asyncRoute` once and wrap only the handlers migrated in this task. Preserve `authenticate` before the handler and preserve every route order.

- [ ] **Step 4: Verify focused GREEN and ratchet reduction**

Run the error contract suite, `tests/routes/tagMonitoring.routes.test.ts`, and `tests/security/tagMonitoringDestructiveValidation.test.ts`. Update only the ten removed inventory memberships; expected domain debt is 27 -> 17.

- [ ] **Step 5: Run gates and commit**

Run lint-prune, lint, types, focused Jest and `git diff --check`. Commit:

```text
refactor(tag-monitoring): centralize monitoring errors
```

---

### Task 3: Migrate notification errors

**Files:**
- Modify: `src/controllers/tagMonitoring/tagNotification.controller.ts`
- Modify: `src/routes/tagMonitoring.routes.ts`
- Modify: `tests/controllers/tagMonitoringErrorContract.test.ts`
- Modify: `tests/routes/tagMonitoring.routes.test.ts`
- Modify: `tests/tooling/productionBoundaryInventory.test.ts`

**Interfaces:**
- Consumes: the same `asyncRoute` and `internalError` authorities.
- Produces: nine notification handlers with canonical 5xx errors and unchanged read/update/delete contracts.

- [ ] **Step 1: Characterize every notification outcome**

Cover list, stats, detail, read, unread, dismiss, unread count and mark-all-read success responses; preserve existing not-found/validation statuses and payloads. Assert `/notifications/stats` and `/notifications/unread/count` still beat `/:id` route matching.

- [ ] **Step 2: Migrate catches without moving effects**

Replace only the formatting/logging portion of each catch with `next(internalError(...))`, using `unknown` causes and stable `TAG_NOTIFICATION_<OPERATION>_FAILED` codes. If a catch performs cleanup or a compensating write before responding, retain it in the same order and test it before forwarding.

- [ ] **Step 3: Wrap migrated routes and verify**

Apply `asyncRoute` after `authenticate`; retain `withValidatedInput` exactly on destructive routes and do not stack wrappers around its callback unless the callback actually returns a rejecting promise to Express.

- [ ] **Step 4: Update the inventory and commit**

Focused suites must pass and domain debt must fall 17 -> 8. Commit:

```text
refactor(tag-monitoring): centralize notification errors
```

---

### Task 4: Migrate critical-tag errors and close the domain

**Files:**
- Modify: `src/controllers/tagMonitoring/criticalTag.controller.ts`
- Modify: `src/routes/tagMonitoring.routes.ts`
- Modify: `tests/controllers/tagMonitoringErrorContract.test.ts`
- Modify: `tests/security/tagMonitoringDestructiveValidation.test.ts`
- Modify: `tests/tooling/productionBoundaryInventory.test.ts`
- Modify: `docs/HARDENING-WORKPLAN.md`

**Interfaces:**
- Consumes: strict destructive input validation, `asyncRoute`, `internalError` and the final handler.
- Produces: zero local HTTP 500 responses in `src/controllers/tagMonitoring`.

- [ ] **Step 1: Characterize critical-tag behavior**

Cover list, create, soft delete, permanent delete, toggle, priority update, available-native-tags and stats. Preserve current IDs, validation errors, soft/permanent deletion semantics and service/model write order.

- [ ] **Step 2: Migrate all eight formatting catches**

Forward with stable `CRITICAL_TAG_<OPERATION>_FAILED` codes. Keep 400/404 branches local and unchanged. Preserve `withValidatedInput(tagMonitoringDeleteInput, ...)` and its strict body/params protection.

- [ ] **Step 3: Prove domain closure**

Run negative greps:

```powershell
rg -n "res\.status\(500\)|error\.message" src/controllers/tagMonitoring src/routes/tagMonitoring.routes.ts
```

Expected: zero executable response exposures. The production-boundary inventory must fall by all 27 original Tag Monitoring memberships and still detect/restores artificial mutations.

- [ ] **Step 4: Run the major offline gate**

Run:

```powershell
npm run lint:baseline:prune
npm run lint
npm run types:check
$env:MONGOMS_RUNTIME_DOWNLOAD='false'
npm test -- --runInBand
npm run build
git diff --check
git diff -- package.json package-lock.json yarn.lock
```

Expected: all green, lockfiles unchanged, no network or real integration access.

- [ ] **Step 5: Record and commit closure**

Add exact before/after inventory and suite counts to `HARDENING-WORKPLAN.md`. Commit:

```text
refactor(tag-monitoring): centralize critical tag errors
```

Use a separate lowercase docs commit only if the workplan update cannot accurately belong to the final domain commit.

---

## Self-review

- Spec coverage: canonical envelope, compatibility, redaction, correlation ID, async forwarding, rule #9, Front readiness and offline gates are covered.
- Scope: this plan closes one cohesive live domain, not all 233 remaining local 500 responses.
- Type consistency: all tasks use existing `asyncRoute`, `internalError` and final `createErrorHandling` interfaces; no replacement authority is introduced.
- Contract safety: success/400/404 payloads remain characterized and unchanged; only local 5xx formatting migrates.
- Stop conditions: stop if a catch has uncharacterized compensation, a route is dead/shadowed, or a Front consumer requires technical error detail.
