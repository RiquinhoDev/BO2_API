# Users V2 Analytics Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inline users V2 stats and product-comparison handlers with strict, typed, scalable vertical slices while preserving their HTTP contracts.

**Architecture:** Pure health and engagement rules feed application services behind narrow reader ports. Mongoose adapters perform one stats aggregation and two projected comparison reads; injected controllers expose them through the existing strict boundary and central error handler.

**Tech Stack:** TypeScript 5.9 strict mode, Express 5.1, Mongoose 8, Zod 3.25, Jest 29, Supertest 7, MongoMemoryServer 11.

## Global Constraints

- Work only on branch `remake`; never commit on or merge into `main`.
- Use the approved design at `docs/superpowers/specs/2026-07-30-users-v2-analytics-boundary-design.md`.
- Never call Guru, Hotmart, ActiveCampaign, CursEduca, Discord, production Mongo, or any production deployment.
- Set `MONGOMS_RUNTIME_DOWNLOAD=false` and use the existing cached MongoDB binary; do not run `npm install`, `npm ci`, or delete `node_modules`.
- Preserve `GET /api/users/v2/stats` and `GET /api/users/v2/engagement/comparison` paths and response envelopes.
- Preserve `totalStudents` as active-enrollment count; do not reinterpret it as unique users.
- Preserve comparison `trend` as the literal compatibility sentinel `0`; never invent historical data.
- Do not modify `/api/users/v2/engagement/heatmap` behavior or copy its random-score logic.
- Use `validatedSchema` and `withValidatedInput`; do not add manual allowlists.
- New runtime code may not introduce `console`, explicit `any`, assertion casts, non-null assertions, TypeScript suppressions, or swallowed errors.
- Follow RED/GREEN for every behavior change. Run tests in the sandbox with the offline loopback marker where HTTP is involved.
- Use one subject per commit and Conventional Commits with a lowercase subject.
- Do not push without explicit authorization.

---

## File map

### New production files

- `src/services/syncUtilizadoresServices/engagement/platformEngagementNormalizer.ts`
  - Pure unknown-input normalization shared by existing calculators and the
    comparison slice.
- `src/services/analytics/healthScore.ts`
  - Pure canonical health formula shared by the materialized dashboard builder
    and the users V2 stats slice.
- `src/services/users/usersV2Analytics.service.ts`
  - Ports, DTOs, stats service, comparison service, and deterministic grouping.
- `src/services/users/mongooseUsersV2Stats.reader.ts`
  - One bounded stats aggregation.
- `src/services/users/mongooseUsersV2Comparison.reader.ts`
  - Projected product and active-enrollment reads.
- `src/security/usersV2AnalyticsInput.ts`
  - Independent strict-empty schemas for the two endpoints.
- `src/controllers/users/usersV2Analytics.controller.ts`
  - Injected HTTP adapters and typed `HttpError` mapping.
- `src/services/users/usersV2Analytics.runtime.ts`
  - Import-safe dependency composition.

### Modified production files

- `src/services/syncUtilizadoresServices/engagement/engagementCalculator.service.ts`
  - Consume the shared normalizer without changing public calculator behavior.
- `src/services/dashboardStatsBuilder.service.ts`
  - Consume the shared health calculator.
- `src/routes/users.routes.ts`
  - Replace two inline handlers with validated runtime handlers and remove only
    imports/types made orphaned by that extraction.
- `src/security/route-catalog.json`
  - Refresh every shifted `users.routes.ts` evidence line; route decisions and
    count remain unchanged.
- `eslint-suppressions.json`
  - Prune only suppressions made obsolete by the touched files.
- `docs/HARDENING-WORKPLAN.md`
  - Record the completed boundary, measured query reduction, tests, and the
    heatmap follow-up trigger.

### New test files

- `tests/services/engagement/platformEngagementNormalizer.test.ts`
- `tests/services/engagement/engagementCalculator.service.test.ts`
- `tests/services/analytics/healthScore.test.ts`
- `tests/services/users/usersV2Analytics.service.test.ts`
- `tests/services/users/mongooseUsersV2Stats.reader.test.ts`
- `tests/services/users/mongooseUsersV2Comparison.reader.test.ts`
- `tests/security/usersV2AnalyticsInput.test.ts`
- `tests/controllers/usersV2Analytics.controller.test.ts`
- `tests/routes/usersV2Analytics.routes.test.ts`

---

### Task 1: Extract the platform engagement normalizer

**Files:**
- Create: `src/services/syncUtilizadoresServices/engagement/platformEngagementNormalizer.ts`
- Modify: `src/services/syncUtilizadoresServices/engagement/engagementCalculator.service.ts`
- Create: `tests/services/engagement/platformEngagementNormalizer.test.ts`
- Create: `tests/services/engagement/engagementCalculator.service.test.ts`
- Modify: `eslint-suppressions.json`

**Interfaces:**
- Consumes: `{ platform: string, engagement: unknown }`
- Produces:

```ts
export function normalizePlatformEngagement(
  platform: string,
  engagement: unknown,
): number
```

- Preserves Hotmart, CursEduca, Discord, clamping, and unknown-platform
  semantics used by `calculateUserAverageEngagement` and
  `calculateBatchAverageEngagement`.

- [ ] **Step 1: Write characterization tests for every existing branch**

Create table-driven tests with these exact expectations:

```ts
it.each([
  ['hotmart', { engagementScore: 80 }, 80],
  ['hotmart', { engagementScore: 140 }, 100],
  ['hotmart', { engagementScore: -4 }, 0],
  ['curseduca', { engagementScore: 61 }, 61],
  ['curseduca', { alternativeEngagement: 47 }, 47],
  ['curseduca', { activityLevel: 'HIGH' }, 75],
  ['curseduca', { activityLevel: 'medium' }, 45],
  ['curseduca', { activityLevel: 'LOW' }, 15],
  ['discord', { engagementScore: 0 }, 0],
  ['discord', { engagementScore: 10 }, 15],
  ['discord', { engagementScore: 50 }, 35],
  ['discord', { engagementScore: 100 }, 60],
  ['discord', { engagementScore: 150 }, 80],
  ['discord', { engagementScore: 200 }, 100],
  ['future-platform', { engagementScore: 90 }, 0],
] as const)('%s normalizes %#', (platform, engagement, expected) => {
  expect(normalizePlatformEngagement(platform, engagement)).toBe(expected)
})
```

Add malformed cases for `null`, arrays, strings, objects without supported
fields, `NaN`, and both infinities. Every malformed case returns zero.

In `engagementCalculator.service.test.ts`, mock the existing
`UserProduct.find(...).lean()` chain and characterize both exported consumers:

- `calculateUserAverageEngagement` returns rounded score `60`, two breakdown
  rows, and `totalPlatforms: 2` for Hotmart `80` plus CursEduca `40`;
- `calculateBatchAverageEngagement` returns the same score for that user and a
  zero result for a requested user without active products;
- unknown-platform engagement contributes no normalized breakdown row.

- [ ] **Step 2: Run the focused test and prove RED**

Run:

```powershell
npx.cmd jest tests/services/engagement/platformEngagementNormalizer.test.ts --runInBand
```

Expected: FAIL because `platformEngagementNormalizer` does not exist.

- [ ] **Step 3: Implement explicit unknown narrowing**

Use a record guard and finite-number reader:

```ts
type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finiteNumber(
  record: UnknownRecord,
  key: string,
): number | undefined {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined
}

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, value))
}
```

Implement the existing Discord piecewise formula exactly. Unknown platforms
return zero without writing to `console`.

- [ ] **Step 4: Rewire both existing calculators**

Delete the private normalizer functions from
`engagementCalculator.service.ts`, import the shared function, and replace
`NormalizedEngagement.originalScore: any` with
`NormalizedEngagement.originalScore: unknown`.

Do not change:

- score rounding;
- `normalizedScore > 0` filtering;
- equal weighting;
- engagement levels;
- result envelopes.

- [ ] **Step 5: Run characterization and existing calculator tests**

Run:

```powershell
npx.cmd jest tests/services/engagement/platformEngagementNormalizer.test.ts tests/services/engagement/engagementCalculator.service.test.ts --runInBand
npm.cmd run types:check
```

Expected: both suites PASS and the TypeScript ratchet remains `0/0`.

- [ ] **Step 6: Prove the extraction with a mutation**

Temporarily change the CursEduca `MEDIUM` mapping from `45` to `46`.

Run:

```powershell
npx.cmd jest tests/services/engagement/platformEngagementNormalizer.test.ts --runInBand
```

Expected: RED on the exact medium activity-level case. Restore `45` and rerun
to GREEN.

- [ ] **Step 7: Prune lint suppressions and commit**

Run:

```powershell
npm.cmd run lint:baseline:prune
npm.cmd run lint
git diff --check
```

Stage only the four task files and commit:

```powershell
git commit -m "refactor(engagement): extract score normalizer"
```

---

### Task 2: Extract the canonical health calculator

**Files:**
- Create: `src/services/analytics/healthScore.ts`
- Modify: `src/services/dashboardStatsBuilder.service.ts`
- Create: `tests/services/analytics/healthScore.test.ts`
- Modify: `eslint-suppressions.json`

**Interfaces:**
- Produces:

```ts
export interface HealthScoreInput {
  avgEngagement: number
  activeCount: number
  totalCount: number
  newLast7Days: number
  avgProgress: number
}

export interface HealthScoreResult {
  healthScore: number
  healthLevel: 'EXCELENTE' | 'BOM' | 'RAZOÁVEL' | 'CRÍTICO'
  healthBreakdown: {
    engagement: number
    retention: number
    growth: number
    progress: number
  }
}

export function calculateHealthScore(
  input: HealthScoreInput,
): HealthScoreResult
```

- [ ] **Step 1: Write formula and threshold tests**

Cover:

```ts
expect(calculateHealthScore({
  avgEngagement: 80,
  activeCount: 80,
  totalCount: 100,
  newLast7Days: 5,
  avgProgress: 60,
})).toEqual({
  healthScore: 72,
  healthLevel: 'RAZOÁVEL',
  healthBreakdown: {
    engagement: 80,
    retention: 80,
    growth: 50,
    progress: 60,
  },
})
```

Add exact boundary cases for scores 85, 75, and 60; zero total must produce
zero retention/growth and no `NaN`. Preserve the existing weighted formula for
engagement and progress inputs without introducing new clamping semantics.

- [ ] **Step 2: Run the focused test and prove RED**

```powershell
npx.cmd jest tests/services/analytics/healthScore.test.ts --runInBand
```

Expected: FAIL because `healthScore.ts` does not exist.

- [ ] **Step 3: Implement the pure formula**

Use safe ratio helpers:

```ts
function percentage(numerator: number, denominator: number): number {
  return denominator <= 0
    ? 0
    : Math.min(100, Math.round((numerator / denominator) * 100))
}

const retention = percentage(activeCount, totalCount)
const growth = totalCount <= 0
  ? 0
  : Math.min(100, Math.round((newLast7Days / totalCount) * 1000))
```

Calculate the existing weighted score unchanged and assign the four exact
canonical levels.

- [ ] **Step 4: Replace the builder’s inline formula**

Import `calculateHealthScore` and replace only the block that calculates
retention, growth, score, level, and breakdown. Preserve persisted field names,
builder inputs, logs, version, and write behavior.

- [ ] **Step 5: Run RED/GREEN mutation and focused gates**

Temporarily change the engagement weight from `0.4` to `0.5`; the `72` test must
fail. Restore it, then run:

```powershell
npx.cmd jest tests/services/analytics/healthScore.test.ts --runInBand
npm.cmd run types:check
npm.cmd run lint:baseline:prune
npm.cmd run lint
git diff --check
```

Expected: all commands exit `0`.

- [ ] **Step 6: Commit**

```powershell
git commit -m "refactor(analytics): share health score"
```

---

### Task 3: Build the stats service and one-query Mongo reader

**Files:**
- Create: `src/services/users/usersV2Analytics.service.ts`
- Create: `src/services/users/mongooseUsersV2Stats.reader.ts`
- Create: `tests/services/users/usersV2Analytics.service.test.ts`
- Create: `tests/services/users/mongooseUsersV2Stats.reader.test.ts`

**Interfaces:**
- Consumes `calculateHealthScore` from Task 2.
- Produces:

```ts
export interface UsersV2StatsSnapshot {
  totalStudents: number
  engagementSum: number
  progressSum: number
  atRiskCount: number
  inactive30d: number
  new7d: number
  activeProducts: number
  byPlatform: Array<{ platform: string; count: number }>
}

export interface UsersV2StatsReader {
  read(now: Date): Promise<UsersV2StatsSnapshot>
}

export interface Clock {
  now(): Date
}

export class UsersV2StatsService {
  constructor(
    reader: UsersV2StatsReader,
    clock: Clock,
  )
  get(): Promise<UsersV2StatsResult>
}
```

- [ ] **Step 1: Write pure service tests**

Use a fixed clock (`2026-07-30T12:00:00.000Z`) and a reader stub. Assert the
complete existing public structure for a populated snapshot:

- averages divide by `totalStudents`, preserving missing-value-as-zero behavior;
- `activeCount === totalStudents`;
- `activeRate === 100`;
- `topPerformers === Math.ceil(totalStudents * 0.1)`;
- platform names/icons/percentages and descending count order;
- quick filters;
- `meta.calculatedAt` equals the fixed clock;
- `meta.durationMs` remains the compatibility sentinel `0`;
- health fields equal the shared helper output, never the old fixed 75.

For a zero snapshot, assert zero averages, rates, percentages, health, and an
empty platform list.

- [ ] **Step 2: Run service tests and prove RED**

```powershell
npx.cmd jest tests/services/users/usersV2Analytics.service.test.ts --runInBand
```

Expected: FAIL because the service module does not exist.

- [ ] **Step 3: Implement the service without framework imports**

Compute:

```ts
const avgEngagement = totalStudents === 0
  ? 0
  : engagementSum / totalStudents
const avgProgress = totalStudents === 0
  ? 0
  : progressSum / totalStudents
const atRiskRate = totalStudents === 0
  ? 0
  : (atRiskCount / totalStudents) * 100
```

Use `clock.now()` once per call for the reader cutoff and response timestamp.
Keep `durationMs: 0`, matching the current response without introducing a
second timing dependency in this slice.

- [ ] **Step 4: Write Mongo reader integration tests**

Start MongoMemoryServer with:

```ts
process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
binary: { version: '8.2.6' }
```

Seed through `User.collection` and `UserProduct.collection`:

- active and inactive enrollments;
- two enrollments for one user to prove enrollment counting;
- missing and old Discord activity;
- dates exactly at and one millisecond outside 7/30-day cutoffs;
- multiple products and platforms;
- missing, Decimal128, Long, string, object, `NaN`, and infinite score values.

Spy on `UserProduct.aggregate`, `UserProduct.find`,
`UserProduct.countDocuments`, and `User.find`. Expect exactly one aggregate
call and zero fallback queries.

- [ ] **Step 5: Run the reader test and prove RED**

```powershell
npx.cmd jest tests/services/users/mongooseUsersV2Stats.reader.test.ts --runInBand
```

Expected: FAIL because the reader does not exist.

- [ ] **Step 6: Implement the aggregation**

Use:

```ts
const inactiveCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
const newCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
```

Pipeline requirements:

1. `$match: { status: 'ACTIVE' }`;
2. `$project` containing only `userId`, `productId`, `platform`, `enrolledAt`,
   `engagement.engagementScore`, and `progress.percentage`, with `_id: 0` to
   exclude MongoDB's implicitly included identifier;
3. `$lookup` from `User.collection.name`, matching `_id` to `userId`, with a
   projection containing only `discord.engagement.lastMessageDate`;
4. `$set` numeric score/progress using `$isNumber` plus `$convert` to double;
5. `$facet` scalar totals, distinct products, and platform groups;
6. final `$project` into the exact snapshot fields.

Use `$lt` for inactivity and `$gte` for seven-day new enrollment. Missing user
activity contributes zero. Treat missing platform as `unknown`.

- [ ] **Step 7: Run stats tests and mutations**

Run:

```powershell
npx.cmd jest tests/services/users/usersV2Analytics.service.test.ts tests/services/users/mongooseUsersV2Stats.reader.test.ts --runInBand
```

Then separately mutate:

1. count distinct users instead of enrollments;
2. change seven-day `$gte` to `$gt`;
3. count missing activity as inactive;
4. add a fallback `find`.

Each mutation must produce RED. Restore each before the next mutation, then
rerun to GREEN.

- [ ] **Step 8: Run task gates and commit**

```powershell
npm.cmd run types:check
npm.cmd run lint
git diff --check
git commit -m "feat(users): add v2 stats service"
```

---

### Task 4: Build the linear product-comparison service and reader

**Files:**
- Modify: `src/services/users/usersV2Analytics.service.ts`
- Create: `src/services/users/mongooseUsersV2Comparison.reader.ts`
- Modify: `tests/services/users/usersV2Analytics.service.test.ts`
- Create: `tests/services/users/mongooseUsersV2Comparison.reader.test.ts`

**Interfaces:**
- Consumes `normalizePlatformEngagement` from Task 1.
- Produces:

```ts
export interface UsersV2ComparisonProduct {
  id: string
  name: string
  platform: string
}

export interface UsersV2ComparisonEnrollment {
  userId: string
  productId: string
  platform: string
  engagement: unknown
}

export interface UsersV2ComparisonSnapshot {
  products: UsersV2ComparisonProduct[]
  enrollments: UsersV2ComparisonEnrollment[]
}

export interface UsersV2ComparisonReader {
  read(): Promise<UsersV2ComparisonSnapshot>
}

export class UsersV2ComparisonService {
  constructor(reader: UsersV2ComparisonReader)
  get(): Promise<UsersV2ComparisonResult[]>
}
```

- [ ] **Step 1: Write service tests for grouping and compatibility**

Seed the reader stub with:

- one user enrolled in Hotmart score 80 and CursEduca score 40;
- another user in the same product with score 20;
- products with no enrollments;
- products tied on enrollment count.

Assert:

- the first user’s normalized average is 60 in every product row that refers to
  that user;
- the existing bands are `>=60 alto`, `>=40 && <60 medio`,
  `>=25 && <40 baixo`, and `<25 risco`;
- percentages round exactly as the current handler;
- empty products return zero totals and percentages;
- sorting is total descending then product ID ascending;
- every item has `trend: 0`.

- [ ] **Step 2: Prove RED**

```powershell
npx.cmd jest tests/services/users/usersV2Analytics.service.test.ts --runInBand
```

Expected: FAIL because comparison interfaces/service are absent.

- [ ] **Step 3: Implement two linear groupings**

Use:

```ts
const byUser = new Map<string, UsersV2ComparisonEnrollment[]>()
const userAverage = new Map<string, number>()
const scoresByProduct = new Map<string, number[]>()
```

Build `byUser` in one enrollment pass. Normalize each user’s positive scores
once, calculate the rounded equal-weight average, then perform one enrollment
pass to append that user average to the relevant product.

Do not use `products.map(...enrollments.filter(...))`.

- [ ] **Step 4: Write projected-reader tests**

Mock Mongoose query chains and assert:

```ts
Product.find({}).select('_id name platform').lean()
UserProduct.find({ status: 'ACTIVE' })
  .select('userId productId platform engagement')
  .lean()
```

Assert output IDs are strings, exactly two reads occur, `populate` is never
used, and `calculateBatchAverageEngagement` is not imported or called.

- [ ] **Step 5: Prove RED, implement the reader, and reach GREEN**

Run the reader test before implementation and require module-not-found RED.
Implement explicit lean-row types and ObjectId-to-string normalization without
assertion casts.

Run:

```powershell
npx.cmd jest tests/services/users/usersV2Analytics.service.test.ts tests/services/users/mongooseUsersV2Comparison.reader.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Prove complexity and sentinel mutations**

Temporarily:

1. replace the score map lookup with `enrollments.filter` inside the product
   loop;
2. change `trend: 0` to `trend: 1`;
3. remove the empty-product result.

Use a `Proxy`/spy counter in the service test to make the first mutation exceed
the asserted linear number of enrollment iterations. Each mutation must fail;
restore and rerun.

- [ ] **Step 7: Run task gates and commit**

```powershell
npm.cmd run types:check
npm.cmd run lint
git diff --check
git commit -m "perf(users): bound v2 product comparison"
```

---

### Task 5: Add strict HTTP controllers and runtime composition

**Files:**
- Create: `src/security/usersV2AnalyticsInput.ts`
- Create: `src/controllers/users/usersV2Analytics.controller.ts`
- Create: `src/services/users/usersV2Analytics.runtime.ts`
- Create: `tests/security/usersV2AnalyticsInput.test.ts`
- Create: `tests/controllers/usersV2Analytics.controller.test.ts`

**Interfaces:**
- Consumes `UsersV2StatsService.get()` and
  `UsersV2ComparisonService.get()`.
- Produces:

```ts
export function createUsersV2StatsController(
  service: Pick<UsersV2StatsService, 'get'>,
): ValidatedInputHandler<typeof usersV2StatsInput>

export function createUsersV2ComparisonController(
  service: Pick<UsersV2ComparisonService, 'get'>,
): ValidatedInputHandler<typeof usersV2ComparisonInput>

export const getUsersV2Stats: ValidatedInputHandler<
  typeof usersV2StatsInput
>

export const getUsersV2Comparison: ValidatedInputHandler<
  typeof usersV2ComparisonInput
>
```

- [ ] **Step 1: Write strict input tests**

Mount each schema through `app.all`. Prove:

- the offline marker is removed and yields `{ params:{}, query:{}, body:{} }`;
- `extra=value`, `%24where=return%20true`, and `filter.name=unsafe` return 400;
- a literal own `__proto__` JSON property returns 400 without polluting
  `Object.prototype`;
- adding a query field to one schema does not make it valid in the other.

- [ ] **Step 2: Run and require RED**

```powershell
npx.cmd jest tests/security/usersV2AnalyticsInput.test.ts --runInBand
```

Expected: FAIL because the schema module is absent.

- [ ] **Step 3: Implement the two strict schemas**

Use `validatedSchema({ params: {}, query: {}, body: {} })` twice with distinct
exports. Do not call `.strict()` at call sites; the shared builder owns it.

- [ ] **Step 4: Write controller tests**

Mount each injected controller in a small Express app with
`createErrorHandling`. Assert:

- stats success is `{ success: true, data: statsResult }`;
- comparison success is `{ success: true, data: comparisonResult }`;
- failures return the exact public codes/messages;
- correlation ID is present;
- dependency error detail appears once in the injected logger and never in the
  response.

- [ ] **Step 5: Run and require RED**

```powershell
npx.cmd jest tests/controllers/usersV2Analytics.controller.test.ts --runInBand
```

Expected: FAIL because controller factories are absent.

- [ ] **Step 6: Implement controllers and runtime**

Controllers call `next(new HttpError(...))` on failure. Runtime creates:

```ts
const clock: Clock = { now: () => new Date() }
const statsService = new UsersV2StatsService(
  new MongooseUsersV2StatsReader(),
  clock,
)
const comparisonService = new UsersV2ComparisonService(
  new MongooseUsersV2ComparisonReader(),
)
```

Export composed handlers. Add an import-purity test that mocks model methods,
imports the runtime, and proves no query or connection runs during import.

- [ ] **Step 7: Prove error-exposure mutation**

Temporarily use `errorMessage(error)` as the public message. The controller test
must fail because the dependency detail reaches the response. Restore the
stable message and rerun.

- [ ] **Step 8: Run task gates and commit**

```powershell
npx.cmd jest tests/security/usersV2AnalyticsInput.test.ts tests/controllers/usersV2Analytics.controller.test.ts --runInBand
npm.cmd run types:check
npm.cmd run lint
git diff --check
git commit -m "refactor(users): add v2 analytics boundary"
```

---

### Task 6: Rewire routes, remove inline code, and close the lot

**Files:**
- Modify: `src/routes/users.routes.ts`
- Create: `tests/routes/usersV2Analytics.routes.test.ts`
- Modify: `tests/security/usersDestructiveValidation.test.ts`
- Modify: `src/security/route-catalog.json`
- Modify: `docs/HARDENING-WORKPLAN.md`
- Modify: `eslint-suppressions.json`

**Interfaces:**
- Consumes runtime handlers and strict schemas from Task 5.
- Preserves exactly 437 catalog and 437 manifest entries.

- [ ] **Step 1: Write route-wiring tests before rewiring**

Mock:

```ts
jest.mock('../../src/services/users/usersV2Analytics.runtime', () => ({
  getUsersV2Stats: jest.fn((_input, _req, res) =>
    res.status(200).json({ source: 'stats-runtime' })),
  getUsersV2Comparison: jest.fn((_input, _req, res) =>
    res.status(200).json({ source: 'comparison-runtime' })),
}))
```

Mount `usersRouter` and assert:

- both exact paths reach their runtime mock;
- an unknown query returns 400 before the runtime mock;
- neighboring `/api/users/v2` and heatmap routes still exist;
- route source has no `router.get('/v2/stats', async` or
  `router.get('/v2/engagement/comparison', async`.

Update the existing destructive-route test mock so importing the router does
not instantiate real dependencies.

- [ ] **Step 2: Run and require RED**

```powershell
npx.cmd jest tests/routes/usersV2Analytics.routes.test.ts --runInBand
```

Expected: FAIL because the router still uses inline handlers.

- [ ] **Step 3: Rewire only the two approved routes**

Import the schemas, runtime handlers, and `withValidatedInput`. Replace the
inline blocks. Remove route-local types/imports only when:

```powershell
rg -n "PopulatedProduct|UserIdOnly|calculateBatchAverageEngagement" src/routes/users.routes.ts
```

shows that the extraction made them orphaned. Do not edit any line inside the
heatmap handler.

- [ ] **Step 4: Refresh catalog evidence without changing decisions**

List every catalog record whose evidence contains `src/routes/users.routes.ts`.
For each, update only the numeric line to the route’s new source line. Preserve:

- method;
- path;
- access;
- consumer;
- writes/destructive flags;
- evidence text before `rota em`.

Run:

```powershell
npx.cmd jest tests/security/routeCatalog.test.ts tests/security/defaultDenyAuth.test.ts --runInBand
```

Expected: 437/437 with no orphan or undecided route.

- [ ] **Step 5: Prove all route mutations**

Separately:

1. bypass `withValidatedInput` on stats;
2. wire comparison to the stats runtime;
3. restore one inline async handler.

Each mutation must make `usersV2Analytics.routes.test.ts` fail. Restore and
rerun after each mutation.

- [ ] **Step 6: Prune suppressions and update the workplan**

Run `npm.cmd run lint:baseline:prune`. Record in the workplan:

- users router line reduction;
- stats query count before/after;
- comparison enrollment scans and complexity before/after;
- exact focused/full test counts;
- catalog/manifest `437/437`;
- heatmap remains unresolved and random logic was not copied.

- [ ] **Step 7: Run focused sandbox verification**

```powershell
$env:MONGOMS_RUNTIME_DOWNLOAD='false'
npx.cmd jest tests/services/engagement/platformEngagementNormalizer.test.ts tests/services/analytics/healthScore.test.ts tests/services/users/usersV2Analytics.service.test.ts tests/services/users/mongooseUsersV2Stats.reader.test.ts tests/services/users/mongooseUsersV2Comparison.reader.test.ts tests/security/usersV2AnalyticsInput.test.ts tests/controllers/usersV2Analytics.controller.test.ts tests/routes/usersV2Analytics.routes.test.ts tests/security/routeCatalog.test.ts tests/security/defaultDenyAuth.test.ts --runInBand
```

Expected: all listed suites pass with no skipped new test and no network
attempt.

- [ ] **Step 8: Run the full backend gate**

```powershell
npm.cmd run lint
npm.cmd run types:check
npx.cmd jest --ci --runInBand
npm.cmd run build
```

Expected: four exit codes `0`, TypeScript `0/0`, and no real integration call.

- [ ] **Step 9: Run the Front contract gate**

From the sibling Front repository, run only the existing backend-route contract
suite, then its lint and build commands. Do not modify Front source or its
manifest because no route was added or removed.

Expected: route contract unchanged and all commands exit `0`.

- [ ] **Step 10: Run final negative scans**

```powershell
rg -n "router\\.get\\('/v2/stats', async|router\\.get\\('/v2/engagement/comparison', async" src/routes/users.routes.ts
rg -n "Math\\.random" src/routes/users.routes.ts
rg -n "healthScore:\\s*75" src/routes/users.routes.ts src/services/users
rg -n "calculateBatchAverageEngagement" src/routes/users.routes.ts src/services/users
git diff --check
git status --short
```

Expected:

- first, third, and fourth scans return no match;
- `Math.random` remains exactly once inside the untouched heatmap block;
- diff check is clean;
- status lists only the intended Task 6 files before commit.

- [ ] **Step 11: Commit the route closure**

```powershell
git commit -m "refactor(users): extract v2 analytics routes"
```

Do not push. Report all six commits, fresh gate counts, remaining heatmap
decision, and any sandbox limitation.
