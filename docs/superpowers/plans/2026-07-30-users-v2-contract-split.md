# Users V2 Contract Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the polymorphic `GET /api/users/v2` contract with explicit enrollment-list and complete-analytics resources, migrate every first-party Front consumer, and retain a measured legacy compatibility adapter.

**Architecture:** The backend gains two vertically sliced use cases: a strict, user-paginated enrollment listing and a complete server-side analytics aggregation. The old route becomes a typed adapter over those use cases and the existing grouped-product query. The Front consumes both new contracts through shared Zod boundaries; dead hooks and client aggregators are removed only after cross-repository negative proof.

**Tech Stack:** TypeScript 5.9, Express 5, Zod 3.25, Mongoose 8, Jest 29, MongoMemoryServer, React 19, TanStack Query 5, Axios, Front Zod 3.24.

## Global Constraints

- Work only on `remake` in both `BO2_API` and `Front`; never `main`.
- Before each task, verify both worktrees and preserve unrelated user changes.
- No real Guru, Hotmart, ActiveCampaign, CursEduca or Discord request and no production Mongo connection.
- Do not run `npm install`, `npm ci`, `yarn install`, or delete `node_modules`.
- Every behavior change follows RED -> observed expected failure -> GREEN -> refactor.
- One coherent subject per commit; Conventional Commits subjects start lowercase.
- Never use `any`, suppressive casts, non-null assertions, `@ts-ignore`, `@ts-expect-error`, or new ESLint suppressions.
- New inputs reject unknown, dotted, operator and prototype keys. The legacy translator alone ignores benign unknown query keys.
- Use escaped literal search; never pass client input to a raw regular expression.
- No `populate`, per-user query, per-product query, or query count that grows with result size.
- Preserve the existing Dashboard row shape and user-based pagination semantics.
- The enrollment page limit defaults to `50` and is capped at `200`; the legacy route retains its cap of `100`.
- Runtime imports must not connect to Mongo or execute queries.
- Errors use `HttpError`, the central redacted logger and correlation IDs; never log raw queries, names, emails, IDs or URLs.
- Backend and Front must be ready together before either is deployed.
- Do not remove the legacy route until the documented production observation trigger is satisfied.

## File Structure

### Backend domain slice

- `src/security/usersV2ListInput.ts`: strict enrollment/analytics inputs and the compatibility-only legacy schema.
- `src/services/users/usersV2Enrollment.contract.ts`: canonical filters, rows, pagination, reader port and response types.
- `src/services/users/usersV2Enrollment.domain.ts`: one engagement classifier/range mapper and finite-number normalization.
- `src/services/users/usersV2Enrollment.service.ts`: pure response orchestration.
- `src/services/users/mongooseUsersV2Enrollment.reader.ts`: one bounded aggregation and explainable persistence adapter.
- `src/services/users/usersV2OverviewAnalytics.service.ts`: pure analytics result mapping.
- `src/services/users/mongooseUsersV2OverviewAnalytics.reader.ts`: one bounded aggregate with zero-result fallback.
- `src/services/users/usersV2List.runtime.ts`: import-safe composition for enrollment, analytics and legacy handlers.
- `src/controllers/users/usersV2List.controller.ts`: injected controllers and stable public errors.
- `src/services/users/usersV2Legacy.service.ts`: typed compatibility translation and response mapping.

### Front domain slice

- `Front/src/features/users-v2/usersV2.schemas.ts`: the single runtime boundary for enrollment and analytics envelopes.
- `Front/src/features/users-v2/usersV2.types.ts`: types inferred from the schemas.
- `Front/src/features/users-v2/usersV2.api.ts`: HTTP calls returning only parsed data.
- `Front/src/features/users-v2/useUsersV2Analytics.ts`: one query hook for Analytics.

The existing Dashboard and ActiveCampaign modules import the shared enrollment boundary. `usersV2.service.ts` retains only independently live detail/stats methods after negative-reference proof.

---

### Task 1: Characterize legacy behavior and define canonical input/domain contracts

**Files:**
- Create: `src/security/usersV2ListInput.ts`
- Create: `src/services/users/usersV2Enrollment.contract.ts`
- Create: `src/services/users/usersV2Enrollment.domain.ts`
- Create: `tests/security/usersV2ListInput.test.ts`
- Create: `tests/services/users/usersV2Enrollment.domain.test.ts`
- Create: `tests/controllers/usersV2Legacy.characterization.test.ts`
- Modify: `src/controllers/users.controller.ts:174-180`

**Interfaces:**
- Produces:
  - `usersV2EnrollmentInput`
  - `usersV2OverviewAnalyticsInput`
  - `usersV2LegacyInput`
  - `UsersV2EnrollmentFilters`
  - `UsersV2EnrollmentRow`
  - `UsersV2EnrollmentReader`
  - `engagementLevelFromScore(score: number): EngagementLevel`
  - `engagementRangeFor(levels: EngagementLevel[]): MongoNumericRange[]`

- [ ] **Step 1: Write strict-input RED tests**

Cover defaults, caps, enum normalization, CSV engagement levels, `minEngagement <= maxEngagement`, ISO dates, ObjectId, and rejection of unknown/dotted/operator/literal prototype keys. The wished-for API is:

```ts
const parsed = usersV2EnrollmentInput.parse({
  params: {},
  query: {
    page: '2',
    limit: '10000',
    platform: 'HOTMART',
    engagementLevel: 'NONE,ALTO',
    minEngagement: '20',
    maxEngagement: '80',
  },
  body: {},
})

expect(parsed.query).toEqual(expect.objectContaining({
  page: 2,
  limit: 200,
  platform: 'hotmart',
  engagementLevel: ['NONE', 'ALTO'],
  minEngagement: 20,
  maxEngagement: 80,
}))
```

Also prove analytics accepts no query fields and legacy ignores `{ benign: "x" }` while retaining `limit=100`, any present `topPercentage -> minEngagement=77`, and rejecting `{ "$where": "x" }`.

- [ ] **Step 2: Run RED**

Run:

```powershell
npx jest --ci tests/security/usersV2ListInput.test.ts
```

Expected: fail because `usersV2ListInput.ts` does not exist.

- [ ] **Step 3: Implement the three schemas**

Use `validatedSchema()` for the two new endpoints. Use a direct outer `z.object()` with strict params/body and a `.passthrough()` query for the legacy route so `withValidatedInput()` still runs the operator/prototype guard before benign unknowns are stripped by the translator.

Canonical query transformations:

```ts
page: positiveInteger.default(1)
limit: positiveInteger.default(50).transform((value) => Math.min(value, 200))
platform: z.preprocess(lowercase, z.enum(['hotmart', 'curseduca', 'discord']))
productId: z.string().regex(/^[a-f\d]{24}$/i)
status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'CANCELLED', 'PARA_INATIVAR'])
search: z.string().trim().min(1).max(200)
progressLevel: z.enum(['MUITO_BAIXO', 'BAIXO', 'MEDIO', 'ALTO', 'MUITO_ALTO'])
engagementLevel: csvEngagementLevels
minEngagement: integerPercent
maxEngagement: integerPercent
lastAccessBefore: z.string().datetime({ offset: true })
enrolledAfter: z.string().datetime({ offset: true })
```

The outer schema refinement returns `INVALID_REQUEST` when `minEngagement > maxEngagement`.

- [ ] **Step 4: Write classifier RED tests**

Assert boundary pairs `-1/0`, `0/1`, `19/20`, `39/40`, `59/60`, `79/80`, plus non-finite normalization. Assert the range mapper emits:

```ts
NONE          => { maxInclusive: 0 }
MUITO_BAIXO   => { minExclusive: 0, maxExclusive: 20 }
BAIXO         => { minInclusive: 20, maxExclusive: 40 }
MEDIO         => { minInclusive: 40, maxExclusive: 60 }
ALTO          => { minInclusive: 60, maxExclusive: 80 }
MUITO_ALTO    => { minInclusive: 80 }
```

- [ ] **Step 5: Run classifier RED and implement one source of truth**

Run:

```powershell
npx jest --ci tests/services/users/usersV2Enrollment.domain.test.ts
```

Expected: missing-module failure. Implement the classifier in `usersV2Enrollment.domain.ts`, replace the route-local implementation in `users.controller.ts`, and make the Mongo range mapper consume the same ordered thresholds.

- [ ] **Step 6: Add legacy characterization before extraction**

Drive the current `getUsers` handler with mocked Mongoose models and prove:

- no `productId` returns flattened rows and old pagination fields;
- `limit=10000` clamps to `100`;
- any present `topPercentage` applies score `>=77`;
- benign unknown query fields are ignored;
- valid `productId` returns grouped users with `{ pagination: { total } }` and ignores other filters;
- response rows always contain `products: []` compatibility where applicable.

The tests must pass against the current handler before Task 3 changes it.

- [ ] **Step 7: Run focused GREEN and commit**

```powershell
npx jest --ci tests/security/usersV2ListInput.test.ts tests/services/users/usersV2Enrollment.domain.test.ts tests/controllers/usersV2Legacy.characterization.test.ts
npm run lint
npm run types:check
```

Commit:

```powershell
git add src/security/usersV2ListInput.ts src/services/users/usersV2Enrollment.contract.ts src/services/users/usersV2Enrollment.domain.ts src/controllers/users.controller.ts tests/security/usersV2ListInput.test.ts tests/services/users/usersV2Enrollment.domain.test.ts tests/controllers/usersV2Legacy.characterization.test.ts
git commit -m "feat(users): define v2 list contracts"
```

### Task 2: Build the canonical enrollment service and bounded reader

**Files:**
- Create: `src/services/users/usersV2Enrollment.service.ts`
- Create: `src/services/users/mongooseUsersV2Enrollment.reader.ts`
- Create: `tests/services/users/usersV2Enrollment.service.test.ts`
- Create: `tests/services/users/mongooseUsersV2Enrollment.reader.test.ts`

**Interfaces:**
- Consumes: Task 1 contracts and shared engagement classifier.
- Produces:

```ts
interface UsersV2EnrollmentReader {
  read(filters: UsersV2EnrollmentFilters): Promise<{
    totalUsers: number
    rows: UsersV2EnrollmentRow[]
  }>
}

class UsersV2EnrollmentService {
  constructor(private readonly reader: UsersV2EnrollmentReader) {}
  list(filters: UsersV2EnrollmentFilters): Promise<UsersV2EnrollmentListResponse>
}
```

- [ ] **Step 1: Write service RED tests**

Use a fake reader. Assert the stable envelope, `totalPages`, `unit: 'users'`, `returnedRows`, echoed canonical filters, empty result, and a page with two enrollment rows for one user while `limit` is one.

- [ ] **Step 2: Run RED and implement the pure service**

```powershell
npx jest --ci tests/services/users/usersV2Enrollment.service.test.ts
```

Expected: missing service. Implement only response arithmetic and mapping; no Mongoose imports.

- [ ] **Step 3: Write MongoMemory RED fixtures**

Seed at least:

- one canonical user with two matching enrollments;
- one user with no enrollment;
- one soft-deleted user with an enrollment;
- users whose names/emails prove escaped literal search (`a+b`);
- product, platform, every status, progress boundary and engagement boundary rows;
- a missing product reference;
- equal filter matches inserted in reverse `_id` order.

Assert:

- users without a matching enrollment never enter `totalUsers`;
- search and soft-delete happen before paging;
- stable user `_id` order and enrollment `_id` tie-break;
- `enrolledAfter` reads `UserProduct.enrolledAt`;
- `ACTIVE` additionally requires `User.combined.status=ACTIVE`;
- `lastAccessBefore` includes missing/null `lastAction`;
- missing product retains its ObjectId;
- average engagement uses only filtered rows and non-finite/missing values contribute zero;
- `engagementLevel` uses score ranges, never the phantom field;
- query count is exactly one aggregate and independent of row count;
- pipeline contains no `$function`, `$where`, `$out`, `$merge` or unbounded option.

- [ ] **Step 4: Run reader RED**

```powershell
npx jest --ci tests/services/users/mongooseUsersV2Enrollment.reader.test.ts
```

Expected: missing reader.

- [ ] **Step 5: Implement one aggregation**

Use one `UserProduct.aggregate()` pipeline:

```ts
[
  { $match: enrollmentMatch },
  { $lookup: { from: User.collection.name, localField: 'userId', foreignField: '_id', pipeline: [userProjection], as: 'user' } },
  { $unwind: '$user' },
  { $match: userSearchAndDeletionMatch },
  { $sort: { userId: 1, _id: 1 } },
  { $group: {
      _id: '$userId',
      user: { $first: '$user' },
      rows: { $push: projectedEnrollment },
      averageEngagement: { $avg: normalizedEngagement },
  } },
  { $sort: { _id: 1 } },
  { $facet: {
      total: [{ $count: 'count' }],
      page: [{ $skip: skip }, { $limit: limit }],
  } },
  // unwind only the selected page, lookup projected products once,
  // restore user order, then enrollment _id order, and return one result.
]
```

Build match objects from typed helpers. Escape search with a tested `escapeRegExpLiteral()`. Apply `.option({ maxTimeMS: 120_000, allowDiskUse: false })`. Do not call `find`, `populate`, or another aggregate.

- [ ] **Step 6: Run GREEN, prune suppressions and commit**

```powershell
npx jest --ci tests/services/users/usersV2Enrollment.service.test.ts tests/services/users/mongooseUsersV2Enrollment.reader.test.ts
npm run lint:baseline:prune
npm run lint
npm run types:check
```

Commit:

```powershell
git add src/services/users/usersV2Enrollment.service.ts src/services/users/mongooseUsersV2Enrollment.reader.ts tests/services/users/usersV2Enrollment.service.test.ts tests/services/users/mongooseUsersV2Enrollment.reader.test.ts eslint-suppressions.json
git commit -m "feat(users): add v2 enrollment reader"
```

### Task 3: Replace the legacy monolith with a typed compatibility adapter

**Files:**
- Create: `src/services/users/usersV2Legacy.service.ts`
- Create: `tests/services/users/usersV2Legacy.service.test.ts`
- Modify: `src/services/userProducts/userProductService.ts:389-430`
- Modify: `src/controllers/users.controller.ts:2113-2464`
- Modify: `src/contracts/usersV2.ts`
- Modify: `tests/controllers/usersV2Legacy.characterization.test.ts`

**Interfaces:**
- Consumes: `UsersV2EnrollmentService`.
- Produces:

```ts
class UsersV2LegacyService {
  constructor(
    private readonly enrollmentService: Pick<UsersV2EnrollmentService, 'list'>,
    private readonly groupedReader: LegacyUsersByProductReader,
  ) {}
  list(input: UsersV2LegacyQuery): Promise<UsersV2LegacyResponse>
}
```

- [ ] **Step 1: Write adapter RED tests**

Assert the exact two historical envelopes. Without product:

```ts
{
  success: true,
  data: rows,
  pagination: { total, totalPages, page, limit },
  filters: legacyFilters,
}
```

With product:

```ts
{
  success: true,
  data: groupedUsers,
  pagination: { total: groupedUsers.length },
  filters: { productId },
}
```

Assert canonical delegation occurs once, benign unknowns are absent from the delegated input, old invalid optional filters are ignored, and hostile keys never reach the service.

- [ ] **Step 2: Run RED and implement the pure adapter**

```powershell
npx jest --ci tests/services/users/usersV2Legacy.service.test.ts
```

Expected: missing service.

- [ ] **Step 3: Type the grouped reader without casts**

Replace `Map<string, any>` and `as any[]` in `getUsersForProduct()` with named lean user/product/enrollment types. Preserve query count, projections and `products: []` normalization. Add a focused test proving missing/null products normalize safely.

- [ ] **Step 4: Replace `getUsers` with injected delegation**

Move the handler to `usersV2List.controller.ts` in Task 5; for this task, reduce `getUsers` to a temporary call through the new legacy service so characterization remains green. Delete now-orphaned local interfaces and Mongo query logic from `users.controller.ts`. Negative scan must show no duplicate implementation of the enrollment match/pagination pipeline.

- [ ] **Step 5: Run characterization GREEN and commit**

```powershell
npx jest --ci tests/services/users/usersV2Legacy.service.test.ts tests/controllers/usersV2Legacy.characterization.test.ts tests/contracts/usersV2.test.ts
npm run lint:baseline:prune
npm run lint
npm run types:check
```

Commit:

```powershell
git add src/services/users/usersV2Legacy.service.ts src/services/userProducts/userProductService.ts src/controllers/users.controller.ts src/contracts/usersV2.ts tests/services/users/usersV2Legacy.service.test.ts tests/controllers/usersV2Legacy.characterization.test.ts tests/contracts/usersV2.test.ts eslint-suppressions.json
git commit -m "refactor(users): isolate v2 legacy adapter"
```

### Task 4: Build complete server-side Users V2 analytics

**Files:**
- Create: `src/services/users/usersV2OverviewAnalytics.service.ts`
- Create: `src/services/users/mongooseUsersV2OverviewAnalytics.reader.ts`
- Create: `tests/services/users/usersV2OverviewAnalytics.service.test.ts`
- Create: `tests/services/users/mongooseUsersV2OverviewAnalytics.reader.test.ts`

**Interfaces:**
- Produces:

```ts
interface UsersV2OverviewAnalyticsSnapshot {
  overview: {
    totalUsers: number
    totalActiveUsers: number
    totalProducts: number
    progressByUser: Array<{ userId: string; averageProgress: number }>
  }
  byPlatform: Array<{ platform: string; userCount: number }>
  byProduct: Array<{
    productId: string
    productName: string
    platform: string
    totalUsers: number
    activeUsers: number
    progressSum: number
    progressCount: number
  }>
}
```

- [ ] **Step 1: Write pure-service RED tests**

Prove zero result, equal-user-weight overview progress, finite/clamped product progress, distinct counts, finite percentages/rates, and deterministic product/platform ordering.

- [ ] **Step 2: Run RED and implement service**

```powershell
npx jest --ci tests/services/users/usersV2OverviewAnalytics.service.test.ts
```

Expected: missing service.

- [ ] **Step 3: Write MongoMemory RED tests**

Seed multi-product and multi-platform users, uppercase active/inactive enrollments, deleted users, missing products, and progress encoded as number, Decimal128, Long, numeric string, object, `NaN` and infinity. Prove:

- distinct-user overview/platform/product counts;
- active means `UserProduct.status === 'ACTIVE'` without the canonical combined-status guard;
- deleted users are excluded;
- an enrollment whose product lookup is missing still contributes to user and
  platform totals but not to `totalProducts` or `byProduct`;
- one aggregate only, projected lookups, no fallback query;
- zero output for an empty database;
- stable ordering and `maxTimeMS=120_000`.

- [ ] **Step 4: Implement the aggregate reader**

Use one projected `UserProduct.aggregate()` with a narrow user-deletion lookup, narrow product lookup, safe `$convert` numeric normalization and `$facet` branches for overview, platform and product results. The reader returns a typed zero snapshot when the aggregate yields no row.

- [ ] **Step 5: Run GREEN and commit**

```powershell
npx jest --ci tests/services/users/usersV2OverviewAnalytics.service.test.ts tests/services/users/mongooseUsersV2OverviewAnalytics.reader.test.ts
npm run lint
npm run types:check
```

Commit:

```powershell
git add src/services/users/usersV2OverviewAnalytics.service.ts src/services/users/mongooseUsersV2OverviewAnalytics.reader.ts tests/services/users/usersV2OverviewAnalytics.service.test.ts tests/services/users/mongooseUsersV2OverviewAnalytics.reader.test.ts
git commit -m "feat(users): add v2 overview analytics"
```

### Task 5: Wire controllers, runtimes, routes and catalog-driven deprecation

**Files:**
- Create: `src/controllers/users/usersV2List.controller.ts`
- Create: `src/services/users/usersV2List.runtime.ts`
- Create: `tests/controllers/usersV2List.controller.test.ts`
- Modify: `src/routes/users.routes.ts`
- Modify: `src/observability/routeUsageInstrumentation.ts`
- Modify: `src/security/route-catalog.json`
- Modify: `src/security/route-manifest.json`
- Modify: `tests/routes/usersV2Analytics.routes.test.ts`
- Modify: `tests/security/routeUsageInstrumentation.test.ts`
- Modify: `tests/security/routeCatalog.test.ts`
- Modify: `tests/security/defaultDenyAuth.test.ts`

**Interfaces:**
- Routes:
  - `GET /api/users/v2/enrollments`
  - `GET /api/users/v2/analytics`
  - legacy `GET /api/users/v2`

- [ ] **Step 1: Write controller/route RED tests**

Assert strict 400 before runtime, 200 exact envelopes, stable `HttpError` codes:

```ts
USERS_V2_ENROLLMENTS_FAILED
USERS_V2_ANALYTICS_FAILED
USERS_V2_LEGACY_FAILED
```

Assert dependency details only enter one redacted error log event, correlation ID is returned, and importing runtime does not connect/query.

- [ ] **Step 2: Write deprecation RED tests**

Extend catalog entry shape with:

```json
{
  "deprecated": true,
  "deprecatedReason": "Polymorphic Users V2 contract; use explicit resources",
  "successorLinks": [
    "</api/users/v2/enrollments>; rel=\"successor-version\"",
    "</api/users/v2/analytics>; rel=\"alternate\""
  ]
}
```

Assert instrumentation emits `Deprecation: true` and two `Link` header values from the catalog only, emits no `Sunset`, and never includes request input.

- [ ] **Step 3: Run RED**

```powershell
npx jest --ci tests/controllers/usersV2List.controller.test.ts tests/routes/usersV2Analytics.routes.test.ts tests/security/routeUsageInstrumentation.test.ts tests/security/routeCatalog.test.ts tests/security/defaultDenyAuth.test.ts
```

Expected: new routes/controllers/catalog assertions fail.

- [ ] **Step 4: Implement composition and route order**

Create injected controllers, compose readers/services once in the runtime, and register the two static routes immediately after `/v2` and before any parameter route. Wrap every route with its matching input schema. The legacy route uses `usersV2LegacyInput` and the new injected legacy controller; remove `getUsers` from `users.controller.ts`.

- [ ] **Step 5: Update catalog and manifest**

Add the two authenticated entries with exact evidence lines. Update expected invariants:

```text
catalog = manifest = 439
authenticated = 434
public = 2
signature = 3
deprecated = 19
```

Prove the original 18 deprecated routes are exactly cron-tags and the only additional one is `/api/users/v2`.
Because inserting routes shifts source lines, update every catalog evidence
entry backed by `src/routes/users.routes.ts`, not only the three Users V2
entries.

- [ ] **Step 6: Run GREEN and commit**

```powershell
npx jest --ci tests/controllers/usersV2List.controller.test.ts tests/routes/usersV2Analytics.routes.test.ts tests/security/routeUsageInstrumentation.test.ts tests/security/routeCatalog.test.ts tests/security/defaultDenyAuth.test.ts
npm run lint:baseline:prune
npm run lint
npm run types:check
npm run build
```

Commit:

```powershell
git add src/controllers/users/usersV2List.controller.ts src/services/users/usersV2List.runtime.ts src/routes/users.routes.ts src/controllers/users.controller.ts src/observability/routeUsageInstrumentation.ts src/security/route-catalog.json src/security/route-manifest.json tests/controllers/usersV2List.controller.test.ts tests/routes/usersV2Analytics.routes.test.ts tests/security/routeUsageInstrumentation.test.ts tests/security/routeCatalog.test.ts tests/security/defaultDenyAuth.test.ts eslint-suppressions.json
git commit -m "feat(users): expose explicit v2 resources"
```

### Task 6: Prove query plans and make only evidenced index changes

**Files:**
- Create: `tests/services/users/mongooseUsersV2Enrollment.explain.test.ts`
- Create: `docs/architecture/users-v2-query-plans.md`
- Modify if evidence requires: `src/models/UserProduct.ts`
- Modify if evidence requires: `src/models/user.ts`

**Interfaces:**
- Consumes the exact Task 2 pipeline builder exported for test-only plan inspection without executing external services.

- [ ] **Step 1: Write representative explain tests**

Seed at least 1,000 UserProducts where each selective case matches at most 10%:

- `productId + status`;
- `platform + status`;
- `engagementScore` range;
- `progress.percentage` range;
- default listing.

Call `aggregate(pipeline).explain('executionStats')`. Record winning stages, `totalKeysExamined`, `totalDocsExamined`, `nReturned`, and whether a sort spills.

- [ ] **Step 2: Run the evidence test before index changes**

```powershell
npx jest --ci tests/services/users/mongooseUsersV2Enrollment.explain.test.ts
```

Expected: the test writes no file and fails only assertions tied to a demonstrably inefficient selective plan; default listing may be linear because it intentionally enumerates the resource.

- [ ] **Step 3: Add the smallest proven indexes**

For each failing selective shape, add only the compound prefix that the explain output proves useful. Re-run explain and require:

- winning plan uses an index for selective equality prefixes;
- any blocking sort stays below the in-memory limit and reports no spill;
- examined documents are no more than ten times matched documents in the seeded selective cases;
- no disk spill;
- default and substring-search exceptions are documented as bounded scans with `maxTimeMS`.

Do not create every possible filter combination.

- [ ] **Step 4: Document evidence and commit**

The document contains fixture size, exact query shape, before/after winning stage, examined ratios, chosen index, rejected index alternatives, and the normalized-search migration trigger.

```powershell
npx jest --ci tests/services/users/mongooseUsersV2Enrollment.explain.test.ts tests/services/users/mongooseUsersV2Enrollment.reader.test.ts
npm run lint
npm run types:check
git add tests/services/users/mongooseUsersV2Enrollment.explain.test.ts docs/architecture/users-v2-query-plans.md src/models/UserProduct.ts src/models/user.ts
git commit -m "perf(users): prove v2 query plans"
```

If no model change is justified, omit model files and state “no index change” in the commit body with the explain evidence.

### Task 7: Add the shared Front boundary and migrate Dashboard and ActiveCampaign

**Files:**
- Create: `Front/src/features/users-v2/usersV2.schemas.ts`
- Create: `Front/src/features/users-v2/usersV2.types.ts`
- Create: `Front/src/features/users-v2/usersV2.api.ts`
- Create: `Front/src/features/users-v2/__tests__/usersV2.api.test.ts`
- Modify: `Front/src/pages/dashboard/DashboardMainPage.tsx`
- Modify: `Front/src/pages/dashboard/__tests__/DashboardMainPage.test.tsx`
- Modify: `Front/src/components/dashboard/QuickFilters.tsx`
- Modify: `Front/src/components/dashboard/__tests__/dashboardPrimitives.test.tsx`
- Modify: `Front/src/types/dashboardTypes.ts`
- Modify: `Front/src/features/activecampaign/activecampaign.api.ts`
- Modify: `Front/src/features/activecampaign/activecampaign.schemas.ts`
- Modify: `Front/src/features/activecampaign/__tests__/activecampaign.api.test.ts`

**Interfaces:**
- Produces:

```ts
listUsersV2Enrollments(filters: UsersV2EnrollmentFilters): Promise<UsersV2EnrollmentEnvelope>
getUsersV2OverviewAnalytics(): Promise<UsersV2AnalyticsData>
```

- [ ] **Step 1: Write boundary RED tests**

Assert valid envelopes parse and these fail closed:

- missing `pagination.unit`;
- `products[]` grouped rows sent to enrollment boundary;
- non-array `data`;
- non-finite analytics numbers;
- analytics product/platform row missing a required field.

All HTTP responses enter schemas as `unknown`; no generic Axios cast is trusted.

- [ ] **Step 2: Implement schemas/types/API and run GREEN**

Use strict Zod objects for the new stable envelopes. Infer exported types with `z.infer`. `usersV2.api.ts` calls only:

```ts
httpClient.get('/users/v2/enrollments', { params: filters })
httpClient.get('/users/v2/analytics')
```

Run:

```powershell
yarn.cmd test --runInBand src/features/users-v2/__tests__/usersV2.api.test.ts
```

- [ ] **Step 3: Write Dashboard/QuickFilter RED tests**

Assert Dashboard requests `/users/v2/enrollments`, sends `minEngagement=77`, never sends `topPercentage`, preserves every other filter and page/limit, reads `pagination.total/totalPages`, and the button text is exactly `Engagement >= 77`.

- [ ] **Step 4: Migrate Dashboard**

Replace raw URL construction with `listUsersV2Enrollments()`. Rename `FiltersState.topPercentage` to `minEngagement`. Preserve loading, error, empty, page and rendered student behavior.

- [ ] **Step 5: Write and implement ActiveCampaign migration**

RED first: embedded search calls `/users/v2/enrollments` with `{ search: email, limit: 1 }`, parses through the shared enrollment schema, and extracts the same flattened `userId`. Core mode behavior remains unchanged if it uses the email-specific path.

Remove the duplicate `userProductsEnvelopeSchema` only after all imports move to the shared schema.

- [ ] **Step 6: Run Front focused gates and commit in Front**

```powershell
yarn.cmd format:check
yarn.cmd lint
yarn.cmd test --runInBand src/features/users-v2/__tests__/usersV2.api.test.ts src/pages/dashboard/__tests__/DashboardMainPage.test.tsx src/components/dashboard/__tests__/dashboardPrimitives.test.tsx src/features/activecampaign/__tests__/activecampaign.api.test.ts
yarn.cmd build
```

Commit from the Front repository:

```powershell
git add src/features/users-v2 src/pages/dashboard/DashboardMainPage.tsx src/pages/dashboard/__tests__/DashboardMainPage.test.tsx src/components/dashboard/QuickFilters.tsx src/components/dashboard/__tests__/dashboardPrimitives.test.tsx src/types/dashboardTypes.ts src/features/activecampaign/activecampaign.api.ts src/features/activecampaign/activecampaign.schemas.ts src/features/activecampaign/__tests__/activecampaign.api.test.ts
git commit -m "feat(users): consume v2 enrollments"
```

### Task 8: Migrate Analytics to complete server aggregates and remove proven dead surfaces

**Files:**
- Create: `Front/src/features/users-v2/useUsersV2Analytics.ts`
- Create: `Front/src/features/users-v2/__tests__/useUsersV2Analytics.test.tsx`
- Modify: `Front/src/pages/analytics/AnalyticsPage.tsx`
- Modify: `Front/src/pages/analytics/__tests__/AnalyticsPage.test.tsx`
- Delete only after negative proof:
  - `Front/src/pages/__test__/HooksTest.page.tsx`
  - obsolete exports in `Front/src/hooks/useUsersV2.ts`
  - obsolete methods in `Front/src/services/usersV2.service.ts`
  - obsolete tests dedicated only to deleted exports
  - client aggregation helpers in `Front/src/features/analytics/analyticsDashboard.domain.ts`

**Interfaces:**
- Consumes `getUsersV2OverviewAnalytics()` from Task 7.

- [ ] **Step 1: Write hook and page RED tests**

Prove one analytics request, loading/error/refetch behavior, and rendering from:

```ts
{
  overview: { totalUsers: 3, totalActiveUsers: 2, totalProducts: 2, avgProgress: 55 },
  byPlatform: [{ platform: 'hotmart', userCount: 3, percentage: 100 }],
  byProduct: [{
    productId: 'p1',
    productName: 'Product One',
    platform: 'hotmart',
    totalUsers: 3,
    activeUsers: 2,
    avgProgress: 55,
    activeRate: 66.7,
  }],
}
```

Assert the page does not call `useUsersV2`, does not inspect `products[]`, does not lowercase-check status, and does not aggregate only a page.

- [ ] **Step 2: Implement hook and page migration**

Replace the client user aggregation with analytics data. Keep `useDashboardV2` only for independently used sales/product controls until a separate contract replaces it. Refresh triggers both still-live resources.

- [ ] **Step 3: Prove dead code before deleting**

Run all-import-form scans:

```powershell
rg -n "HooksTest|useUsersV2|useUsersByProduct|useUsersByProductV2|getUsersByProduct|getUsers\(" src
rg -n "getProductMetrics|getPlatformDistribution|getEngagementByProduct" src
```

Inspect route registration and dynamic imports. Delete only symbols/files with no production consumer; update or delete tests that existed solely to cover dead code. Keep `useUserV2`, `useUsersStats`, detail methods and domain helpers that still have a live consumer.

- [ ] **Step 4: Run negative scans and focused GREEN**

```powershell
rg -n '/users/v2([?]|$)' src
rg -n 'status ===.*active' src/pages/analytics src/features/users-v2
yarn.cmd format:check
yarn.cmd lint
yarn.cmd test --runInBand src/features/users-v2/__tests__/useUsersV2Analytics.test.tsx src/pages/analytics/__tests__/AnalyticsPage.test.tsx
yarn.cmd build
```

The first scan may find transport-contract fixtures and the compatibility manifest; every production consumer must point to an explicit successor.

- [ ] **Step 5: Commit in Front**

```powershell
git add -A src/features/users-v2 src/pages/analytics src/hooks/useUsersV2.ts src/services/usersV2.service.ts src/pages/__test__/HooksTest.page.tsx src/features/analytics/analyticsDashboard.domain.ts src/hooks/__tests__ src/services/__tests__ src/components/__tests__
git commit -m "refactor(analytics): use users v2 aggregates"
```

Before committing, inspect `git diff --cached --name-status` and unstage any live surface not proven dead.

### Task 9: Close cross-repository contracts, documentation and full offline gates

**Files:**
- Modify: `docs/HARDENING-WORKPLAN.md`
- Modify if generated by reviewer workflow: `Front/src/contracts/route-manifest.json`
- Modify: `Front/src/__tests__/transportContract.test.ts`
- Create: `.superpowers/sdd/2026-07-30-users-v2-contract-split/final-evidence.md` (git-ignored evidence only)

**Interfaces:**
- Consumes both completed repositories.

- [ ] **Step 1: Add contract RED**

The Front contract must fail against the old 437 manifest and pass only when both new authenticated routes are present and the legacy route remains:

```text
GET /api/users/v2
GET /api/users/v2/enrollments
GET /api/users/v2/analytics
```

- [ ] **Step 2: Regenerate/align manifest and run contract GREEN**

Use the repository's existing manifest workflow; do not hand-invent route IDs. Assert `439/439`, authenticated `434`, deprecated `19`.

- [ ] **Step 3: Update the workplan**

Record:

- exact backend and Front commits;
- legacy observation/removal trigger;
- query-plan evidence and any index decision;
- consumer negative-scan results;
- no deployment performed;
- the still-open production observation step.

- [ ] **Step 4: Run complete backend sandbox gates**

```powershell
npm run lint
npm run types:check
npx jest --ci
npm run build
```

Record exact suites/tests/skips and any pre-existing warnings. The egress guard and Mongo sentinel remain active. Never run integration scripts from `package.json`.

- [ ] **Step 5: Run complete Front sandbox gates**

```powershell
yarn.cmd format:check
yarn.cmd lint
yarn.cmd test --runInBand
yarn.cmd build
yarn.cmd test:e2e
```

Run Playwright once, serially. If the sandbox lacks a browser, record the exact failure and do not download one.

- [ ] **Step 6: Run final negative and diff checks**

In both repositories:

```powershell
git diff --check
git status -sb
```

Also prove:

- no production Front call remains to polymorphic `/users/v2`;
- no duplicate enrollment query implementation remains;
- no `any`, new suppressions, raw user regex, `populate`, N+1 loop or PII log entered the slice;
- no lockfile changed;
- no real integration or production database was contacted.

- [ ] **Step 7: Commit documentation only in BO2_API**

```powershell
git add docs/HARDENING-WORKPLAN.md
git commit -m "docs(users): close v2 contract split"
```

Do not push either repository unless the user gives explicit current authorization.

## Final Review Gate

After Tasks 1-9, dispatch one independent whole-branch reviewer with both repository ranges, the design, this plan, the SDD ledger and final evidence. Critical or Important findings enter one coordinated fix wave and one scoped re-review. The work is code-complete only when that review is clean; it is operationally closed only after coordinated deployment and the legacy observation trigger.
