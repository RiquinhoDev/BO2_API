# Class Comparison Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract `GET /api/analytics/compare` into a strict, testable vertical
boundary, fix partial-result compatibility with the Front, and remove the last
comparison-only cache timer from the legacy analytics controller.

**Architecture:** A strict Zod boundary normalizes the ordered class IDs. A
thin controller calls a pure comparison service with an injected class reader,
clock, and lazy TTL cache; runtime composition reuses the existing
`analyticsService.getClassAnalytics` implementation rather than duplicating
analytics logic.

**Tech Stack:** TypeScript 5.9 strict, Express 5, Zod 3, Jest 29, Supertest,
existing analytics service, existing generic `InMemoryTtlCache`.

## Global Constraints

- Work only on the existing `remake` branch.
- Preserve `GET /api/analytics/compare`, authentication, and successful
  comparison semantics consumed by the Front.
- Preserve requested class order and multiplicity; do not sort or deduplicate.
- Accept between two and ten normalized class IDs.
- Return Front-compatible complete rows for partial failures.
- Never expose dependency error details in the HTTP response.
- Reuse the existing five-minute lazy TTL cache; create no timer.
- Prove comparison-only legacy symbols are orphaned before deleting them.
- Do not touch Guru comparison or snapshot comparison code.
- Do not use `any`, unsafe casts, non-null assertions, `@ts-ignore`, or new
  lint suppressions.
- Keep every new file below approximately 400 lines.
- Do not run `npm install`, `npm ci`, or delete `node_modules`.
- Do not use real external APIs or production MongoDB.
- Run tests with the existing offline egress guard; set
  `MONGOMS_RUNTIME_DOWNLOAD=false` for the full suite.
- Execute and observe RED before writing each production unit.
- Produce one implementation commit with a lowercase Conventional Commit
  subject.
- Do not push without current explicit authorization.

---

## File map

**Create:**

- `src/security/classComparisonInput.ts` — strict query normalization.
- `src/services/analytics/classComparison.service.ts` — DTOs, port, summary,
  partial errors, and cache policy.
- `src/controllers/analytics/classComparison.controller.ts` — HTTP outcomes.
- `src/services/analytics/classComparison.runtime.ts` — production
  composition.
- `tests/security/classComparisonInput.test.ts` — hostile boundary cases.
- `tests/services/analytics/classComparison.service.test.ts` — pure behavior
  and deterministic cache.
- `tests/controllers/classComparison.controller.test.ts` — public envelopes.

**Modify:**

- `src/routes/analytics.routes.ts` — mount the extracted handler.
- `src/controllers/analytics.controller.ts` — remove only comparison code and
  its proven orphaned timer/cache/types.
- `tests/routes/classAnalytics.routes.test.ts` — prove the real route uses the
  extracted boundary.
- `src/security/route-catalog.json` — update only line evidence.
- `docs/HARDENING-WORKPLAN.md` — record measured result and proof.
- `eslint-suppressions.json` — only through `lint:baseline:prune`.

---

### Task 1: Strict comparison input

**Files:**

- Create: `tests/security/classComparisonInput.test.ts`
- Create: `src/security/classComparisonInput.ts`

**Interfaces:**

- Produces `classComparisonInput`.
- `z.infer<typeof classComparisonInput>["query"]["classIds"]` is
  `string[]`, already trimmed and filtered.

- [ ] **Step 1: Write the boundary test before production code**

Create a real Express test app with `withValidatedInput`, the correlation
middleware, and central error handler. The handler must echo its validated
input.

The valid request:

```ts
await request(app)
  .get('/compare?classIds=%20class-a%20,,class-b&__bo2_offline_loopback=1')
```

must produce:

```ts
expect(response.status).toBe(200)
expect(response.body).toEqual({
  params: {},
  query: { classIds: ['class-a', 'class-b'] },
  body: {},
})
```

Use table cases that expect `400` and `code: "INVALID_REQUEST"` for:

```ts
[
  '/compare',
  '/compare?classIds=only-one',
  '/compare?classIds=1,2,3,4,5,6,7,8,9,10,11',
  '/compare?classIds=a,b&extra=value',
  '/compare?classIds=a,b&%24where=return%20true',
]
```

Send an own `__proto__` property through a POST-only test route using:

```ts
JSON.parse('{"__proto__":{"polluted":true}}')
```

and assert `400` plus
`Object.prototype` does not gain `polluted`.

The mutations these tests catch are: missing min/max, accepting unknown query
fields, coupling the operator guard to the offline marker, or forwarding raw
comma-separated input to the service.

- [ ] **Step 2: Run the test and observe RED**

```powershell
node_modules\.bin\jest.cmd tests/security/classComparisonInput.test.ts --runInBand
```

Expected: FAIL with `Cannot find module .../classComparisonInput`.

- [ ] **Step 3: Add the minimal strict schema**

Create:

```ts
import { z } from 'zod'
import { validatedSchema } from './validatedInput'

const classIds = z.string()
  .transform((value) =>
    value
      .split(',')
      .map((classId) => classId.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string().min(1)).min(2).max(10))

export const classComparisonInput = validatedSchema({
  params: {},
  query: { classIds },
  body: {},
})
```

- [ ] **Step 4: Run the focused test and observe GREEN**

Repeat Step 2. Expected: all boundary cases PASS.

---

### Task 2: Pure comparison service and lazy cache

**Files:**

- Create: `tests/services/analytics/classComparison.service.test.ts`
- Create: `src/services/analytics/classComparison.service.ts`
- Reuse: `src/services/analytics/inMemoryTtlCache.ts`

**Interfaces:**

- Consumes:

```ts
TimedCache<ClassComparisonData>
```

- Produces:

```ts
export interface ClassAnalyticsSnapshot {
  classId: string
  className: string
  totalStudents: number
  activeStudents: number
  averageEngagement: number
  healthScore: number
  averageProgress: number
  lastCalculatedAt: Date
}

export interface ClassAnalyticsReader {
  getClassAnalytics(classId: string): Promise<ClassAnalyticsSnapshot | null>
}

interface ClassComparisonMetrics {
  classId: string
  totalStudents: number
  activeStudents: number
  averageEngagement: number
  healthScore: number
  averageProgress: number
  lastCalculated: string
}

export interface SuccessfulClassComparisonRow
  extends ClassComparisonMetrics {
  className: string
  error?: never
}

export interface FailedClassComparisonRow extends ClassComparisonMetrics {
  className?: never
  error: string
}

export type ClassComparisonRow =
  | SuccessfulClassComparisonRow
  | FailedClassComparisonRow

export interface ClassComparisonData {
  comparisons: ClassComparisonRow[]
  summary: {
    totalStudentsSum: number
    averageEngagementMean: number
    healthScoreMean: number
    bestPerformingClass: SuccessfulClassComparisonRow
    worstPerformingClass: SuccessfulClassComparisonRow
  }
  validComparisons: number
  totalRequested: number
  calculationDuration: number
  lastUpdated: string
  cached: boolean
}

export type ClassComparisonResult =
  | { found: false }
  | {
      found: true
      data: ClassComparisonData
      timestamp: number
      cacheAge?: number
    }

export class ClassComparisonService {
  constructor(
    reader: ClassAnalyticsReader,
    cache: TimedCache<ClassComparisonData>,
    now?: () => number,
  )

  compare(classIds: string[]): Promise<ClassComparisonResult>
}
```

- [ ] **Step 1: Write service tests with literal fixtures**

Use a reader fake whose fixtures contain the complete
`ClassAnalyticsSnapshot`. Do not compute expected summaries with production
helpers.

Cover these independent behaviors:

1. Two valid classes return rows in requested order and the literal summary:

```ts
expect(result).toEqual({
  found: true,
  timestamp: 1_025,
  data: {
    comparisons: [
      {
        classId: 'class-b',
        className: 'Class B',
        totalStudents: 20,
        activeStudents: 15,
        averageEngagement: 80,
        healthScore: 90,
        averageProgress: 70,
        lastCalculated: new Date(800).toISOString(),
      },
      {
        classId: 'class-a',
        className: 'Class A',
        totalStudents: 10,
        activeStudents: 5,
        averageEngagement: 40,
        healthScore: 50,
        averageProgress: 30,
        lastCalculated: new Date(700).toISOString(),
      },
    ],
    summary: {
      totalStudentsSum: 30,
      averageEngagementMean: 60,
      healthScoreMean: 70,
      bestPerformingClass: expect.objectContaining({ classId: 'class-b' }),
      worstPerformingClass: expect.objectContaining({ classId: 'class-a' }),
    },
    validComparisons: 2,
    totalRequested: 2,
    calculationDuration: 25,
    lastUpdated: new Date(1_025).toISOString(),
    cached: false,
  },
})
```

2. One valid, one missing, and one throwing reader produce two complete error
   rows. Assert each omits `className` so the Front uses `Turma <id>`,
   contains all five numeric metrics plus empty `lastCalculated`, and exposes
   only a stable public `error`. Assert the dependency message
   `database-secret-detail` is absent from serialized data.
3. Summary totals and means use only the valid row.
4. Every class invalid returns exactly `{ found: false }` and a subsequent
   identical call invokes the reader again, proving the failure was not cached.
5. Requests `[' class-a ', 'class-b']` are not accepted at service level; the
   service receives normalized IDs from Task 1. Instead prove
   `['class-a', 'class-b']` reuses its cache while reversed order uses a
   different key and preserves reversed output.
6. A cache hit at `storedAt + ttl - 1` does not call the reader and returns
   `data.cached: true` plus rounded `cacheAge`.
7. At exactly `storedAt + ttl`, the cache expires and the reader is called
   again.

The mutations these tests catch are: summary includes error rows, raw error
leakage, incomplete error DTO, sorted response order, caching all-invalid
results, or stale data surviving the TTL boundary.

- [ ] **Step 2: Run the service test and observe RED**

```powershell
node_modules\.bin\jest.cmd tests/services/analytics/classComparison.service.test.ts --runInBand
```

Expected: FAIL with `Cannot find module .../classComparison.service`.

- [ ] **Step 3: Implement the service minimally**

Use these private mappings:

```ts
const missingRow = (classId: string): ClassComparisonRow => ({
  classId,
  totalStudents: 0,
  activeStudents: 0,
  averageEngagement: 0,
  healthScore: 0,
  averageProgress: 0,
  lastCalculated: '',
  error: 'Turma não encontrada',
})

const failedRow = (classId: string): ClassComparisonRow => ({
  ...missingRow(classId),
  error: 'Erro ao obter analytics da turma',
})
```

In `compare`:

1. Read `startedAt = now()`.
2. Use `JSON.stringify(classIds)` as the cache key.
3. Return a cache hit as a copied object with `cached: true`; never mutate the
   cached value.
4. Run the reader calls with `Promise.all`, catching each dependency failure
   inside its own item.
5. Filter valid rows by absence of `error`.
6. Return `{ found: false }` when none are valid.
7. Derive the literal sums, rounded means, best, and worst from valid rows.
8. Read `finishedAt = now()`, set `calculationDuration`,
   `lastUpdated`, and `cached: false`.
9. Cache at `finishedAt`, then return the fresh result.

Use a type guard for valid rows. Do not cast the filtered array and do not use
non-null assertions for best/worst; the `found: false` branch must establish a
non-empty first value before reduction.

- [ ] **Step 4: Run the focused service test and observe GREEN**

Repeat Step 2. Expected: all service and cache cases PASS.

---

### Task 3: Thin HTTP controller

**Files:**

- Create: `tests/controllers/classComparison.controller.test.ts`
- Create: `src/controllers/analytics/classComparison.controller.ts`

**Interfaces:**

- Consumes `Pick<ClassComparisonService, "compare">`.
- Produces:

```ts
export function createClassComparisonController(
  service: Pick<ClassComparisonService, 'compare'>,
): ValidatedInputHandler<typeof classComparisonInput>
```

- [ ] **Step 1: Write controller contract tests**

Mount the real strict boundary, controller factory, correlation middleware, and
central error handler in Express.

Assert:

1. Fresh result returns `200`, `success: true`, complete `data` with
   `data.cached: false`, outer `cached: false`, ISO `timestamp`, and outer
   `calculationDuration`.
2. Cached result returns `200`, `data.cached: true`, outer `cached: true`,
   stored timestamp, and `cacheAge`.
3. `{ found: false }` returns the existing `404` message
   `"Nenhuma turma válida encontrada para comparação"`.
4. A rejected service call returns:

```ts
{
  success: false,
  code: 'CLASS_COMPARISON_READ_FAILED',
  message: 'Erro ao comparar turmas',
  correlationId: 'class-comparison-request-id',
}
```

and contains no dependency detail.

The tests assert public HTTP behavior, not whether Jest mocks were called.

- [ ] **Step 2: Run the controller test and observe RED**

```powershell
node_modules\.bin\jest.cmd tests/controllers/classComparison.controller.test.ts --runInBand
```

Expected: FAIL with `Cannot find module .../classComparison.controller`.

- [ ] **Step 3: Implement the controller factory**

The controller must:

- call `service.compare(input.query.classIds)`;
- emit the 404 branch directly;
- preserve the legacy success envelope;
- obtain `calculationDuration` from `result.data`;
- wrap unexpected errors in:

```ts
new HttpError({
  status: 500,
  code: 'CLASS_COMPARISON_READ_FAILED',
  publicMessage: 'Erro ao comparar turmas',
  cause: error,
})
```

No `console.*` and no raw error field are allowed.

- [ ] **Step 4: Run the controller test and observe GREEN**

Repeat Step 2. Expected: all controller cases PASS.

---

### Task 4: Runtime wiring and proven dead-code deletion

**Files:**

- Create: `src/services/analytics/classComparison.runtime.ts`
- Modify: `src/routes/analytics.routes.ts`
- Modify: `tests/routes/classAnalytics.routes.test.ts`
- Modify: `src/controllers/analytics.controller.ts`
- Modify: `src/security/route-catalog.json`

**Interfaces:**

- Produces `compareClasses` as the production validated handler.
- Reuses `analyticsService` structurally as `ClassAnalyticsReader`.

- [ ] **Step 1: Write the route RED**

Extend the route test mock:

```ts
jest.mock(
  '../../src/services/analytics/classComparison.runtime',
  () => ({
    compareClasses: extractedHandler('compareClasses'),
  }),
)
```

Remove `compareClasses` from the legacy mock and add:

```ts
it('mounts class comparison through its extracted boundary', async () => {
  const response = await request(createTestApp())
    .get('/compare?classIds=class-a,class-b&__bo2_offline_loopback=1')

  expect(response.status).toBe(200)
  expect(response.body).toMatchObject({
    source: 'class-analytics-boundary',
    handler: 'compareClasses',
    input: {
      params: {},
      query: { classIds: ['class-a', 'class-b'] },
    },
  })
})
```

- [ ] **Step 2: Run the route test and observe RED**

```powershell
node_modules\.bin\jest.cmd tests/routes/classAnalytics.routes.test.ts --runInBand
```

Expected: FAIL because `/compare` is still wired to the legacy controller or
the runtime module does not exist.

- [ ] **Step 3: Add production composition**

Create:

```ts
import { createClassComparisonController } from '../../controllers/analytics/classComparison.controller'
import { analyticsService } from './analyticsService'
import {
  ClassComparisonService,
  type ClassComparisonData,
} from './classComparison.service'
import { InMemoryTtlCache } from './inMemoryTtlCache'

const cache = new InMemoryTtlCache<ClassComparisonData>(5 * 60 * 1_000)
const service = new ClassComparisonService(analyticsService, cache)

export const compareClasses = createClassComparisonController(service)
```

In the route, import `compareClasses` from the runtime and mount:

```ts
router.get(
  '/compare',
  withValidatedInput(classComparisonInput, compareClasses),
)
```

- [ ] **Step 4: Remove only the proven comparison orphans**

Before deleting, run:

```powershell
rg -n "\bcache\b|CACHE_DURATION|cleanExpiredCache|cacheCleanupTimer|ComparisonOk|ComparisonErr|type Comparison|const isOk|compareClasses" src/controllers/analytics.controller.ts src -g "*.ts"
```

Confirm the top-level timer/cache/types and legacy handler are used only by
the comparison block. Then remove:

- top-level `cache`, TTL constant, cleanup function, interval, and `unref`;
- `ComparisonOk`, `ComparisonErr`, `Comparison`, and `isOk`;
- legacy `compareClasses`;
- its `analyticsController` property.

Repeat the same search. Expected in the legacy controller: zero matches for
those symbols. Matches in Guru or snapshot comparison remain untouched.

Update route-catalog evidence to the new route line without changing method,
path, access, consumer, writes, or destructive.

- [ ] **Step 5: Run focused integration tests and observe GREEN**

```powershell
node_modules\.bin\jest.cmd --runInBand `
  tests/security/classComparisonInput.test.ts `
  tests/services/analytics/classComparison.service.test.ts `
  tests/controllers/classComparison.controller.test.ts `
  tests/routes/classAnalytics.routes.test.ts `
  tests/security/routeCatalog.test.ts
```

Expected: all focused suites PASS and route catalog remains 437/437.

---

### Task 5: Ratchets, workplan, mutation proof, and final gate

**Files:**

- Modify: `docs/HARDENING-WORKPLAN.md`
- Modify: `eslint-suppressions.json` only through the prune command.

- [ ] **Step 1: Run the lint suppression prune**

```powershell
npm.cmd run lint:baseline:prune
```

Record exact before/after counts for:

- `no-explicit-any`;
- `no-console`;
- `no-unused-vars`;
- legacy controller line count.

Do not edit suppression counts manually.

- [ ] **Step 2: Perform mutation checks**

Temporarily apply and revert each mutation, running the smallest relevant
test after each:

1. Remove one required numeric field from `failedRow`: TypeScript or service
   test must fail.
2. Include failed rows in summary: service test must fail.
3. Return outer `cached: true` without `data.cached: true`: controller test
   must fail.
4. Rewire `/compare` to a legacy handler: route test must fail.
5. Change cache key to sorted IDs: reversed-order service test must fail.

Restore the implementation after every RED and rerun the focused test GREEN.

- [ ] **Step 3: Update the workplan**

Record:

- endpoint and files extracted;
- legacy controller line reduction;
- comparison-only timer/cache removed;
- partial failure contract fixed;
- `cached` moved into the Front-visible data contract;
- exact ratchet reductions;
- route catalog count;
- focused and full gate counts.

- [ ] **Step 4: Run the complete offline gate**

```powershell
npm.cmd run lint
npm.cmd run types:check
$env:MONGOMS_RUNTIME_DOWNLOAD='false'
node_modules\.bin\jest.cmd --ci --runInBand --silent
npm.cmd run build
git diff --check
git status --short
```

Expected:

- lint exits 0 with `--max-warnings=0`;
- TypeScript reports `0 erros em 0 ficheiros`;
- full Jest has zero failures and uses only offline Mongo;
- build exits 0;
- diff check reports no whitespace errors;
- only planned files are modified.

- [ ] **Step 5: Review and commit the implementation**

Review the complete staged diff, especially:

- no raw dependency errors;
- no `any`, unsafe cast, non-null assertion, or suppression;
- no import-time timer;
- no unrelated Guru/snapshot changes;
- no route-catalog fact changes;
- no lockfile changes.

Stage only the planned implementation files and commit:

```powershell
git commit -m "fix(analytics): harden class comparison" `
  -m "Return Front-compatible partial failures and expose cache state inside the consumed data contract. Replace the legacy import-time timer with lazy TTL expiry."
```

Do not push.
