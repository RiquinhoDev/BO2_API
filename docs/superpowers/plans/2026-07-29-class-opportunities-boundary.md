# Class Opportunities Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the live class-opportunities endpoint into a strict, testable vertical slice while preserving every existing business rule and Front response field.

**Architecture:** A pure ordered rule registry derives opportunities from a minimal class-analytics snapshot. A service coordinates the existing analytics reader and an injected clock; a controller factory handles only HTTP mapping through the shared strict validation boundary and central error handler.

**Tech Stack:** TypeScript 5.9, Express 5, Zod 3, Jest 29, Supertest, existing `validatedSchema`/`withValidatedInput`.

## Global Constraints

- Work only on branch `remake`.
- Run entirely offline: no real Guru, Hotmart, ActiveCampaign, CursEduca, Discord, or production Mongo access.
- Do not run `npm install`, `npm ci`, or delete `node_modules`.
- Preserve the exact successful Front contract, Portuguese copy, thresholds, rule overlap, and stable ordering.
- Never introduce `any`, casts used as suppressions, non-null assertions, `@ts-ignore`, new `console.*`, or duplicate redaction logic.
- Rule #9: prove every removed symbol is unreferenced before deleting it.
- Keep `/analytics/benchmarks`, multi-platform analytics, and score recalculation outside this change.
- Conventional Commit subjects must be lowercase.

---

### Task 1: Characterise the pure opportunity rules

**Files:**
- Create: `tests/services/analytics/classOpportunities.service.test.ts`
- Create: `src/services/analytics/classOpportunities.service.ts`

**Interfaces:**
- Consumes:
  ```ts
  export interface ClassOpportunitiesReader {
    getClassAnalytics(
      classId: string,
    ): Promise<ClassOpportunityAnalyticsSnapshot | null>
  }
  ```
- Produces:
  ```ts
  export type OpportunityPriority = 'high' | 'medium' | 'low' | 'info'

  export interface OpportunityItem {
    type: string
    priority: OpportunityPriority
    title: string
    description: string
    suggestion: string
    impact: string
  }

  export interface ClassOpportunitiesData {
    classId: string
    className: string
    totalOpportunities: number
    opportunities: OpportunityItem[]
    classMetrics: {
      totalStudents: number
      activeStudents: number
      averageEngagement: number
      healthScore: number
      averageProgress: number
    }
    summary: {
      highPriority: number
      mediumPriority: number
      lowPriority: number
      positiveInsights: number
    }
    analysisDate: string
  }

  export type ClassOpportunitiesResult =
    | { found: false }
    | { found: true; data: ClassOpportunitiesData; timestamp: number }

  export function deriveClassOpportunities(
    analytics: ClassOpportunityAnalyticsSnapshot,
    analysisDate: string,
  ): ClassOpportunitiesData

  export class ClassOpportunitiesService {
    constructor(
      reader: ClassOpportunitiesReader,
      now?: () => number,
    )
    getForClass(classId: string): Promise<ClassOpportunitiesResult>
  }
  ```

- [ ] **Step 1: Write the failing service tests**

Create typed fixtures with:

```ts
const healthyClass: ClassOpportunityAnalyticsSnapshot = {
  classId: 'class-a',
  className: 'Class A',
  totalStudents: 10,
  activeStudents: 10,
  averageEngagement: 70,
  averageProgress: 50,
  healthScore: 80,
  engagementDistribution: {
    muito_alto: 0,
    alto: 0,
    medio: 10,
    baixo: 0,
    muito_baixo: 0,
  },
  healthFactors: { retention: 50 },
}
```

Add tests that prove:

1. a snapshot crossing all negative thresholds returns the existing types in
   stable priority order:
   `engagement`, `activity`, `health`, `progress_critical`, `retention`,
   `progress`, `distribution`;
2. progress `20` intentionally emits both `progress` and
   `progress_critical`;
3. engagement `70`, health `80`, progress `40`, inactive rate `30`, low
   distribution `40`, retention `50`, and activity rate `90` do not cross
   their strict boundaries; progress `0` still emits `progress` but does not
   emit `progress_critical`;
4. zero students never emits rate/distribution opportunities and never
   produces `NaN` or `Infinity`;
5. positive thresholds emit `success`, `excellence`, and `balance` with the
   original copy;
6. summary counts exactly match the final priorities;
7. a fixed clock produces deterministic `analysisDate` and result timestamp;
8. a missing class returns `{ found: false }`;
9. a thrown reader error remains thrown for the controller to centralise.

- [ ] **Step 2: Run the service test and verify RED**

Run:

```powershell
npx.cmd jest --ci --runInBand tests/services/analytics/classOpportunities.service.test.ts
```

Expected: fail with `Cannot find module ...classOpportunities.service`.

- [ ] **Step 3: Implement the minimal typed rule engine**

Define the minimal snapshot:

```ts
export interface ClassOpportunityAnalyticsSnapshot {
  classId: string
  className: string
  totalStudents: number
  activeStudents: number
  averageEngagement: number
  averageProgress: number
  healthScore: number
  engagementDistribution: {
    muito_alto: number
    alto: number
    medio: number
    baixo: number
    muito_baixo: number
  }
  healthFactors?: { retention: number }
}
```

Use:

```ts
type OpportunityRule = (
  analytics: ClassOpportunityAnalyticsSnapshot,
) => OpportunityItem | null

const opportunityRules: readonly OpportunityRule[] = [
  // Existing source order, one typed function per rule.
]
```

Implement these exact conditions:

```text
engagement             averageEngagement < 50
activity               totalStudents > 0 and inactiveRate > 30
progress               averageProgress < 40
health                 healthScore < 60
distribution           totalStudents > 0 and lowEngagementRate > 40
progress_critical      averageProgress > 0 and averageProgress < 25
retention              healthFactors exists and retention < 50
engagement_improvement averageEngagement >= 50 and averageEngagement < 70
activity_optimization  totalStudents > 0 and activityRate >= 70 and < 90
success                averageEngagement > 70
excellence             healthScore > 80
balance                totalStudents > 0 and highEngagementRate > 60
```

Evaluate in this order, filter `null`, then use a stable priority mapping:

```ts
const priorityOrder: Record<OpportunityPriority, number> = {
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
}
```

Build the response using the exact existing fields:

```ts
return {
  classId: analytics.classId,
  className: analytics.className,
  totalOpportunities: opportunities.length,
  opportunities,
  classMetrics: {
    totalStudents: analytics.totalStudents,
    activeStudents: analytics.activeStudents,
    averageEngagement: analytics.averageEngagement,
    healthScore: analytics.healthScore,
    averageProgress: analytics.averageProgress,
  },
  summary: {
    highPriority: count('high'),
    mediumPriority: count('medium'),
    lowPriority: count('low'),
    positiveInsights: count('info'),
  },
  analysisDate,
}
```

The service reads once, returns not-found without synthetic data, and calls the
clock once after a successful read.

- [ ] **Step 4: Run the service test and verify GREEN**

Run:

```powershell
npx.cmd jest --ci --runInBand tests/services/analytics/classOpportunities.service.test.ts
```

Expected: all service tests pass.

- [ ] **Step 5: Run a representative mutation**

Temporarily change `averageEngagement < 50` to `<= 50`.

Run the focused suite and require a threshold-edge failure. Restore `< 50` and
rerun to green.

- [ ] **Step 6: Commit the pure rule engine**

```powershell
git add -- src/services/analytics/classOpportunities.service.ts tests/services/analytics/classOpportunities.service.test.ts
git commit -m "refactor(analytics): extract opportunity rules"
```

---

### Task 2: Add the strict controller boundary

**Files:**
- Create: `src/controllers/analytics/classOpportunities.controller.ts`
- Create: `tests/controllers/classOpportunities.controller.test.ts`
- Reuse: `src/security/classAnalyticsInput.ts`

**Interfaces:**
- Consumes:
  ```ts
  type OpportunitiesService = Pick<ClassOpportunitiesService, 'getForClass'>
  ```
- Produces:
  ```ts
  export function createClassOpportunitiesController(
    service: OpportunitiesService,
  ): ValidatedInputHandler<typeof classAnalyticsClassInput>
  ```

- [ ] **Step 1: Write failing controller tests**

Build an Express test app with:

```ts
app.get(
  '/opportunities/:classId',
  withValidatedInput(
    classAnalyticsClassInput,
    createClassOpportunitiesController(service),
  ),
)
app.use(errors.handler)
```

Prove:

1. an encoded path identifier reaches `getForClass` trimmed and returns the
   existing `{ success: true, data, timestamp }` envelope;
2. unknown query input returns `400 INVALID_REQUEST` before the service;
3. `{ found: false }` preserves 404 and `Turma não encontrada`;
4. a dependency error becomes
   `500 CLASS_OPPORTUNITIES_READ_FAILED` with a correlation ID;
5. the public response excludes the injected `database-secret-detail`.

- [ ] **Step 2: Run the controller test and verify RED**

Run:

```powershell
npx.cmd jest --ci --runInBand tests/controllers/classOpportunities.controller.test.ts
```

Expected: fail because the controller module does not exist.

- [ ] **Step 3: Implement the controller factory**

Implement only HTTP mapping:

```ts
export function createClassOpportunitiesController(
  service: OpportunitiesService,
): ValidatedInputHandler<typeof classAnalyticsClassInput> {
  return async (input, _req, res, next) => {
    try {
      const result = await service.getForClass(input.params.classId)
      if (!result.found) {
        res.status(404).json({
          success: false,
          message: 'Turma não encontrada',
        })
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
        code: 'CLASS_OPPORTUNITIES_READ_FAILED',
        publicMessage: 'Erro ao analisar oportunidades de melhoria',
        cause: error,
      }))
    }
  }
}
```

- [ ] **Step 4: Run controller and boundary suites**

Run:

```powershell
npx.cmd jest --ci --runInBand tests/controllers/classOpportunities.controller.test.ts tests/security/classAnalyticsInput.test.ts
```

Expected: all tests pass.

---

### Task 3: Wire the runtime and delete the legacy slice

**Files:**
- Create: `src/services/analytics/classOpportunities.runtime.ts`
- Modify: `src/routes/analytics.routes.ts`
- Modify: `src/controllers/analytics.controller.ts`
- Modify: `tests/routes/classAnalytics.routes.test.ts`
- Modify: `src/security/route-catalog.json`
- Modify: `eslint-suppressions.json`

**Interfaces:**
- Runtime export:
  ```ts
  export const getClassOpportunities =
    createClassOpportunitiesController(service)
  ```

- [ ] **Step 1: Write a failing route-wiring test**

Mock `classOpportunities.runtime` with the existing extracted-handler helper,
remove `getOpportunities` from the legacy-controller mock, and assert:

```ts
expect(response.body).toMatchObject({
  source: 'class-analytics-boundary',
  handler: 'getClassOpportunities',
  input: {
    params: { classId: 'class-a' },
    query: {},
  },
})
```

Also assert `?extra=value` returns 400 and never invokes the handler.

- [ ] **Step 2: Run route test and verify RED**

Run:

```powershell
npx.cmd jest --ci --runInBand tests/routes/classAnalytics.routes.test.ts
```

Expected: fail because the route still calls the legacy controller.

- [ ] **Step 3: Add runtime wiring and replace the route**

Wire:

```ts
const service = new ClassOpportunitiesService(analyticsService)
export const getClassOpportunities =
  createClassOpportunitiesController(service)
```

Replace the route with:

```ts
router.get(
  '/opportunities/:classId',
  withValidatedInput(classAnalyticsClassInput, getClassOpportunities),
)
```

- [ ] **Step 4: Remove only the proven legacy code**

Before deletion, run:

```powershell
rg -n "getOpportunities|OpportunityItem|type Priority|ClassParams" src tests
```

Then remove:

- the legacy `getOpportunities` handler;
- its `analyticsController` property;
- local `OpportunityItem`, `Priority`, and `ClassParams` declarations only if
  the negative reference check proves they have no other live consumer.

Do not touch `getBenchmarks`, `getMultiPlatformAnalytics`, or
`recalculateIndividualScores`.

Update every shifted `analytics.routes.ts` evidence line in
`route-catalog.json`; do not hand-edit only the target route and leave stale
facts.

- [ ] **Step 5: Prune suppressions and prove no orphan**

Run:

```powershell
npm.cmd run lint:baseline:prune
rg -n "getOpportunities|OpportunityItem|type Priority|ClassParams" src tests
```

Expected: no legacy definitions or route references; only new
`getClassOpportunities` symbols remain.

- [ ] **Step 6: Run focused GREEN suites**

Run:

```powershell
npx.cmd jest --ci --runInBand tests/services/analytics/classOpportunities.service.test.ts tests/controllers/classOpportunities.controller.test.ts tests/routes/classAnalytics.routes.test.ts tests/security/routeCatalog.test.ts
```

Expected: all focused suites pass and route catalog remains 437/437.

- [ ] **Step 7: Run route-wiring mutation**

Temporarily wire `/opportunities/:classId` back to the legacy benchmark
handler/mock. The route test must fail naming the wrong handler. Restore the
new runtime and rerun green.

- [ ] **Step 8: Commit the boundary extraction**

```powershell
git add -- src/controllers/analytics.controller.ts src/controllers/analytics/classOpportunities.controller.ts src/routes/analytics.routes.ts src/security/route-catalog.json src/services/analytics/classOpportunities.runtime.ts tests/controllers/classOpportunities.controller.test.ts tests/routes/classAnalytics.routes.test.ts eslint-suppressions.json
git commit -m "fix(analytics): harden class opportunities"
```

---

### Task 4: Document and verify the exact committed tree

**Files:**
- Modify: `docs/HARDENING-WORKPLAN.md`

- [ ] **Step 1: Record factual outcomes**

Add one completed ARCH-02 entry containing:

- physical controller line-count reduction;
- live Front consumer proof;
- exact extracted responsibilities;
- legacy-symbol negative grep;
- `no-explicit-any`, `no-console`, and `no-unused-vars` before/after counts;
- route catalog count;
- RED/GREEN and mutation evidence;
- exact final gate counts.

- [ ] **Step 2: Run the complete offline gate**

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
- all non-skipped Jest suites pass;
- build exit 0.

Only pre-existing Mongoose duplicate-index/reserved-key warnings may remain.

- [ ] **Step 3: Run final negative review**

Run:

```powershell
git diff --check
rg -n "\bany\b|@ts-ignore|@ts-expect-error|eslint-disable|\bas\s+(any|unknown)\b|!\.|console\." src/services/analytics/classOpportunities.service.ts src/controllers/analytics/classOpportunities.controller.ts src/services/analytics/classOpportunities.runtime.ts
git diff --name-only | rg "(package-lock\.json|yarn\.lock)$"
```

Expected: no forbidden new pattern and no lockfile change.

- [ ] **Step 4: Commit the evidence**

```powershell
git add -- docs/HARDENING-WORKPLAN.md
git commit -m "docs(analytics): record opportunities boundary"
```

- [ ] **Step 5: Verify repository state**

Run:

```powershell
git status -sb
git log -5 --oneline
git show --check --stat --oneline HEAD
```

Expected: clean `remake`, local commits retained, no push without explicit
current authorisation.
