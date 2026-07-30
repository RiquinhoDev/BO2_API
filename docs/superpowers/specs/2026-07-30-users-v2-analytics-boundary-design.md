# Users V2 Analytics Boundary Design

**Date:** 2026-07-30
**Status:** approved design, pending implementation plan
**Scope:** `GET /api/users/v2/stats` and
`GET /api/users/v2/engagement/comparison`

## 1. Objective

Replace the two live inline handlers in `src/routes/users.routes.ts` with a
strict vertical slice that preserves their HTTP paths and response shapes while
removing database access, business rules, CommonJS `require`, `console`, and
explicit `any` from the router.

The implementation must also:

- replace the hardcoded dashboard health score with the canonical formula that
  already exists in `dashboardStatsBuilder.service.ts`;
- reduce product comparison from repeated product-by-enrollment filtering and
  a duplicate `UserProduct` scan to linear grouping over one projected
  enrollment read;
- keep the response compatible for consumers not represented in the Front;
- remain fully offline.

Guru, Hotmart, ActiveCampaign, CursEduca, Discord, production Mongo, deployment,
and production traffic are forbidden.

## 2. Current facts

- Both routes are authenticated by the catalog-derived default-deny guard.
- No Front component, hook, or service calls either route. The Front route
  contract records both paths, but absence of a Front caller is not proof that
  no external consumer exists.
- Both handlers are implemented directly in `users.routes.ts`.
- `/v2/stats` loads all active `UserProduct` documents and a second user list
  into memory.
- `/v2/engagement/comparison` loads every product, loads all active
  `UserProduct` documents, then `calculateBatchAverageEngagement` loads the
  active `UserProduct` set again.
- Product comparison filters the complete enrollment array once per product,
  making the grouping cost `O(products × enrollments)`.
- `healthScore: 75` and its breakdown are hardcoded even though the project
  already contains a real health formula.
- Product `trend` is always `0`. There is no historical data in this boundary
  from which a truthful trend can be derived.
- The handlers contain runtime `require`, `console`, assertion casts, and
  explicit `any`.
- The neighboring `/v2/engagement/heatmap` fabricates scores with
  `Math.random()`. It is deliberately excluded from this extraction so a fake
  behavior is not promoted into the new architecture.

## 3. Approaches considered

### 3.1 Mechanical extraction

Move the existing handlers into controller files without changing their reads,
complexity, placeholders, or dynamic types.

Rejected because it would make the router shorter while preserving the
scalability and data-integrity defects.

### 3.2 Strict vertical slice with bounded reads

Use strict request schemas, injected controllers, pure application services,
typed Mongo readers, one stats aggregation, and one projected enrollment read
for product comparison. Extract the existing health formula and engagement
normalization into shared pure helpers instead of duplicating either rule.

Selected because it improves architecture, truthfulness, and database cost
without changing the public paths or envelopes.

### 3.3 Historical analytics redesign

Create time-series snapshots and redesign comparison trends and the heatmap.

Rejected for this lot because no such historical source currently exists. It
would require a new persistence model, retention policy, backfill decision, and
Front contract.

## 4. Architecture

### 4.1 Strict request boundaries

Create `src/security/usersV2AnalyticsInput.ts` with two independently named
schemas:

```ts
export const usersV2StatsInput = validatedSchema({
  params: {},
  query: {},
  body: {},
})

export const usersV2ComparisonInput = validatedSchema({
  params: {},
  query: {},
  body: {},
})
```

`withValidatedInput` remains the only request boundary. It removes the offline
loopback marker before validation and rejects every other param, query, or body
field, including dotted keys, Mongo operators, constructor/prototype keys, and
own `__proto__` keys.

Separate schemas prevent future query parameters for one endpoint from
silently becoming valid on the other.

### 4.2 Ports and snapshots

Create `src/services/users/usersV2Analytics.service.ts`.

The application service depends on narrow ports, not Mongoose or Express:

```ts
export interface UsersV2StatsReader {
  read(now: Date): Promise<UsersV2StatsSnapshot>
}

export interface UsersV2ComparisonReader {
  read(): Promise<UsersV2ComparisonSnapshot>
}

export interface Clock {
  now(): Date
}
```

The stats snapshot contains only the values required to build the existing
response:

- active enrollment count;
- engagement and progress sums/counts;
- at-risk enrollment count;
- enrollments whose users meet the existing 30-day inactivity rule;
- enrollments created in the last seven days;
- distinct active product count;
- active enrollment counts grouped by platform.

The comparison snapshot contains:

- projected products: `_id`, `name`, and `platform`;
- projected active enrollments: `userId`, `productId`, `platform`, and
  `engagement`.

No Mongoose document, query, Express request, logger, or unvalidated object
crosses these ports.

### 4.3 Stats aggregation

Create `src/services/users/mongooseUsersV2Stats.reader.ts`.

`read(now)` performs exactly one `UserProduct.aggregate()` call:

1. match `status: "ACTIVE"` using the existing status index;
2. project only `userId`, `productId`, `platform`, `enrolledAt`,
   `engagement.engagementScore`, and `progress.percentage`, explicitly
   excluding the implicitly included `_id`;
3. look up only the user activity fields required by the existing inactivity
   rule;
4. use a facet/group pipeline to compute all scalar and platform values;
5. normalize an empty aggregation to a typed zero snapshot.

The reader must preserve current counting semantics:

- `totalStudents` remains the number of active `UserProduct` enrollments, not
  unique users;
- `atRisk` counts active enrollments whose engagement score defaults to zero
  and is at most 30;
- `inactive30d` counts active enrollments whose related user has
  `discord.engagement.lastMessageDate < now - 30 days`;
- users without that date do not enter `inactive30d`;
- `new7d` counts active enrollments with `enrolledAt >= now - 7 days`;
- `activeProducts` is the number of distinct active `productId` values;
- platform counts use `platform`, defaulting an absent value to `unknown`.

Numeric aggregation must accept BSON numeric values and reject strings,
objects, `NaN`, and infinities. Empty data must return zero percentages instead
of serializing `NaN` as `null`.

### 4.4 Canonical health calculation

Create a pure helper in `src/services/analytics/healthScore.ts` and migrate
`dashboardStatsBuilder.service.ts` to consume it in the same commit that adds
the new stats service.

The helper accepts:

- average engagement;
- active count;
- total count;
- new users/enrollments in seven days;
- average progress.

It returns:

```ts
{
  healthScore,
  healthLevel,
  healthBreakdown: {
    engagement,
    retention,
    growth,
    progress,
  },
}
```

It preserves the existing canonical formula:

```text
retention = min(100, round(active / total × 100))
growth = min(100, round(new7d / total × 1000))
score = round(
  engagement × 0.4 +
  retention × 0.3 +
  growth × 0.2 +
  progress × 0.1
)
```

Zero totals produce zero retention and growth. Levels preserve the existing
thresholds: `EXCELENTE`, `BOM`, `RAZOÁVEL`, and `CRÍTICO`.

For the compatibility endpoint, `activeCount` and `totalStudents` are both the
active enrollment count, so `activeRate` and retention remain 100 for a
non-empty set. This is intentionally not reinterpreted as a unique-user metric
inside an architectural extraction.

### 4.5 Shared engagement normalization

The existing engagement calculator owns the platform normalization rules but
implements them as private functions over `any`.

Extract those rules into a pure typed helper under
`src/services/syncUtilizadoresServices/engagement/`:

- input engagement is `unknown`;
- object and numeric fields are narrowed explicitly;
- Hotmart, CursEduca, Discord, unknown-platform, clamping, and activity-level
  behavior remain unchanged;
- the existing single-user and batch calculators consume the same helper;
- product comparison consumes the same helper.

This is a rule extraction, not a formula rewrite. Characterization tests must
lock every current branch before moving it.

### 4.6 Product comparison reader and service

Create `src/services/users/mongooseUsersV2Comparison.reader.ts`.

The reader performs two bounded, projected reads:

1. all products with `_id`, `name`, and `platform`;
2. active `UserProduct` enrollments with `userId`, `productId`, `platform`, and
   `engagement`.

It does not populate users because the current comparison uses only user IDs.
It does not call `calculateBatchAverageEngagement`, avoiding the second
enrollment scan.

The pure service:

1. groups enrollments by user in one pass;
2. calculates the same rounded normalized average engagement per user;
3. groups those user scores by product in one pass;
4. emits every product, including products with zero active enrollments;
5. calculates the existing `alto`, `medio`, `baixo`, and `risco` bands and
   percentages;
6. sorts by `totalStudents` descending, then `productId` ascending for a stable
   tie-break.

`trend` remains the literal value `0` for compatibility. The type must express
it as the sentinel `0`, and the design records that it means “historical trend
not available”, not a calculated observation. Inventing a trend is forbidden.

### 4.7 Controllers and runtime composition

Create `src/controllers/users/usersV2Analytics.controller.ts` with two injected
factories:

```ts
createUsersV2StatsController(service)
createUsersV2ComparisonController(service)
```

Success preserves the existing envelopes:

```ts
{ success: true, data: stats }
{ success: true, data: comparison }
```

Unexpected errors become typed `HttpError` instances:

- `USERS_V2_STATS_FAILED` / `Erro ao calcular stats`;
- `USERS_V2_COMPARISON_FAILED` /
  `Erro ao calcular comparação de engagement`.

Internal causes are visible only to the shared redacting error handler.

Create `src/services/users/usersV2Analytics.runtime.ts` to instantiate readers,
clock, services, and controllers. Importing the runtime must not execute a
query, connect to Mongo, start a job, or call an external API.

### 4.8 Route rewiring and cleanup

Replace both inline handlers with validated runtime handlers:

```ts
router.get(
  '/v2/stats',
  withValidatedInput(usersV2StatsInput, getUsersV2Stats),
)

router.get(
  '/v2/engagement/comparison',
  withValidatedInput(usersV2ComparisonInput, getUsersV2Comparison),
)
```

Delete the route-local types and imports that become orphaned only after a
negative reference scan proves they have no other consumer.

The route catalog and manifest remain unchanged at 437 routes. Evidence line
numbers for shifted routes must be regenerated or updated through the existing
catalog workflow.

## 5. Data flow

### 5.1 Stats

```text
HTTP GET
  -> default-deny authentication
  -> strict empty input boundary
  -> injected controller
  -> stats service + injected clock
  -> one Mongo aggregation
  -> canonical health helper
  -> existing response envelope
```

### 5.2 Comparison

```text
HTTP GET
  -> default-deny authentication
  -> strict empty input boundary
  -> injected controller
  -> comparison service
  -> projected product + enrollment reads
  -> shared engagement normalizer
  -> linear user/product grouping
  -> existing response envelope
```

## 6. Tests and negative evidence

### 6.1 Health and engagement pure helpers

Characterize the existing formulas before extraction, then prove:

- all health thresholds;
- zero-total behavior;
- finite/clamped output;
- Hotmart, CursEduca score, CursEduca alternative score, CursEduca activity
  level, Discord thresholds, and unknown platform;
- malformed or non-numeric engagement never contaminates a result.

### 6.2 Stats reader integration

Use MongoMemoryServer offline with active/inactive enrollments, multiple
products/platforms, missing activity dates, recent/old enrollments, numeric BSON
variants, and malformed raw values. Prove:

- exact snapshot values;
- the current enrollment-count semantics;
- boundary dates at exactly 7 and 30 days;
- one aggregate call and no `find`, `countDocuments`, or per-enrollment query;
- typed zero snapshot.

### 6.3 Comparison service and reader

Prove:

- all products remain present;
- users with multiple platforms receive the same normalized rounded score as
  the existing batch calculator;
- score bands and percentages;
- products with no enrollments;
- stable tie ordering;
- exactly one product read and one active-enrollment read;
- no populate and no duplicate enrollment scan;
- `trend` is exactly `0`.

### 6.4 Boundary, controller, and route

Prove:

- exact success envelopes;
- strict rejection of extra params, query, and body fields;
- loopback marker removal;
- hostile dotted/operator/prototype input rejection;
- central 500 envelope, correlation ID, and redacted internal error;
- each route invokes the corresponding extracted runtime;
- `users.routes.ts` contains no inline async handler for the two target paths.

### 6.5 Required mutation checks

Apply each mutation separately, require RED, and restore it:

1. make `totalStudents` unique by user;
2. treat a missing activity date as inactive;
3. remove the seven-day boundary inclusion;
4. restore hardcoded `healthScore: 75`;
5. call `calculateBatchAverageEngagement` from comparison;
6. replace linear grouping with a per-product enrollment filter;
7. accept an unknown query field;
8. expose a caught internal error message.

## 7. Verification gates

Run fresh in the sandbox:

```powershell
npm.cmd run lint
npm.cmd run types:check
npx.cmd jest --ci --runInBand
npm.cmd run build
```

Also run the focused unchanged Front contract tests that cover the backend route
manifest. No dependency installation or lockfile change is permitted.

Final checks must prove:

- branch is `remake`;
- no real integration or production Mongo was touched;
- both paths and envelopes remain present;
- route catalog and manifest remain 437/437;
- no new `console`, explicit `any`, assertion cast, non-null assertion,
  suppression, or ignored error;
- the targeted inline route handlers and their orphan types/imports are gone;
- heatmap behavior and route are byte-for-byte outside the implementation diff;
- tracked worktree is clean after the isolated commits;
- no push occurs without explicit authorization.

## 8. Out of scope

- `/api/users/v2/engagement/heatmap`;
- inventing or persisting historical trends;
- changing `totalStudents` from enrollments to unique users;
- changing authentication or role policy;
- changing the global response-envelope strategy;
- deploying or observing production traffic;
- unrelated `users.controller.ts` or `classes.controller.ts` decomposition;
- unrelated `no-explicit-any` debt.

## 9. Follow-up trigger

The heatmap must receive a separate product decision before migration:

- either add a real historical activity/engagement source and calculate it;
- or deprecate/remove the endpoint after production usage evidence.

The current random scores must never be copied into a new service.
