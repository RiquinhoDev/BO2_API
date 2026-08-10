# Analytics Benchmarks Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the benchmark endpoint's `1 + 3N` database reads and legacy field access with a strict, deterministic, two-query vertical slice while preserving its rich backend contract and aligning the dormant Front contract.

**Architecture:** A projected Mongoose adapter groups canonical user metrics by class in one aggregation. A pure application service calculates percentiles, rankings, insights, and exact legacy empty responses; a thin validated controller maps the result to HTTP, while the Front Zod schema and TypeScript type describe the real backend payload.

**Tech Stack:** TypeScript 5.9, Express 5, Mongoose, Zod 3, Jest 29, Supertest, MongoMemoryServer 8.2.6, React 19, existing `validatedSchema`/`withValidatedInput` and `parseOrWarn`.

## Global Constraints

- Work only on `remake` in both `BO2_API` and `Front`; confirm both branches before each cross-repository commit.
- Run entirely offline: no real Guru, Hotmart, ActiveCampaign, CursEduca, Discord, or production Mongo access.
- Do not run `npm install`, `npm ci`, or delete `node_modules`.
- Preserve the populated backend field names, both exact empty data shapes, route, method, authentication, percentile thresholds, insight copy, and list limit of ten.
- Keep class membership based on top-level `User.classId`; migration to `UserProduct` or nested enrolments is outside this lot.
- Use at most one projected `Class` query and one grouped `User` aggregation, independent of class count.
- Never introduce `any`, type-suppressing casts, non-null assertions, `@ts-ignore`, duplicate redaction, or new `console.*`.
- Rule #9: prove a symbol or file is unreferenced before deleting it.
- Keep the existing Front API and hook functions even though no production component currently calls them.
- Retain route-usage instrumentation and classify the catalog consumer as `desconhecido`.
- Preserve the staged `Front/scripts/git-hooks/pre-commit`; it is active through `core.hooksPath` and must not enter analytics commits.
- Conventional Commit subjects must be lowercase.
- Do not push without explicit current authorization.

## File Structure

### BO2_API

- `src/services/analytics/benchmarkAnalytics.service.ts`: public DTOs, reader port, nearest-rank calculator, deterministic ranking, insights, and application service.
- `src/services/analytics/mongooseBenchmarkAnalytics.reader.ts`: the only Mongoose implementation, with one projected class read and one grouped user aggregation.
- `src/security/benchmarkAnalyticsInput.ts`: one shared empty strict input schema.
- `src/controllers/analytics/benchmarkAnalytics.controller.ts`: injected HTTP mapping and central-error translation.
- `src/services/analytics/benchmarkAnalytics.runtime.ts`: production composition only.
- `tests/services/analytics/benchmarkAnalytics.service.test.ts`: pure metric, percentile, ranking, empty-result, and clock tests.
- `tests/services/analytics/mongooseBenchmarkAnalytics.reader.test.ts`: offline adapter and query-count proof.
- `tests/security/benchmarkAnalyticsInput.test.ts`: boundary rejection proof.
- `tests/controllers/benchmarkAnalytics.controller.test.ts`: HTTP envelopes and error redaction.
- `tests/routes/classAnalytics.routes.test.ts`: runtime wiring and legacy negative proof.

### Front

- `src/types/analytics.types.ts`: rich populated/empty benchmark union.
- `src/features/analytics/analytics.schemas.ts`: matching runtime Zod union.
- `src/features/analytics/__tests__/analytics.api.test.ts`: representative populated and empty contract proof without network.

---

### Task 1: Build the pure benchmark calculator

**Files:**
- Create: `src/services/analytics/benchmarkAnalytics.service.ts`
- Create: `tests/services/analytics/benchmarkAnalytics.service.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ClassBenchmarkMetric {
    classId: string
    className: string
    totalStudents: number
    activeStudents: number
    activityRate: number
    averageEngagement: number
    averageProgress: number
  }

  export interface BenchmarkLevels {
    excellent: number
    good: number
    average: number
    needsImprovement: number
    poor: number
  }

  export interface BenchmarkInsight {
    type: 'warning' | 'info' | 'success'
    message: string
    recommendation: string
  }

  export interface BenchmarksResult {
    benchmarks: {
      engagement: BenchmarkLevels
      progress: BenchmarkLevels
      activityRate: BenchmarkLevels
      classSize: {
        large: number
        medium: number
        small: number
      }
    }
    industryStats: {
      totalClasses: number
      totalStudents: number
      averageClassSize: number
      overallEngagement: number
      overallProgress: number
      overallActivityRate: number
    }
    topPerformers: ClassBenchmarkMetric[]
    needsAttention: ClassBenchmarkMetric[]
    insights: BenchmarkInsight[]
    metadata: {
      calculationDate: string
      calculationDuration: number
      classesAnalyzed: number
      dataFreshness: 'Calculado em tempo real'
    }
  }

  export interface EmptyBenchmarksResult {
    message:
      | 'Nenhuma turma ativa encontrada para calcular benchmarks'
      | 'Nenhuma turma com dados válidos encontrada'
    totalClasses: 0
  }

  export interface BenchmarkClassRead {
    totalStudents: number
    activeStudents: number
    averageEngagement: number
    averageProgress: number
  }

  export interface BenchmarkAnalyticsRead {
    activeClasses: Array<{ classId: string; className: string }>
    metricsByClassId: ReadonlyMap<string, BenchmarkClassRead>
  }

  export interface BenchmarkAnalyticsReader {
    read(): Promise<BenchmarkAnalyticsRead>
  }

  export type BenchmarkAnalyticsResult =
    | { empty: true; data: EmptyBenchmarksResult }
    | {
        empty: false
        data: BenchmarksResult
        timestamp: number
      }

  export function calculateBenchmarks(
    metrics: readonly ClassBenchmarkMetric[],
    metadata: {
      calculationDate: string
      calculationDuration: number
    },
  ): BenchmarksResult

  export class BenchmarkAnalyticsService {
    constructor(
      reader: BenchmarkAnalyticsReader,
      now?: () => Date,
    )
    get(): Promise<BenchmarkAnalyticsResult>
  }
  ```

- [ ] **Step 1: Write failing percentile and ranking tests**

Use a typed fixture factory:

```ts
const metric = (
  classId: string,
  engagement: number,
  progress: number,
  activityRate = 80,
): ClassBenchmarkMetric => ({
  classId,
  className: `Class ${classId}`,
  totalStudents: 10,
  activeStudents: Math.round(activityRate / 10),
  activityRate,
  averageEngagement: engagement,
  averageProgress: progress,
})
```

Add tests proving:

1. nearest-rank percentiles for arrays of one, four, and ten values at
   p10/p25/p50/p75/p90;
2. class-size p25/p50/p90 and all five engagement/progress/activity keys;
3. top qualification remains engagement `>= p75` and progress `>= p75`;
4. attention qualification remains engagement `<= p25` or progress `<= p25`;
5. top results sort by engagement-plus-progress descending and attention by
   the same sum ascending;
6. equal sums sort by `classId` ascending regardless of input order;
7. both arrays stop at ten entries;
8. industry totals and rounded averages remain exact;
9. warning, info, and success insights retain the current thresholds and copy.

- [ ] **Step 2: Run the pure test and verify RED**

Run:

```powershell
npx.cmd jest --ci --runInBand tests/services/analytics/benchmarkAnalytics.service.test.ts
```

Expected: fail with `Cannot find module ...benchmarkAnalytics.service`.

- [ ] **Step 3: Implement typed levels and nearest-rank calculation**

Define:

```ts
export interface BenchmarkLevels {
  excellent: number
  good: number
  average: number
  needsImprovement: number
  poor: number
}

function nearestRank(
  sortedValues: readonly number[],
  percentile: number,
): number {
  if (sortedValues.length === 0) return 0
  const index = Math.ceil((percentile / 100) * sortedValues.length) - 1
  return sortedValues[Math.max(0, index)] ?? 0
}
```

Build each level from ascending copied arrays so the caller's input is never
mutated:

```ts
const values = metrics.map(item => item.averageEngagement)
  .sort((left, right) => left - right)
```

- [ ] **Step 4: Implement deterministic lists, stats, and insights**

Use one internal score:

```ts
const performanceScore = (item: ClassBenchmarkMetric): number =>
  item.averageEngagement + item.averageProgress
```

For top performers, compare score descending and then
`left.classId.localeCompare(right.classId)`. For attention, compare score
ascending and use the same final tie-breaker. Apply `.slice(0, 10)` only after
sorting.

Preserve these exact insights:

```ts
if (industryStats.overallEngagement < 50) {
  insights.push({
    type: 'warning',
    message: `O engagement médio da plataforma (${industryStats.overallEngagement}%) está abaixo do ideal (50%+)`,
    recommendation: 'Considere implementar estratégias globais de engagement',
  })
}
if (industryStats.overallActivityRate < 80) {
  insights.push({
    type: 'info',
    message: `A taxa de atividade média (${industryStats.overallActivityRate}%) pode ser melhorada`,
    recommendation: 'Analise campanhas de reativação para alunos inativos',
  })
}
if (topPerformers.length > 0) {
  insights.push({
    type: 'success',
    message: `${topPerformers.length} turmas estão com performance excellent`,
    recommendation: 'Analise as melhores práticas dessas turmas para replicar',
  })
}
```

- [ ] **Step 5: Write failing service-coordination tests**

With a fixed sequence clock:

```ts
const times = [
  new Date('2026-07-29T10:00:00.000Z'),
  new Date('2026-07-29T10:00:00.025Z'),
]
const now = jest.fn(() => times.shift() ?? new Date(0))
```

Prove:

1. no active classes returns exactly
   `{ message: 'Nenhuma turma ativa encontrada para calcular benchmarks', totalClasses: 0 }`;
2. active classes with an empty metrics map return exactly
   `{ message: 'Nenhuma turma com dados válidos encontrada', totalClasses: 0 }`;
3. zero-student map entries are omitted defensively;
4. populated data calculates `activityRate`, rounds reader averages, uses the
   second clock value for metadata and outer timestamp, and reports duration
   `25`;
5. a thrown reader error remains thrown for the controller.

- [ ] **Step 6: Implement the service coordinator**

Call `reader.read()` once. Join `activeClasses` to `metricsByClassId`, skip a
missing or zero-student metric, and derive:

```ts
activityRate: Math.round(
  (read.activeStudents / read.totalStudents) * 100,
)
```

Do not call the finish clock in either empty branch. For populated data, call
it once and pass its ISO timestamp and elapsed milliseconds to
`calculateBenchmarks`.

- [ ] **Step 7: Run the pure suite and mutation checks**

Run:

```powershell
npx.cmd jest --ci --runInBand tests/services/analytics/benchmarkAnalytics.service.test.ts
```

Then temporarily perform each mutation separately:

1. change p75 nearest rank to `Math.floor`;
2. remove the `classId` tie-breaker;
3. slice before sorting;
4. treat a zero-student metric as valid.

Each mutation must make the focused suite RED. Restore the correct line and
rerun GREEN after every mutation.

- [ ] **Step 8: Commit the pure calculator**

```powershell
git add -- src/services/analytics/benchmarkAnalytics.service.ts tests/services/analytics/benchmarkAnalytics.service.test.ts
git commit -m "refactor(analytics): extract benchmark rules"
```

---

### Task 2: Add the two-query Mongoose reader

**Files:**
- Create: `src/services/analytics/mongooseBenchmarkAnalytics.reader.ts`
- Create: `tests/services/analytics/mongooseBenchmarkAnalytics.reader.test.ts`

**Interfaces:**
- Consumes:
  ```ts
  BenchmarkAnalyticsReader
  BenchmarkAnalyticsRead
  BenchmarkClassRead
  ```
- Produces:
  ```ts
  export class MongooseBenchmarkAnalyticsReader
  implements BenchmarkAnalyticsReader {
    read(): Promise<BenchmarkAnalyticsRead>
  }
  ```

- [ ] **Step 1: Write the offline adapter fixtures**

Start `MongoMemoryServer` exactly as the existing global reader test:

```ts
process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
mongoServer = await MongoMemoryServer.create({
  binary: { version: '8.2.6' },
  instance: { dbName: 'benchmark_analytics_test' },
})
await mongoose.connect(
  assertSafeTestMongoUri(mongoServer.getUri('benchmark_analytics_test')),
)
```

Seed:

- two active classes and one inactive class;
- two students in one active class and one in the other;
- canonical combined values plus conflicting platform fallbacks;
- a legitimate combined zero plus non-zero fallbacks;
- Hotmart-only progress with completed lessons;
- CursEduca-only progress;
- explicit legacy `status: 'ACTIVE'` without combined status;
- top-level deleted and Discord-deleted students;
- a student belonging to the inactive class.

- [ ] **Step 2: Write failing query and metric assertions**

Spy on `Class.find` and `User.aggregate`. Assert:

1. exactly one class query and one user aggregation for both active classes;
2. class projection is `{ classId: 1, name: 1, _id: 0 }`;
3. results are grouped by class ID;
4. combined status/engagement/progress win;
5. zero combined values remain zero;
6. fallback order is Hotmart before CursEduca for progress and combined,
   Hotmart, CursEduca for engagement;
7. Hotmart progress with zero lessons becomes zero, never `NaN`;
8. stored and derived percentages clamp to `0..100`;
9. both deletion flags and inactive classes are excluded;
10. no active classes returns an empty map without calling `User.aggregate`.

- [ ] **Step 3: Run the adapter suite and verify RED**

Run:

```powershell
npx.cmd jest --ci --runInBand tests/services/analytics/mongooseBenchmarkAnalytics.reader.test.ts
```

Expected: fail because the reader module does not exist.

- [ ] **Step 4: Implement the projected class read**

Use:

```ts
const activeClasses = await Class.find({
  $or: [{ isActive: true }, { status: 'active' }],
})
  .select({ classId: 1, name: 1, _id: 0 })
  .lean<ActiveClassProjection[]>()
  .exec()
```

Map a missing or blank name to `Turma sem nome`. Return immediately with a new
empty `Map` when the result is empty.

- [ ] **Step 5: Implement one grouped user aggregation**

Use this pipeline structure:

```ts
[
  {
    $match: {
      classId: { $in: classIds },
      isDeleted: { $ne: true },
      'discord.isDeleted': { $ne: true },
    },
  },
  {
    $set: {
      resolvedStatus: { $ifNull: ['$combined.status', '$status'] },
      rawEngagement: {
        $ifNull: [
          '$combined.engagement.score',
          {
            $ifNull: [
              '$combined.combinedEngagement',
              {
                $ifNull: [
                  '$hotmart.engagement.engagementScore',
                  {
                    $ifNull: [
                      '$curseduca.engagement.alternativeEngagement',
                      0,
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      hotmartLessonCount: {
        $size: { $ifNull: ['$hotmart.progress.lessonsData', []] },
      },
    },
  },
  {
    $set: {
      hotmartProgress: {
        $cond: [
          { $gt: ['$hotmartLessonCount', 0] },
          {
            $multiply: [
              {
                $divide: [
                  { $ifNull: ['$hotmart.progress.completedLessons', 0] },
                  '$hotmartLessonCount',
                ],
              },
              100,
            ],
          },
          null,
        ],
      },
    },
  },
  {
    $set: {
      rawProgress: {
        $ifNull: [
          '$combined.totalProgress',
          {
            $ifNull: [
              '$hotmartProgress',
              { $ifNull: ['$curseduca.progress.estimatedProgress', 0] },
            ],
          },
        ],
      },
    },
  },
  {
    $set: {
      resolvedEngagement: {
        $min: [100, { $max: [0, '$rawEngagement'] }],
      },
      resolvedProgress: {
        $min: [100, { $max: [0, '$rawProgress'] }],
      },
    },
  },
  {
    $group: {
      _id: '$classId',
      totalStudents: { $sum: 1 },
      activeStudents: {
        $sum: { $cond: [{ $eq: ['$resolvedStatus', 'ACTIVE'] }, 1, 0] },
      },
      averageEngagement: { $avg: '$resolvedEngagement' },
      averageProgress: { $avg: '$resolvedProgress' },
    },
  },
]
```

Clamp with `$min: [100, { $max: [0, value] }]`. Use `$ifNull`, never `$or`,
so numeric zero is preserved. Derive Hotmart only when lesson count is greater
than zero; otherwise continue to CursEduca rather than divide by zero.

Execute with:

```ts
await User.aggregate<BenchmarkClassAggregation>(pipeline)
  .option({ maxTimeMS: 120_000 })
  .exec()
```

Return rounded averages in a `Map<string, BenchmarkClassRead>`.

- [ ] **Step 6: Run focused GREEN and query-count mutation**

Run:

```powershell
npx.cmd jest --ci --runInBand tests/services/analytics/mongooseBenchmarkAnalytics.reader.test.ts tests/services/analytics/benchmarkAnalytics.service.test.ts
```

Temporarily add any per-class `User.countDocuments`. The query-count assertion
must fail. Remove it and rerun GREEN.

- [ ] **Step 7: Commit the Mongoose reader**

```powershell
git add -- src/services/analytics/mongooseBenchmarkAnalytics.reader.ts tests/services/analytics/mongooseBenchmarkAnalytics.reader.test.ts
git commit -m "perf(analytics): aggregate class benchmarks"
```

---

### Task 3: Add the strict HTTP boundary

**Files:**
- Create: `src/security/benchmarkAnalyticsInput.ts`
- Create: `src/controllers/analytics/benchmarkAnalytics.controller.ts`
- Create: `tests/security/benchmarkAnalyticsInput.test.ts`
- Create: `tests/controllers/benchmarkAnalytics.controller.test.ts`

**Interfaces:**
- Consumes:
  ```ts
  type BenchmarkService = Pick<BenchmarkAnalyticsService, 'get'>
  ```
- Produces:
  ```ts
  export const benchmarkAnalyticsInput = validatedSchema({
    params: {},
    query: {},
    body: {},
  })

  export function createBenchmarkAnalyticsController(
    service: BenchmarkService,
  ): ValidatedInputHandler<typeof benchmarkAnalyticsInput>
  ```

- [ ] **Step 1: Write failing boundary tests**

Build a test app with the shared error handler and:

```ts
app.get(
  '/benchmarks',
  withValidatedInput(
    benchmarkAnalyticsInput,
    createBenchmarkAnalyticsController(service),
  ),
)
```

Prove:

1. `?__bo2_offline_loopback=1` reaches the service with empty input;
2. `?extra=value` returns `400 INVALID_REQUEST` before the service;
3. `?%24where=1` returns `400`;
4. a literal prototype payload passed through the wrapper is rejected using
   `Object.getOwnPropertyNames`;
5. the service is never called for invalid input.

- [ ] **Step 2: Write failing controller-envelope tests**

Use fixed typed service results. Assert:

1. populated result returns exact
   `{ success: true, data, timestamp: ISO }`;
2. both empty results return exact `{ success: true, data }` without outer
   timestamp;
3. a dependency error returns
   `500 ANALYTICS_BENCHMARKS_READ_FAILED`;
4. response contains the injected correlation ID and excludes
   `database-secret-detail`.

- [ ] **Step 3: Run both suites and verify RED**

Run:

```powershell
npx.cmd jest --ci --runInBand tests/security/benchmarkAnalyticsInput.test.ts tests/controllers/benchmarkAnalytics.controller.test.ts
```

Expected: fail because the input and controller modules do not exist.

- [ ] **Step 4: Implement the empty strict schema and thin controller**

Controller mapping:

```ts
export function createBenchmarkAnalyticsController(
  service: BenchmarkService,
): ValidatedInputHandler<typeof benchmarkAnalyticsInput> {
  return async (_input, _req, res, next) => {
    try {
      const result = await service.get()
      if (result.empty) {
        res.status(200).json({ success: true, data: result.data })
        return
      }
      res.status(200).json({
        success: true,
        data: result.data,
        timestamp: new Date(result.timestamp).toISOString(),
      })
    } catch (error) {
      next(new HttpError({
        status: 500,
        code: 'ANALYTICS_BENCHMARKS_READ_FAILED',
        publicMessage: 'Erro ao calcular benchmarks da indústria',
        cause: error,
      }))
    }
  }
}
```

- [ ] **Step 5: Run focused boundary GREEN**

Run:

```powershell
npx.cmd jest --ci --runInBand tests/security/benchmarkAnalyticsInput.test.ts tests/controllers/benchmarkAnalytics.controller.test.ts tests/security/validatedInput.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit the HTTP boundary**

```powershell
git add -- src/security/benchmarkAnalyticsInput.ts src/controllers/analytics/benchmarkAnalytics.controller.ts tests/security/benchmarkAnalyticsInput.test.ts tests/controllers/benchmarkAnalytics.controller.test.ts
git commit -m "refactor(analytics): add benchmarks boundary"
```

---

### Task 4: Wire the runtime and remove the legacy handler

**Files:**
- Create: `src/services/analytics/benchmarkAnalytics.runtime.ts`
- Modify: `src/routes/analytics.routes.ts`
- Modify: `src/controllers/analytics.controller.ts`
- Modify: `tests/routes/classAnalytics.routes.test.ts`
- Modify: `src/security/route-catalog.json`
- Modify: `eslint-suppressions.json`

**Interfaces:**
- Runtime export:
  ```ts
  export const getBenchmarkAnalytics =
    createBenchmarkAnalyticsController(service)
  ```

- [ ] **Step 1: Write the failing route-wiring test**

Mock:

```ts
jest.mock(
  '../../src/services/analytics/benchmarkAnalytics.runtime',
  () => ({
    getBenchmarkAnalytics: extractedHandler('getBenchmarkAnalytics'),
  }),
)
```

Remove `getBenchmarks` from the legacy-controller mock and replace the current
legacy assertion with:

```ts
const response = await request(createTestApp())
  .get('/benchmarks?__bo2_offline_loopback=1')

expect(response.body).toMatchObject({
  source: 'class-analytics-boundary',
  handler: 'getBenchmarkAnalytics',
  input: { params: {}, query: {} },
})
```

Also prove `?extra=value` returns `400`.

- [ ] **Step 2: Run the route suite and verify RED**

Run:

```powershell
npx.cmd jest --ci --runInBand tests/routes/classAnalytics.routes.test.ts
```

Expected: fail because the route still uses the legacy controller.

- [ ] **Step 3: Compose and mount the runtime**

Create:

```ts
const reader = new MongooseBenchmarkAnalyticsReader()
const service = new BenchmarkAnalyticsService(reader)

export const getBenchmarkAnalytics =
  createBenchmarkAnalyticsController(service)
```

Mount:

```ts
router.get(
  '/benchmarks',
  withValidatedInput(
    benchmarkAnalyticsInput,
    getBenchmarkAnalytics,
  ),
)
```

- [ ] **Step 4: Prove and remove only the legacy slice**

Run before editing:

```powershell
rg -n "getBenchmarks|Calculando benchmarks|benchmarks da indústria" src tests
```

Remove:

- the old `getBenchmarks` function from `analytics.controller.ts`;
- its `analyticsController` property;
- imports that become unused only because of that deletion.

Do not touch `recalculateIndividualScores` or `getMultiPlatformAnalytics`.

- [ ] **Step 5: Update catalog facts**

Keep the route count unchanged. Set the target entry to:

```json
{
  "method": "GET",
  "path": "/api/analytics/benchmarks",
  "access": "authenticated",
  "consumer": "desconhecido",
  "writes": false,
  "destructive": false,
  "evidence": "wrapper sem caller de componente no Front em <src/features/analytics/analytics.api.ts>; rota em src/routes/analytics.routes.ts:<linha>"
}
```

Update every shifted `analytics.routes.ts` evidence line, not only the target
entry. Retain route-usage instrumentation.

- [ ] **Step 6: Prune lint suppressions and prove no orphan**

Run:

```powershell
npm.cmd run lint:baseline:prune
rg -n "getBenchmarks|Calculando benchmarks|benchmarks da indústria" src tests
```

Expected: only the new controller's public error message and intentional test
copy remain; no legacy function or route reference remains.

- [ ] **Step 7: Run focused backend GREEN**

Run:

```powershell
npx.cmd jest --ci --runInBand tests/services/analytics/benchmarkAnalytics.service.test.ts tests/services/analytics/mongooseBenchmarkAnalytics.reader.test.ts tests/security/benchmarkAnalyticsInput.test.ts tests/controllers/benchmarkAnalytics.controller.test.ts tests/routes/classAnalytics.routes.test.ts tests/security/routeCatalog.test.ts
```

Expected: all pass and catalog remains exactly 437/437.

- [ ] **Step 8: Run wiring and field-source mutations**

One at a time:

1. wire `/benchmarks` back to the legacy mock;
2. replace combined engagement with top-level `engagementScore`;
3. replace resolved progress with top-level numeric `progress`.

Each mutation must make a focused test RED. Restore and rerun GREEN.

- [ ] **Step 9: Commit the wired backend**

```powershell
git add -- src/services/analytics/benchmarkAnalytics.runtime.ts src/routes/analytics.routes.ts src/controllers/analytics.controller.ts tests/routes/classAnalytics.routes.test.ts src/security/route-catalog.json eslint-suppressions.json
git commit -m "fix(analytics): harden class benchmarks"
```

---

### Task 5: Align the Front runtime contract

**Files:**
- Modify: `../Front/src/types/analytics.types.ts`
- Modify: `../Front/src/features/analytics/analytics.schemas.ts`
- Modify: `../Front/src/features/analytics/__tests__/analytics.api.test.ts`
- Preserve staged: `../Front/scripts/git-hooks/pre-commit`

**Interfaces:**
- Produces:
  ```ts
  export type BenchmarksData =
    | BenchmarksResult
    | EmptyBenchmarksResult
  ```

- [ ] **Step 1: Confirm Front branch and protected staged file**

Run:

```powershell
git -c safe.directory=C:/Users/User/Documents/GitHub/Riquinho/api/Front/Front -C ../Front status -sb
git -c safe.directory=C:/Users/User/Documents/GitHub/Riquinho/api/Front/Front -C ../Front diff --cached --name-only
git -c safe.directory=C:/Users/User/Documents/GitHub/Riquinho/api/Front/Front -C ../Front config --get core.hooksPath
```

Expected: branch `remake`; only the pre-existing hook is staged before this
task; hooks path is `scripts/git-hooks`.

- [ ] **Step 2: Write failing API contract tests**

Import `logger` and `benchmarksDataSchema`. Add a representative populated
payload containing:

```ts
{
  benchmarks: {
    engagement: {
      excellent: 90,
      good: 75,
      average: 50,
      needsImprovement: 25,
      poor: 10,
    },
    progress: {
      excellent: 90,
      good: 75,
      average: 50,
      needsImprovement: 25,
      poor: 10,
    },
    activityRate: {
      excellent: 90,
      good: 75,
      average: 50,
      needsImprovement: 25,
      poor: 10,
    },
    classSize: { large: 100, medium: 50, small: 25 },
  },
  industryStats: {
    totalClasses: 2,
    totalStudents: 20,
    averageClassSize: 10,
    overallEngagement: 60,
    overallProgress: 55,
    overallActivityRate: 80,
  },
  topPerformers: [{
    classId: 'class-a',
    className: 'Class A',
    totalStudents: 10,
    activeStudents: 9,
    activityRate: 90,
    averageEngagement: 80,
    averageProgress: 75,
  }],
  needsAttention: [],
  insights: [{
    type: 'success',
    message: '1 turmas estão com performance excellent',
    recommendation: 'Analise as melhores práticas dessas turmas para replicar',
  }],
  metadata: {
    calculationDate: '2026-07-29T10:00:00.000Z',
    classesAnalyzed: 2,
    calculationDuration: 25,
    dataFreshness: 'Calculado em tempo real',
  },
}
```

Prove:

1. `getAnalyticsBenchmarks` returns this payload without calling
   `logger.warn`;
2. each exact empty payload returns without warning;
3. `benchmarksDataSchema.safeParse` rejects the old
   `{ industry, topPerformers: object, recommendations }` payload.

- [ ] **Step 3: Run the Front test and verify RED**

Run:

```powershell
yarn.cmd --cwd ../Front test --runInBand src/features/analytics/__tests__/analytics.api.test.ts
```

Expected: populated/empty payloads trigger the current contract warning and
the old invented payload still parses.

- [ ] **Step 4: Replace the TypeScript contract**

Replace the invented interface with:

```ts
export interface BenchmarkLevels {
  excellent: number
  good: number
  average: number
  needsImprovement: number
  poor: number
}

export interface ClassBenchmarkMetric {
  classId: string
  className: string
  totalStudents: number
  activeStudents: number
  activityRate: number
  averageEngagement: number
  averageProgress: number
}

export interface BenchmarkInsight {
  type: 'warning' | 'info' | 'success'
  message: string
  recommendation: string
}

export interface BenchmarksResult {
  benchmarks: {
    engagement: BenchmarkLevels
    progress: BenchmarkLevels
    activityRate: BenchmarkLevels
    classSize: {
      large: number
      medium: number
      small: number
    }
  }
  industryStats: {
    totalClasses: number
    totalStudents: number
    averageClassSize: number
    overallEngagement: number
    overallProgress: number
    overallActivityRate: number
  }
  topPerformers: ClassBenchmarkMetric[]
  needsAttention: ClassBenchmarkMetric[]
  insights: BenchmarkInsight[]
  metadata: {
    calculationDate: string
    classesAnalyzed: number
    calculationDuration: number
    dataFreshness: 'Calculado em tempo real'
  }
}

export interface EmptyBenchmarksResult {
  message:
    | 'Nenhuma turma ativa encontrada para calcular benchmarks'
    | 'Nenhuma turma com dados válidos encontrada'
  totalClasses: 0
}

export type BenchmarksData =
  | BenchmarksResult
  | EmptyBenchmarksResult
```

Do not remove `getAnalyticsBenchmarks`, `fetchIndustryBenchmarks`, or
`fetchBenchmarks`.

- [ ] **Step 5: Replace the Zod contract**

Build reusable schemas:

```ts
const benchmarkLevelsSchema = z.object({
  excellent: z.number(),
  good: z.number(),
  average: z.number(),
  needsImprovement: z.number(),
  poor: z.number(),
}).passthrough()
```

Create:

```ts
const classBenchmarkMetricSchema = z.object({
  classId: z.string(),
  className: z.string(),
  totalStudents: z.number(),
  activeStudents: z.number(),
  activityRate: z.number(),
  averageEngagement: z.number(),
  averageProgress: z.number(),
}).passthrough()

const benchmarksResultSchema = z.object({
  benchmarks: z.object({
    engagement: benchmarkLevelsSchema,
    progress: benchmarkLevelsSchema,
    activityRate: benchmarkLevelsSchema,
    classSize: z.object({
      large: z.number(),
      medium: z.number(),
      small: z.number(),
    }).passthrough(),
  }).passthrough(),
  industryStats: z.object({
    totalClasses: z.number(),
    totalStudents: z.number(),
    averageClassSize: z.number(),
    overallEngagement: z.number(),
    overallProgress: z.number(),
    overallActivityRate: z.number(),
  }).passthrough(),
  topPerformers: z.array(classBenchmarkMetricSchema),
  needsAttention: z.array(classBenchmarkMetricSchema),
  insights: z.array(z.object({
    type: z.enum(['warning', 'info', 'success']),
    message: z.string(),
    recommendation: z.string(),
  }).passthrough()),
  metadata: z.object({
    calculationDate: z.string(),
    classesAnalyzed: z.number(),
    calculationDuration: z.number(),
    dataFreshness: z.literal('Calculado em tempo real'),
  }).passthrough(),
}).passthrough()

const emptyBenchmarksResultSchema = z.object({
  message: z.union([
    z.literal('Nenhuma turma ativa encontrada para calcular benchmarks'),
    z.literal('Nenhuma turma com dados válidos encontrada'),
  ]),
  totalClasses: z.literal(0),
}).passthrough()
```

Export:

```ts
export const benchmarksDataSchema = asApiSchema<BenchmarksData>(
  z.union([benchmarksResultSchema, emptyBenchmarksResultSchema]),
)
```

- [ ] **Step 6: Run Front focused GREEN and schema mutation**

Run:

```powershell
yarn.cmd --cwd ../Front test --runInBand src/features/analytics/__tests__/analytics.api.test.ts src/features/analytics/__tests__/useAnalyticsController.test.tsx
```

Temporarily restore the old `industry` schema. The representative payload test
must warn/fail. Restore the union and rerun GREEN.

- [ ] **Step 7: Stage and commit only analytics paths**

Run:

```powershell
git -c safe.directory=C:/Users/User/Documents/GitHub/Riquinho/api/Front/Front -C ../Front add -- src/types/analytics.types.ts src/features/analytics/analytics.schemas.ts src/features/analytics/__tests__/analytics.api.test.ts
git -c safe.directory=C:/Users/User/Documents/GitHub/Riquinho/api/Front/Front -C ../Front diff --cached --name-only
```

The index will also list the pre-existing hook. Commit only named analytics
paths:

```powershell
git -c safe.directory=C:/Users/User/Documents/GitHub/Riquinho/api/Front/Front -C ../Front commit --only -m "fix(analytics): align benchmarks contract" -- src/types/analytics.types.ts src/features/analytics/analytics.schemas.ts src/features/analytics/__tests__/analytics.api.test.ts
```

Verify:

```powershell
git -c safe.directory=C:/Users/User/Documents/GitHub/Riquinho/api/Front/Front -C ../Front show --name-only --format=oneline HEAD
git -c safe.directory=C:/Users/User/Documents/GitHub/Riquinho/api/Front/Front -C ../Front status -sb
```

Expected: commit contains only the three analytics files; the security hook
remains staged and unchanged.

---

### Task 6: Run full cross-repository verification and record evidence

**Files:**
- Modify: `docs/HARDENING-WORKPLAN.md`

- [ ] **Step 1: Run the complete BO2_API offline gate**

Run independently:

```powershell
npm.cmd run lint
npm.cmd run types:check
npx.cmd jest --ci --runInBand
npm.cmd run build
```

Expected:

- lint exit 0;
- TypeScript ratchet 0 errors / 0 dirty files;
- every non-skipped Jest suite passes;
- build exit 0.

Only pre-existing Mongoose duplicate-index/reserved-key warnings may remain.

- [ ] **Step 2: Run the complete Front gate**

Run independently:

```powershell
yarn.cmd --cwd ../Front lint
yarn.cmd --cwd ../Front test --runInBand
yarn.cmd --cwd ../Front build
```

Expected: all commands exit 0 without network access.

- [ ] **Step 3: Run final negative review in BO2_API**

Run:

```powershell
git diff --check
rg -n "getBenchmarks|Calculando benchmarks" src/controllers/analytics.controller.ts src/routes/analytics.routes.ts
rg -n "\bany\b|@ts-ignore|@ts-expect-error|eslint-disable|\bas\s+(any|unknown)\b|!\.|console\." src/services/analytics/benchmarkAnalytics.service.ts src/services/analytics/mongooseBenchmarkAnalytics.reader.ts src/controllers/analytics/benchmarkAnalytics.controller.ts src/services/analytics/benchmarkAnalytics.runtime.ts
git diff --name-only HEAD~4..HEAD | rg "(package-lock\.json|yarn\.lock)$"
```

Expected: no legacy handler, forbidden new suppression, console call, or
lockfile change.

- [ ] **Step 4: Run final cross-repository state review**

Run:

```powershell
git status -sb
git log -6 --oneline
git -c safe.directory=C:/Users/User/Documents/GitHub/Riquinho/api/Front/Front -C ../Front status -sb
git -c safe.directory=C:/Users/User/Documents/GitHub/Riquinho/api/Front/Front -C ../Front log -3 --oneline
git -c safe.directory=C:/Users/User/Documents/GitHub/Riquinho/api/Front/Front -C ../Front diff --cached -- scripts/git-hooks/pre-commit
```

Expected: both branches are `remake`; BO2_API contains only this block's
commits; Front retains the original staged hook diff.

- [ ] **Step 5: Record factual outcomes**

Add one completed ARCH-02/ARCH-03 workplan entry containing:

- controller line-count before and after;
- query complexity `1 + 3N -> at most 2`;
- exact canonical field precedence;
- route catalog count and consumer correction;
- populated and empty Front contract proof;
- mutation RED/GREEN results;
- backend lint ratchet before/after counts;
- exact backend and Front gate counts;
- confirmation that the Front hook remained outside every analytics commit.

- [ ] **Step 6: Commit the evidence**

```powershell
git add -- docs/HARDENING-WORKPLAN.md
git commit -m "docs(analytics): record benchmarks boundary"
```

- [ ] **Step 7: Verify the committed trees**

Run:

```powershell
git status -sb
git show --check --stat --oneline HEAD
git -c safe.directory=C:/Users/User/Documents/GitHub/Riquinho/api/Front/Front -C ../Front show --check --stat --oneline HEAD
```

Expected: committed implementation and evidence are clean in BO2_API; the only
remaining Front change is the pre-existing staged security hook. Do not push.
