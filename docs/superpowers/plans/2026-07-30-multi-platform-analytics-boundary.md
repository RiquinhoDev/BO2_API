# Multi-Platform Analytics Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the final legacy analytics handler with a strict vertical slice that preserves `GET /api/analytics/multi-platform` exactly while reducing seven database reads/full scans to one bounded Mongo aggregation.

**Architecture:** A typed Mongoose reader produces one aggregate snapshot; a pure application service derives the legacy response and tie behavior; an injected controller maps failures to the shared redacting error boundary; runtime composition wires the slice behind `validatedSchema`. The legacy controller is deleted only after negative reference proof.

**Tech Stack:** TypeScript 5.9 strict, Express 5, Mongoose 8, Zod 3, Jest 29, Supertest, MongoMemoryServer 11 with MongoDB 8.2.6, existing `validatedSchema`/`withValidatedInput`, central `HttpError`, and route-catalog contract tests.

## Global Constraints

- Work only on the existing `remake` branch; never create or switch branches.
- Run entirely offline: no Guru, Hotmart, ActiveCampaign, CursEduca, Discord, or production Mongo access.
- Do not run `npm install`, `npm ci`, or delete `node_modules`.
- Preserve the route, authentication floor, exact success envelope, Portuguese insight strings, canonical and legacy identifiers, and current tie behavior.
- Make exactly one Mongo query for the slice: one `User.aggregate()` call with no `find`, `countDocuments`, cursor, or per-user query.
- Preserve both deletion defenses: top-level `isDeleted` and `discord.isDeleted`.
- Treat only finite numeric engagement values as numbers. Preserve raw numeric top-level legacy `engagement` through collection-level fixtures.
- Never introduce `any`, type-suppressing casts, non-null assertions, `@ts-ignore`, duplicate redaction, or new `console.*`.
- Rule #9: prove every removed file, export, import, and test is unreferenced before deleting it.
- Keep `engagementService.ts` and its Products consumer unchanged.
- Keep the route manifest at 437 entries and the catalog consumer as `desconhecido`.
- Preserve the staged `Front/scripts/git-hooks/pre-commit`; it must never enter a commit from this lot.
- Conventional Commit subjects are lowercase. Do not push without explicit current authorization.

## File Structure

### Task 1 — pure service

- Create `src/services/analytics/multiPlatformAnalytics.service.ts`
- Create `tests/services/analytics/multiPlatformAnalytics.service.test.ts`

### Task 2 — one-query Mongoose reader

- Create `src/services/analytics/mongooseMultiPlatformAnalytics.reader.ts`
- Create `tests/services/analytics/mongooseMultiPlatformAnalytics.reader.test.ts`

### Task 3 — strict HTTP boundary

- Create `src/security/multiPlatformAnalyticsInput.ts`
- Create `src/controllers/analytics/multiPlatformAnalytics.controller.ts`
- Create `tests/security/multiPlatformAnalyticsInput.test.ts`
- Create `tests/controllers/multiPlatformAnalytics.controller.test.ts`

### Task 4 — runtime wiring and legacy deletion

- Create `src/services/analytics/multiPlatformAnalytics.runtime.ts`
- Modify `src/routes/analytics.routes.ts`
- Modify `tests/routes/classAnalytics.routes.test.ts`
- Delete `src/controllers/analytics.controller.ts`
- Delete `tests/controllers/analytics.controller.test.ts`
- Modify `src/security/route-catalog.json`
- Modify `eslint-suppressions.json`

### Task 5 — evidence and full gates

- Modify `docs/HARDENING-WORKPLAN.md`

---

### Task 1: Build the pure contract-preserving application service

**Files:**
- Create: `src/services/analytics/multiPlatformAnalytics.service.ts`
- Create: `tests/services/analytics/multiPlatformAnalytics.service.test.ts`

- [ ] **Step 1: Write service tests first**

Create the test with a `readerWith(snapshot)` helper and cover:

1. a populated snapshot returns the exact legacy object;
2. zero totals produce zero averages and the exact empty-diversity string;
3. Hotmart wins `mostPopular` only when strictly greater than both;
4. CursEduca wins only when strictly greater than Discord after Hotmart loses;
5. every remaining tie resolves to Discord;
6. equal engagement averages resolve to CursEduca;
7. the reader is called exactly once and its failures propagate unchanged.

Use this representative assertion:

```ts
await expect(service.get()).resolves.toEqual({
  totalUsers: 10,
  activeUsers: 6,
  inactiveUsers: 4,
  platformStats: {
    hotmartUsers: 7,
    curseducaUsers: 5,
    discordUsers: 4,
    multiPlatformUsers: 3,
  },
  engagement: {
    hotmart: { total: 2, sum: 160, avg: 80 },
    curseduca: { total: 2, sum: 140, avg: 70 },
    combined: { total: 3, sum: 225, avg: 75 },
  },
  insights: {
    platformDiversity:
      '30.0% dos utilizadores estão em múltiplas plataformas',
    mostPopular: 'Hotmart',
    bestEngagement: 'Hotmart tem melhor engagement',
  },
})
```

- [ ] **Step 2: Run the new tests and verify RED**

```powershell
npx.cmd jest --ci --runInBand tests/services/analytics/multiPlatformAnalytics.service.test.ts
```

Expected: FAIL because the service module does not exist.

- [ ] **Step 3: Implement the reader port, public result, and service**

Define the approved snapshot and reader interfaces. Add explicit public result
interfaces so the controller does not invent response fields:

```ts
export interface PlatformEngagement {
  total: number
  sum: number
  avg: number
}

export interface MultiPlatformAnalyticsResult {
  totalUsers: number
  activeUsers: number
  inactiveUsers: number
  platformStats: {
    hotmartUsers: number
    curseducaUsers: number
    discordUsers: number
    multiPlatformUsers: number
  }
  engagement: {
    hotmart: PlatformEngagement
    curseduca: PlatformEngagement
    combined: PlatformEngagement
  }
  insights: {
    platformDiversity: string
    mostPopular: 'Hotmart' | 'Curseduca' | 'Discord'
    bestEngagement:
      | 'Hotmart tem melhor engagement'
      | 'Curseduca tem melhor engagement'
  }
}
```

Use one private `withAverage({ total, sum })` helper. It returns `avg: 0` when
`total === 0`; otherwise it preserves the unrounded `sum / total` behavior.
Implement the exact strict-`>` branches from the approved design. Do not add a
new `Empate` state or clamp data in the service.

- [ ] **Step 4: Run focused GREEN and static gates**

```powershell
npx.cmd jest --ci --runInBand tests/services/analytics/multiPlatformAnalytics.service.test.ts
npm.cmd run types:check
npm.cmd run lint
```

Expected: service tests and both static gates pass.

- [ ] **Step 5: Prove tie sensitivity by mutation**

Temporarily change the Hotmart popularity comparison from `>` to `>=`.

```powershell
npx.cmd jest --ci --runInBand tests/services/analytics/multiPlatformAnalytics.service.test.ts
```

Expected: RED on the Hotmart/CursEduca or Hotmart/Discord tie case. Restore the
strict comparison and rerun GREEN.

- [ ] **Step 6: Commit the pure service**

```powershell
git add src/services/analytics/multiPlatformAnalytics.service.ts tests/services/analytics/multiPlatformAnalytics.service.test.ts
git commit -m "refactor(analytics): add multi-platform service"
```

---

### Task 2: Replace all reads with one typed Mongo aggregation

**Files:**
- Create: `src/services/analytics/mongooseMultiPlatformAnalytics.reader.ts`
- Create: `tests/services/analytics/mongooseMultiPlatformAnalytics.reader.test.ts`

- [ ] **Step 1: Write the offline reader integration suite**

Start MongoMemoryServer with `MONGOMS_RUNTIME_DOWNLOAD=false`, binary `8.2.6`,
and `assertSafeTestMongoUri`. Insert raw fixtures with
`User.collection.insertMany` so Mongoose casting cannot erase legacy values.

The fixture matrix must include:

- a canonical Hotmart user;
- a legacy top-level Hotmart ID;
- a canonical CursEduca user;
- a legacy top-level CursEduca ID;
- canonical and legacy Discord arrays;
- one user in two platforms and one in all three;
- active states from `combined.status`, top-level `ACTIVE`, and top-level
  `ativo`;
- a top-level-deleted user and a Discord-deleted user;
- zero, negative, string, object, `NaN`, `Infinity`, and `-Infinity`
  engagement candidates;
- raw Decimal128 and unsafe Long engagement candidates on the same document,
  proving primitive double output and Hotmart-first combined precedence;
- exact `Number.MAX_VALUE` and `-Number.MAX_VALUE` candidates;
- a raw numeric top-level legacy `engagement`;
- a document with empty IDs/arrays;
- an empty collection case.

Assert the exact nested snapshot. Spy on `User.aggregate`, `User.find`, and
`User.countDocuments` and prove:

```ts
expect(aggregate).toHaveBeenCalledTimes(1)
expect(find).not.toHaveBeenCalled()
expect(countDocuments).not.toHaveBeenCalled()
```

Add a pipeline-structure assertion that the first `$match` contains both
deletion predicates. Do not assert the entire pipeline text.

- [ ] **Step 2: Run the reader suite and verify RED**

```powershell
npx.cmd jest --ci --runInBand tests/services/analytics/mongooseMultiPlatformAnalytics.reader.test.ts
```

Expected: FAIL because the reader module does not exist.

- [ ] **Step 3: Implement typed aggregation helpers**

Create a `PipelineStage[]` without assertions. Use small module-private helpers
whose return types are inferred from their object literals:

```ts
const hasIdentifier = (path: string) => ({
  $and: [
    { $ne: [path, null] },
    { $ne: [path, ''] },
  ],
})

const hasArrayValue = (path: string) => ({
  $gt: [
    {
      $size: {
        $cond: [{ $isArray: path }, path, []],
      },
    },
    0,
  ],
})

const finiteNonZeroDoubleOrNull = (path: string) => ({
  $let: {
    vars: {
      converted: {
        $cond: [
          { $isNumber: path },
          {
            $convert: {
              input: path,
              to: 'double',
              onError: null,
              onNull: null,
            },
          },
          null,
        ],
      },
    },
    in: {
      $cond: [
        {
          $and: [
            { $ne: ['$$converted', null] },
            { $gte: ['$$converted', -Number.MAX_VALUE] },
            { $lte: ['$$converted', Number.MAX_VALUE] },
            { $ne: ['$$converted', 0] },
          ],
        },
        '$$converted',
        null,
      ],
    },
  },
})
```

Guard the original candidate with `$isNumber` before conversion so strings and
objects remain invalid. Normalize accepted BSON numeric types with `$convert`
to `double`, using `onError` and `onNull` as `null`, before any score reaches
the typed reader port. The inclusive finite bounds preserve exact
`±Number.MAX_VALUE`, while rejecting infinities and preventing `NaN` from
reaching sums.

- [ ] **Step 4: Implement the one-query pipeline**

Use these stages:

1. `$match`:
   `isDeleted: { $ne: true }` and
   `'discord.isDeleted': { $ne: true }`.
2. First `$project`: `active`, three membership booleans, and nullable
   `hotmartScore`, `curseducaScore`, `legacyScore`.
3. Second `$project`: preserve the booleans and select `combinedScore` with
   `$switch` in Hotmart, CursEduca, legacy order.
4. `$group`: sum total/active/platform/multi-platform counts and the
   total/sum pairs.

For multi-platform count use the sum of the three boolean-to-`0|1` expressions
and count when it is at least two.

For platform engagement, count every non-null selected platform score,
including negative finite values, matching the legacy non-zero filter. For
combined engagement, count and sum only when `combinedScore > 0`.

Call only:

```ts
const rows = await User.aggregate<MultiPlatformAggregationRow>(pipeline)
  .option({ maxTimeMS: 120_000 })
  .exec()
```

Map the flat aggregation row to `MultiPlatformAnalyticsSnapshot`. When no row
exists, return one typed zero snapshot constant/factory; do not run a fallback
query.

- [ ] **Step 5: Run focused GREEN and static gates**

```powershell
npx.cmd jest --ci --runInBand tests/services/analytics/mongooseMultiPlatformAnalytics.reader.test.ts
npm.cmd run types:check
npm.cmd run lint
```

Expected: all pass offline.

- [ ] **Step 6: Run required reader mutations**

Apply each mutation separately and restore it before the next:

1. remove `'discord.isDeleted': { $ne: true }`;
2. remove the top-level legacy Hotmart or CursEduca ID branch;
3. add `await User.countDocuments({})` after the aggregation.

Run the reader suite after each mutation. Expected: each mutation produces RED:
wrong counts for 1/2, query-count failure for 3. Restore and rerun GREEN.

- [ ] **Step 7: Commit the reader**

```powershell
git add src/services/analytics/mongooseMultiPlatformAnalytics.reader.ts tests/services/analytics/mongooseMultiPlatformAnalytics.reader.test.ts
git commit -m "perf(analytics): aggregate platform metrics"
```

---

### Task 3: Add strict input and a redacting HTTP controller

**Files:**
- Create: `src/security/multiPlatformAnalyticsInput.ts`
- Create: `src/controllers/analytics/multiPlatformAnalytics.controller.ts`
- Create: `tests/security/multiPlatformAnalyticsInput.test.ts`
- Create: `tests/controllers/multiPlatformAnalytics.controller.test.ts`

- [ ] **Step 1: Write strict-input tests**

Mirror the approved benchmark/global input test pattern. Prove:

- `?__bo2_offline_loopback=1` becomes `{ params: {}, query: {}, body: {} }`;
- `extra=value` returns 400;
- `%24where=return%20true` returns 400;
- literal own `__proto__` in JSON returns 400 and does not pollute
  `Object.prototype`.

- [ ] **Step 2: Write controller tests**

Build an Express test app with correlation ID
`multi-platform-request-id`, `withValidatedInput`, and the shared final error
handler. Prove:

- exact success envelope is `{ success: true, ...result }` with no added
  `data`, timestamp, or metadata wrapper;
- the service is called once;
- a service failure returns:

```ts
{
  success: false,
  code: 'ANALYTICS_MULTI_PLATFORM_FAILED',
  message: 'Erro ao buscar analytics',
  correlationId: 'multi-platform-request-id',
}
```

- the response does not contain the dependency error detail;
- the injected logger receives the internal detail through the central handler.

- [ ] **Step 3: Run both suites and verify RED**

```powershell
npx.cmd jest --ci --runInBand tests/security/multiPlatformAnalyticsInput.test.ts tests/controllers/multiPlatformAnalytics.controller.test.ts
```

Expected: FAIL because the schema/controller modules do not exist.

- [ ] **Step 4: Implement schema and controller**

The schema is exactly:

```ts
export const multiPlatformAnalyticsInput = validatedSchema({
  params: {},
  query: {},
  body: {},
})
```

The factory returns a
`ValidatedInputHandler<typeof multiPlatformAnalyticsInput>`, invokes the
injected `Pick<MultiPlatformAnalyticsService, 'get'>`, and sends
`res.status(200).json({ success: true, ...result })`.

On failure call `next(new HttpError({ status: 500, code:
'ANALYTICS_MULTI_PLATFORM_FAILED', publicMessage:
'Erro ao buscar analytics', cause: error }))`. Do not log locally or expose the
cause.

- [ ] **Step 5: Run focused GREEN and error-leak mutation**

```powershell
npx.cmd jest --ci --runInBand tests/security/multiPlatformAnalyticsInput.test.ts tests/controllers/multiPlatformAnalytics.controller.test.ts
```

Temporarily add the caught error message to the JSON response. Expected: the
error-detail assertion turns RED. Restore the central `HttpError` flow and
rerun GREEN.

- [ ] **Step 6: Run static gates and commit**

```powershell
npm.cmd run types:check
npm.cmd run lint
git add src/security/multiPlatformAnalyticsInput.ts src/controllers/analytics/multiPlatformAnalytics.controller.ts tests/security/multiPlatformAnalyticsInput.test.ts tests/controllers/multiPlatformAnalytics.controller.test.ts
git commit -m "refactor(analytics): add multi-platform boundary"
```

---

### Task 4: Wire runtime, prove route ownership, and delete the legacy controller

**Files:**
- Create: `src/services/analytics/multiPlatformAnalytics.runtime.ts`
- Modify: `src/routes/analytics.routes.ts`
- Modify: `tests/routes/classAnalytics.routes.test.ts`
- Delete: `src/controllers/analytics.controller.ts`
- Delete: `tests/controllers/analytics.controller.test.ts`
- Modify: `src/security/route-catalog.json`
- Modify: `eslint-suppressions.json`

- [ ] **Step 1: Change the route test first**

Replace the legacy controller mock with:

```ts
jest.mock(
  '../../src/services/analytics/multiPlatformAnalytics.runtime',
  () => ({
    getMultiPlatformAnalytics:
      extractedHandler('getMultiPlatformAnalytics'),
  }),
)
```

Add tests proving:

- `GET /multi-platform?__bo2_offline_loopback=1` reaches the extracted handler
  with empty validated input;
- `?extra=value` returns 400 before the handler;
- a request body with an extra key returns 400 before the handler.

Remove the obsolete `legacyHandler` helper if the negative scan shows no other
test uses it.

- [ ] **Step 2: Run route test and verify RED**

```powershell
npx.cmd jest --ci --runInBand tests/routes/classAnalytics.routes.test.ts
```

Expected: RED because the runtime does not exist and the route still imports the
legacy controller.

- [ ] **Step 3: Add composition and rewire the route**

Create runtime composition only:

```ts
const reader = new MongooseMultiPlatformAnalyticsReader()
const service = new MultiPlatformAnalyticsService(reader)

export const getMultiPlatformAnalytics =
  createMultiPlatformAnalyticsController(service)
```

In `analytics.routes.ts`, remove the legacy controller import, import the new
runtime and input schema, and mount:

```ts
router.get(
  '/multi-platform',
  withValidatedInput(
    multiPlatformAnalyticsInput,
    getMultiPlatformAnalytics,
  ),
)
```

No import-time query is allowed.

- [ ] **Step 4: Prove the legacy files are now orphaned**

Run:

```powershell
rg -n "analyticsController|getMultiPlatformAnalytics|controllers/analytics\.controller" src tests
rg -n "getEngagementStatsByPlatform" src tests
```

Expected before deletion:

- `analyticsController` and `controllers/analytics.controller` occur only in
  the legacy controller/test that will be removed;
- live `getMultiPlatformAnalytics` references point only to the new
  controller/runtime/route/tests;
- `getEngagementStatsByPlatform` still has the Products consumer, so its
  service stays.

Delete `src/controllers/analytics.controller.ts` and its superseded controller
test. Do not touch `engagementService.ts` or Products.

- [ ] **Step 5: Update route evidence and lint suppressions**

The manifest path/method remain unchanged. Update every
`src/routes/analytics.routes.ts:<line>` evidence entry whose route line shifted,
including multi-platform. Do not regenerate or reorder the manifest.

Run:

```powershell
npm.cmd run lint:baseline:prune
npx.cmd jest --ci --runInBand tests/security/routeCatalog.test.ts tests/routes/classAnalytics.routes.test.ts
```

Expected: catalog and route tests pass; manifest and catalog remain 437/437.

- [ ] **Step 6: Prove deleted-handler mutation sensitivity**

Temporarily rewire `/multi-platform` to a local unvalidated legacy-style
handler or remove `withValidatedInput`. Run:

```powershell
npx.cmd jest --ci --runInBand tests/routes/classAnalytics.routes.test.ts
```

Expected: RED on extracted ownership and/or extra-input rejection. Restore the
validated runtime mount and rerun GREEN.

- [ ] **Step 7: Run focused slice tests and commit**

```powershell
npx.cmd jest --ci --runInBand tests/services/analytics/multiPlatformAnalytics.service.test.ts tests/services/analytics/mongooseMultiPlatformAnalytics.reader.test.ts tests/security/multiPlatformAnalyticsInput.test.ts tests/controllers/multiPlatformAnalytics.controller.test.ts tests/routes/classAnalytics.routes.test.ts tests/security/routeCatalog.test.ts
npm.cmd run types:check
npm.cmd run lint
git add src/services/analytics/multiPlatformAnalytics.runtime.ts src/routes/analytics.routes.ts tests/routes/classAnalytics.routes.test.ts src/security/route-catalog.json eslint-suppressions.json
git add -u src/controllers/analytics.controller.ts tests/controllers/analytics.controller.test.ts
git commit -m "refactor(analytics): remove legacy controller"
```

---

### Task 5: Record evidence and run both repositories' complete gates

**Files:**
- Modify: `docs/HARDENING-WORKPLAN.md`

- [ ] **Step 1: Run final negative scans**

```powershell
Test-Path src/controllers/analytics.controller.ts
rg -n "analyticsController|controllers/analytics\.controller" src tests
rg -n "console\.|:\s*any\b|as any|@ts-ignore" src/controllers/analytics src/services/analytics src/security/multiPlatformAnalyticsInput.ts
git diff --check
```

Expected: the file is absent; old symbols have zero hits; no new prohibited
construct appears. Review legitimate pre-existing hits manually rather than
weakening the scan.

- [ ] **Step 2: Run complete BO2_API gates**

```powershell
npm.cmd run lint
npm.cmd run types:check
npx.cmd jest --ci --runInBand
npm.cmd run build
```

Expected: lint 0, TypeScript ratchet 0/0, all Jest suites green with only the
documented skips, and build exit 0.

- [ ] **Step 3: Run complete Front contract/static gates**

From the sibling Front repo, first verify its branch and staged state:

```powershell
git -C ..\Front status -sb
git -C ..\Front diff --cached --name-only
npm.cmd --prefix ..\Front test -- --runInBand src/features/analytics src/__tests__/transportContract.test.ts
npm.cmd --prefix ..\Front run lint
npm.cmd --prefix ..\Front run build
```

If that test command does not match the Front package scripts, inspect
`..\Front\package.json` and run the existing equivalent without installing
anything. The staged hook must remain the only pre-existing Front change and
must not be committed.

- [ ] **Step 4: Record measured outcomes**

Update `docs/HARDENING-WORKPLAN.md` with:

- one aggregation versus the removed five counts/two scans;
- test/suite totals from fresh output;
- route catalog/manifest 437/437;
- exact deleted legacy files;
- mutation RED/GREEN evidence;
- no production/external integration used;
- any pre-existing warnings, clearly separated from failures.

Do not write target numbers as if they were measured.

- [ ] **Step 5: Commit evidence**

```powershell
git add docs/HARDENING-WORKPLAN.md
git commit -m "docs(analytics): record multi-platform boundary"
```

- [ ] **Step 6: Final independent review before reporting**

Review every commit and the total diff:

```powershell
git log --oneline --decorate -6
git diff 33ff611..HEAD --stat
git diff 33ff611..HEAD
git status -sb
git -C ..\Front status -sb
```

Confirm:

- exact public contract and tie behavior;
- one aggregate query and no fallback scan;
- finite-number defenses;
- strict validated route;
- central error redaction;
- no dead legacy controller;
- no unrelated files;
- BO2_API clean except being ahead;
- Front retains only its pre-existing staged hook.

Do not push. Report commits, fresh gates, mutations, warnings, and remaining
out-of-scope debt to the user.
