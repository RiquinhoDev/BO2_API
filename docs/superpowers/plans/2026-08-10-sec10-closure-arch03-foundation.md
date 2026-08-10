# SEC-10 Closure and ARCH-03 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the exact local HTTP 500 inventory from 188 to 0 without changing successful contracts, then add a route-complete, fail-closed response-contract catalog for all 439 mounted routes.

**Architecture:** Migrate unexpected failures domain-by-domain through the existing `internalError` and final error handler, preserving local domain responses and middleware ordering. After SEC-10 reaches zero, derive an explicit response-family catalog from the canonical route catalog and protect it with exact-membership and mutation tests; do not normalize successful payloads in this mission.

**Tech Stack:** TypeScript 5.9 strict, Express 5, Jest 29, Supertest, Zod 3, existing `HttpError`/`asyncRoute`/`withValidatedInput`, route catalog, ESLint 10 bulk suppressions, PowerShell-safe `npm.cmd` commands.

## Global Constraints

- Work only on branch `remake`; never commit to `main`.
- Remain offline: `MONGOMS_RUNTIME_DOWNLOAD=false`; no real API, production MongoDB, Redis, scheduler or deploy.
- Preserve success, validation, authentication, 400/404/409/410/429/503 and integration-unavailable contracts.
- Never expose `error.message`, `details`, email, token or internal cause in public unexpected-error responses.
- Never introduce `any`, casts used to silence types, non-null assertions, `@ts-ignore`, `@ts-expect-error`, new ESLint suppressions or `--forceExit`.
- Keep authentication and validation middleware order unchanged. Apply `asyncRoute` exactly once; thread `next` through `withValidatedInput` instead of stacking wrappers.
- One lowercase Conventional Commit per cohesive domain task.
- Do not alter either lockfile or install dependencies.
- A family that reveals dead/shadowed routes, compensating writes, Front-coupled error payloads or a new business decision stops for review.

---

### Task 1: Strengthen the SEC-10 contract harness

**Files:**
- Create: `tests/support/centralErrorContract.ts`
- Create: `tests/controllers/sec10Wave.contract.test.ts`
- Modify: `tests/tooling/productionBoundaryInventory.test.ts`

**Interfaces:**
- Produces: `expectCentralError(response, { code, message, correlationId }): void`.
- Produces: a table-driven Express harness that can mount a real handler or router and inject a deterministic correlation ID.
- Preserves: `BASELINE.localHttp500` exact membership at 188 until the first family migration.

- [ ] **Step 1: Extract the reusable assertion and app harness**

```ts
export interface ExpectedCentralError {
  code: string
  message: string
  correlationId?: string
}

export function expectCentralError(
  response: request.Response,
  expected: ExpectedCentralError,
): void {
  const correlationId = expected.correlationId ?? 'sec10-request'
  expect(response.status).toBe(500)
  expect(response.headers['x-request-id']).toBe(correlationId)
  expect(response.body).toEqual({
    success: false,
    code: expected.code,
    message: expected.message,
    correlationId,
  })
  expect(JSON.stringify(response.body)).not.toMatch(
    /secret|alice@example\.test|token=hidden/,
  )
}
```

- [ ] **Step 2: Add a mutation that proves both inventories fail closed**

Extend the existing temporary fixture with:

```ts
const fixture = `const fiveHundred = res.status(500)\nconst detail = res.json({ details: error.message })\n`
```

Assert that the injected file is named in both inventories and that deletion restores the exact baseline.

- [ ] **Step 3: Run the harness tests**

Run:

```powershell
npx.cmd jest --ci --runInBand tests/tooling/productionBoundaryInventory.test.ts tests/controllers/publicErrorDetailContract.test.ts tests/controllers/sec10Wave.contract.test.ts
```

Expected: PASS with the production baseline still at 188 and public-detail baseline at 0.

- [ ] **Step 4: Commit**

```powershell
git add tests/support/centralErrorContract.ts tests/controllers/sec10Wave.contract.test.ts tests/tooling/productionBoundaryInventory.test.ts
git commit -m "test(errors): strengthen sec10 contract harness"
```

### Task 2: Wave A1 — ActiveCampaign and tag controllers (32 -> 0)

**Files:**
- Modify: `src/controllers/acTags/acReader.controller.ts` (5)
- Modify: `src/controllers/acTags/activeCampaignCourse.controller.ts` (4)
- Modify: `src/controllers/acTags/activeCampaignHistoryList.controller.ts` (1)
- Modify: `src/controllers/acTags/activeCampaignHistoryStats.controller.ts` (1)
- Modify: `src/controllers/acTags/activeCampaignLegacyTagRules.controller.ts` (4)
- Modify: `src/controllers/acTags/activeCampaignOps.controller.ts` (3)
- Modify: `src/controllers/acTags/activeCampaignProductTags.controller.ts` (5)
- Modify: `src/controllers/acTags/tagRule.controller.ts` (6)
- Modify: `src/controllers/acTags/tagRuleEstimate.controller.ts` (3)
- Modify only where required: `src/routes/ACroutes/activecampaign.routes.ts`, `src/routes/tagRule.routes.ts`, and the actual route owners importing these handlers
- Test: focused controller/service/security tests plus `tests/controllers/sec10Wave.contract.test.ts`

**Interfaces:**
- Consumes: existing `internalError(publicMessage, code, cause)` and `asyncRoute`.
- Produces: nine domain files with zero local `status(500)` sites.
- Inventory target: **188 -> 156**.

- [ ] **Step 1: Prove every handler is live before editing**

For each export, locate all route imports and mounts. If an export has no live mount, stop and report it as dead code rather than centralizing a phantom.

- [ ] **Step 2: Add RED cases grouped by public operation**

For each of the 32 paths, inject `new Error('secret alice@example.test token=hidden')` at the first awaited dependency and assert the canonical envelope. Also characterize existing success and 400/404/409 behavior for the same operation.

- [ ] **Step 3: Replace only unexpected catches**

Use the exact pattern:

```ts
export async function handler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // existing body unchanged
  } catch (error: unknown) {
    next(internalError('Stable existing fallback', 'AC_OPERATION_FAILED', error))
  }
}
```

Keep preview handlers on `dryRun: true`, preserve all AC write gates and do not change tag/write ordering.

- [ ] **Step 4: Wrap routes once and preserve middleware order**

For ordinary handlers use `asyncRoute(handler)`. For validated handlers retain:

```ts
withValidatedInput(schema, (input, req, res, next) => handler(input, req, res, next))
```

- [ ] **Step 5: Lower and prove the inventory**

Remove exactly the 32 resolved memberships, set the ceiling to 156, run mutation/restoration, route-catalog tests and focused suites.

- [ ] **Step 6: Commit**

```powershell
git commit -m "refactor(activecampaign): centralize controller errors"
```

### Task 3: Wave A2 — Products, Hotmart and Guru snapshots (40 -> 0)

**Files:**
- Modify: `src/controllers/products/product.controller.ts` (7)
- Modify: `src/controllers/products/productProfile.controller.ts` (7)
- Modify: `src/controllers/products/products.controller.ts` (4)
- Modify: `src/controllers/products/productSalesStats.controller.ts` (5)
- Modify: `src/controllers/hotmart/hotmartCatalog.controller.ts` (4)
- Modify: `src/controllers/hotmart/hotmartDiagnostics.controller.ts` (2)
- Modify: `src/controllers/hotmart/hotmartLegacySync.controller.ts` (1)
- Modify: `src/controllers/hotmart/hotmartUniversalSync.controller.ts` (2)
- Modify: `src/controllers/guruSnapshots/analytics.controller.ts` (1)
- Modify: `src/controllers/guruSnapshots/crud.controller.ts` (6)
- Modify: `src/controllers/guruSnapshots/history.controller.ts` (1)
- Modify: actual route modules only where `asyncRoute`/`next` threading is absent
- Test: existing product, profile, sales, Hotmart and Guru snapshot suites; extend `tests/controllers/sec10Wave.contract.test.ts`

**Interfaces:**
- Produces: 40 fewer local 500 sites without changing Mongo write ordering, snapshot semantics or payload fields.
- Inventory target: **156 -> 116**.

- [ ] **Step 1: Characterize CRUD and integration boundaries**

Cover complete success envelopes, ObjectId validation, duplicate/not-found conflicts, snapshot date parameters, Hotmart runtime-unavailable behavior and any partial result counters.

- [ ] **Step 2: Prove RED for all unexpected paths**

Inject both `Error` and one non-`Error` rejection per family. The old local response must fail the canonical assertion before production edits.

- [ ] **Step 3: Migrate controllers and routes**

Use stable operation-specific codes. Do not reuse one generic code for unrelated CRUD actions. Preserve `IntegrationUnavailableError` by forwarding it unchanged when already thrown; do not wrap it as a 500.

- [ ] **Step 4: Ratchet, prune and run Wave A full gate**

Run focused suites, inventory, route catalog, lint, types, then:

```powershell
$env:MONGOMS_RUNTIME_DOWNLOAD='false'
npm.cmd test -- --runInBand
npm.cmd run build
```

Expected: full GREEN, inventory 116, public detail 0.

- [ ] **Step 5: Commit**

Commit one subject per family group:

```powershell
git commit -m "refactor(products): centralize controller errors"
git commit -m "refactor(hotmart): centralize controller errors"
git commit -m "refactor(guru): centralize snapshot errors"
```

### Task 4: Wave B1 — Sync Utilizadores and cron management (25 -> 0)

**Files:**
- Modify: `src/controllers/syncUtilizadoresControllers/cronManagement/commands.controller.ts` (5)
- Modify: `src/controllers/syncUtilizadoresControllers/cronManagement/operations.controller.ts` (4)
- Modify: `src/controllers/syncUtilizadoresControllers/cronManagement/queries.controller.ts` (2)
- Modify: `src/controllers/syncUtilizadoresControllers/curseduca/dashboard.controller.ts` (1)
- Modify: `src/controllers/syncUtilizadoresControllers/curseduca/products.controller.ts` (4)
- Modify: `src/controllers/syncUtilizadoresControllers/curseduca/sync.controller.ts` (1)
- Modify: `src/controllers/syncUtilizadoresControllers/curseduca/users.controller.ts` (3)
- Modify: `src/controllers/syncUtilizadoresControllers/syncReports.controller.ts` (3)
- Modify: `src/controllers/syncUtilizadoresControllers/syncStats.controller.ts` (2)
- Modify: route owners only when required
- Test: cron, CursEduca, sync-report and destructive-validation suites

**Interfaces:**
- Inventory target: **116 -> 91**.
- Preserves: kill switches, job state transitions, long-running request behavior, CursEduca cardinality and existing offline boundaries.

- [ ] **Step 1: Characterize side-effect order and compensating catches**

For every catch, record whether it only formats HTTP or also updates execution history/state. If it compensates, keep compensation inside the catch and call `next(internalError(...))` only after the existing write completes.

- [ ] **Step 2: Add RED/GREEN central-boundary tests**

Assert scheduled/manual distinctions, error counters, report finalization and response envelopes. Never invoke a real job or integration.

- [ ] **Step 3: Migrate and ratchet**

Preserve validated input wrappers and ObjectId guards. Lower exact membership to 91 and prune only suppressions made obsolete by the migration.

- [ ] **Step 4: Commit**

```powershell
git commit -m "refactor(sync): centralize sync-utilizadores errors"
```

### Task 5: Wave B2 — Sync, Sync Stats and histories (21 -> 0)

**Files:**
- Modify: `src/controllers/sync/history.controller.ts` (5)
- Modify: `src/controllers/sync/operations.controller.ts` (6)
- Modify: `src/controllers/syncStats/conflicts.controller.ts` (7)
- Modify: `src/controllers/populateHistory.controller.ts` (3)
- Modify: actual route owners only where required
- Test: sync history, conflict, operation, route-catalog and destructive-validation suites

**Interfaces:**
- Inventory target: **91 -> 70**.
- Preserves: conflict status codes, retry semantics, history persistence and partial-failure counters.

- [ ] **Step 1: Prove rule #9 and characterize conflict responses**

Confirm each handler is mounted and not shadowed. Record every intentional 400/404/409 response before changing unexpected catches.

- [ ] **Step 2: Migrate unexpected failures**

Use distinct stable codes per operation. Keep conflict/domain mappings local and send only unknown failures to `internalError`.

- [ ] **Step 3: Run Wave B full gate and commit**

Expected: inventory 70, public detail 0, full offline Jest/build GREEN.

```powershell
git commit -m "refactor(sync): centralize history and conflict errors"
```

### Task 6: Wave C — Remaining application surfaces (70 -> 0)

**Files:**
- Modify: `src/controllers/clarezaController.ts` (12)
- Modify: `src/controllers/testimonials/testimonialCandidates.controller.ts` (2)
- Modify: `src/controllers/testimonials/testimonialCommands.controller.ts` (4)
- Modify: `src/controllers/testimonials/testimonialQueries.controller.ts` (4)
- Modify: `src/controllers/engagement/details.controller.ts` (1)
- Modify: `src/controllers/engagement/stats.controller.ts` (1)
- Modify: `src/controllers/engagement/summary.controller.ts` (2)
- Modify: `src/controllers/engagement/users.controller.ts` (1)
- Modify: `src/controllers/course.controller.ts` (5)
- Modify: `src/controllers/lessons.controller.ts` (5)
- Modify: `src/controllers/auth.controller.ts` (4)
- Modify: `src/controllers/metrics.controller.ts` (3)
- Modify: `src/controllers/guruAnalytics/churn.controller.ts` (3)
- Modify: `src/controllers/guruAnalytics/comparison.controller.ts` (1)
- Modify: `src/controllers/guruAnalytics/subscriptionRepair.controller.ts` (1)
- Modify: `src/controllers/guruInactivationExternal.controller.ts` (1)
- Modify: `src/controllers/guruSubscriptionList.controller.ts` (1)
- Modify: `src/controllers/guruWebhookList.controller.ts` (1)
- Modify: `src/controllers/studentHistory.controller.ts` (2)
- Modify: `src/controllers/studentsController.ts` (2)
- Modify: `src/controllers/tagEvaluation.controller.ts` (2)
- Modify: `src/controllers/testHistory.controller.ts` (2)
- Modify: `src/controllers/userHistory.controller.ts` (3)
- Modify: `src/controllers/cohortAnalytics.controller.ts` (1)
- Modify: `src/controllers/health.controller.ts` (1)
- Modify: `src/middleware/auth.middleware.ts` (1)
- Modify: `src/routes/ACroutes/activecampaign.routes.ts` (1)
- Modify: `src/routes/users.routes.ts` (1)
- Modify: `src/routes/validationLogs.routes.ts` (2)
- Modify: route owners as required
- Test: each domain's focused suites plus the shared SEC-10 contract suite

**Interfaces:**
- Inventory target: **70 -> 0**.
- Produces: SEC-10 code closure and an empty exact baseline.

- [ ] **Step 1: Split the tail into independently reviewable commits**

Use these commit groups and do not mix them: Clareza; Testimonials; engagement/course/lessons; auth/health/metrics; Guru analytics/listing; histories/tag evaluation; inline route tail.

- [ ] **Step 2: Characterize Front-visible responses**

Read the sibling Front consumers for Clareza, Testimonials, engagement, courses, auth and history. Preserve any intentional fallback string and status. Do not change success payload keys.

- [ ] **Step 3: Migrate with RED/GREEN per group**

Every group must lower exact membership. A newly discovered dead/shadowed route is reported and removed only after explicit approval and catalog update.

- [ ] **Step 4: Empty the baseline and strengthen the closure assertion**

Set:

```ts
localHttp500: []
```

and:

```ts
const DEBT_CEILING = {
  rawEnvironmentRead: 0,
  localHttp500: 0,
  publicErrorDetail: 0,
} as const
```

Rename/add the closure test to assert all three arrays are empty while retaining mutation/restoration proof.

- [ ] **Step 5: Run terminal SEC-10 gate and commit**

Expected: all gates GREEN and negative grep zero.

```powershell
git commit -m "refactor(errors): close remaining sec10 debt"
```

### Task 7: Create the ARCH-03 response-contract catalog

**Files:**
- Create: `src/contracts/response-contract-catalog.json`
- Create: `src/contracts/responseContract.ts`
- Create: `scripts/generate-response-contract-catalog.mjs`
- Create: `tests/contracts/responseContractCatalog.test.ts`
- Modify: `package.json` (add scripts only; update both lockfiles only if package metadata changes require it)

**Interfaces:**
- Produces `ResponseFamily`:

```ts
export type ResponseFamily =
  | 'success-data'
  | 'domain-envelope'
  | 'raw-json'
  | 'no-content'
  | 'redirect'
  | 'stream-or-file'
```

- Produces `ResponseContractDecision`:

```ts
export interface ResponseContractDecision {
  method: string
  path: string
  family: ResponseFamily
  shapeKeys: readonly string[]
  evidence: string
  frontConsumer: string | null
}
```

- Consumes: all 439 identities from `src/security/route-catalog.json`.

- [ ] **Step 1: Write the RED exact-membership test**

```ts
expect(contractIds).toEqual(routeIds)
expect(decisions.some((entry) => !entry.family)).toBe(false)
expect(decisions.some((entry) => !/\.ts:\d+$/.test(entry.evidence))).toBe(false)
```

Expected RED: catalog/module missing.

- [ ] **Step 2: Implement the generator and classification precedence**

The generator reads the route catalog, retains existing reviewed decisions by `METHOD path`, and fails if a route lacks one. Classification precedence is:

1. `redirect` for `res.redirect`;
2. `stream-or-file` for `sendFile`, `download`, streaming or manual response writes;
3. `no-content` for 204/sendStatus/no body;
4. `success-data` only when the success body is `{ success: true, data: ... }`;
5. `domain-envelope` for stable named domain keys;
6. `raw-json` for arrays or unwrapped objects.

Record sorted top-level `shapeKeys`, declaration evidence and a sibling-Front consumer path or `null`.

- [ ] **Step 3: Classify all 439 routes**

Resolve each route declaration to its handler, inspect all successful exits, and record the least-specific family that describes every success exit. If one route has incompatible success shapes, use `domain-envelope`, list the union of top-level keys and record the divergence in evidence.

- [ ] **Step 4: Add scripts**

```json
{
  "contracts:responses:check": "node scripts/generate-response-contract-catalog.mjs --check",
  "contracts:responses:update": "node scripts/generate-response-contract-catalog.mjs --write"
}
```

The normal check must never write. The update command is reviewer-controlled and cannot create `UNCLASSIFIED` entries.

- [ ] **Step 5: Run tests and commit**

```powershell
npm.cmd run contracts:responses:check
npx.cmd jest --ci --runInBand tests/contracts/responseContractCatalog.test.ts tests/security/routeCatalog.test.ts
git commit -m "feat(contracts): catalog response families"
```

### Task 8: Ratchet ARCH-03 and define the canonical new-code contract

**Files:**
- Modify: `src/contracts/responseContract.ts`
- Modify: `tests/contracts/responseContractCatalog.test.ts`
- Create: `tests/contracts/responseContractRatchet.test.ts`
- Modify: `docs/HARDENING-WORKPLAN.md`

**Interfaces:**
- Produces: `SuccessResponse<T> = { success: true; data: T }` for new JSON endpoints.
- Produces: a fail-closed test that names new/unclassified routes and changed response families.

- [ ] **Step 1: Define the new-code success type without migrating legacy routes**

```ts
export interface SuccessResponse<T> {
  success: true
  data: T
}

export function successResponse<T>(data: T): SuccessResponse<T> {
  return { success: true, data }
}
```

Do not introduce a response-sending helper; returning a typed value keeps Express status/header ownership at the boundary.

- [ ] **Step 2: Prove the ratchet catches an unclassified route**

Copy the route catalog to a temporary directory, append `GET /api/__contract_probe`, run the checker and assert a non-zero result naming that identity. Restore/delete the fixture in `finally`.

- [ ] **Step 3: Prove the ratchet catches family drift**

Mutate one copied decision from its recorded family to another valid family. Assert the checker reports the exact method/path and old/new family rather than accepting valid-enum churn.

- [ ] **Step 4: Document the ARCH-03 migration rule**

Record that future normalization is feature-by-feature, Front+Back atomic when consumed, and requires contract tests for loading/success/empty/error plus export/pagination behavior where applicable.

- [ ] **Step 5: Commit**

```powershell
git commit -m "test(contracts): ratchet response families"
```

### Task 9: Final verification, documentation and publication

**Files:**
- Modify: `docs/HARDENING-WORKPLAN.md`
- Create: `docs/reports/2026-08-10-sec10-arch03-foundation.md`

**Interfaces:**
- Records: exact SEC-10 188 -> 0 evidence, 439/439 response decisions, test counts and operationally open items.

- [ ] **Step 1: Run negative scans**

```powershell
rg -n "\.status\(\s*500\s*\)" src -g "*.ts"
rg -n "\.json\([^\n]*(error\.message|details\s*:)" src -g "*.ts"
```

Expected: zero executable matches. Comments are not accepted as debt and should be removed if misleading.

- [ ] **Step 2: Run the complete offline gate**

```powershell
npm.cmd run lint:baseline:prune
npm.cmd run lint
npm.cmd run types:check
npm.cmd run contracts:responses:check
$env:MONGOMS_RUNTIME_DOWNLOAD='false'
npm.cmd test -- --runInBand
npm.cmd run build
git diff --check
git diff --exit-code -- package-lock.json yarn.lock
```

Expected: all commands exit 0; no real integration access; no lockfile drift unless the approved package script metadata legitimately updated both lockfiles.

- [ ] **Step 3: Record honest closure**

Mark SEC-10 code-complete, ARCH-03 foundation complete, and ARCH-03 payload migration still open. Explicitly state that deployment/production observation is not complete.

- [ ] **Step 4: Commit and push only remake**

```powershell
git add docs/HARDENING-WORKPLAN.md docs/reports/2026-08-10-sec10-arch03-foundation.md
git commit -m "docs(remake): record sec10 and contract foundation"
$env:ALLOW_REMAKE_PUSH='confirmed'
git push origin remake
git status -sb
```

Expected: `HEAD` equals `origin/remake`, worktree clean, no commit on `main`.
