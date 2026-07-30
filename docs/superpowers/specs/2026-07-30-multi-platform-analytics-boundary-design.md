# Multi-Platform Analytics Boundary Design

**Date:** 2026-07-30
**Status:** approved design, pending implementation plan
**Scope:** `GET /api/analytics/multi-platform`

## 1. Objective

Replace the final handler in `src/controllers/analytics.controller.ts` with a
strict vertical slice that preserves the existing HTTP contract while reducing
the request from five `countDocuments` calls plus two full user scans to one
Mongo aggregation.

After the route is rewired, `analytics.controller.ts` must be deleted if a
negative reference scan proves it has no remaining live consumer.

This lot is offline-only. It may use mocks and MongoMemoryServer, but never
Guru, Hotmart, ActiveCampaign, CursEduca, Discord, or production Mongo.

## 2. Current facts

- The route is authenticated by the catalog-derived default-deny guard.
- The Front has no component, wrapper, or hook for this route. Its catalog
  consumer remains `desconhecido`; absence of a Front consumer is not proof that
  the route is dead.
- The response contains total/active/inactive counts, platform counts,
  multi-platform count, engagement statistics, and three insight strings.
- Canonical and legacy platform identifiers are both part of the current
  behavior.
- The current handler delegates engagement statistics to a second service that
  performs another full user scan.
- The handler logs to `console`, exposes `error.message`, contains an explicit
  `any`, and has no strict request boundary.
- `getEngagementStatsByPlatform` remains used by the Products domain. Removing
  or rewriting that consumer is outside this lot.

## 3. Approaches considered

### 3.1 Minimal extraction

Move the existing code to new files while preserving five counts and two full
scans. This reduces controller size but keeps the scalability and error-boundary
defects. Rejected as cosmetic architecture.

### 3.2 One aggregation behind a strict vertical slice

Use one projected Mongo aggregation, a pure application service, a thin
controller, strict input validation, and runtime composition. Preserve the
route, envelope, compatibility fields, insight strings, and tie behavior.

Selected because it closes the controller cleanly and bounds database work
without expanding into Products.

### 3.3 Cross-domain engagement consolidation

Replace the shared Products engagement dependency in the same lot. This would
reduce duplication but expands the blast radius into another endpoint and
contract. Deferred to a separate reviewed slice.

## 4. Architecture

### 4.1 Strict input boundary

Create `src/security/multiPlatformAnalyticsInput.ts` with:

```ts
export const multiPlatformAnalyticsInput = validatedSchema({
  params: {},
  query: {},
  body: {},
})
```

`withValidatedInput` remains the single boundary. It must remove the offline
loopback marker before validation and reject unknown fields, Mongo operators,
dotted keys, and own `__proto__` keys.

### 4.2 Reader port and snapshot

Create `src/services/analytics/multiPlatformAnalytics.service.ts`.

The service depends on:

```ts
export interface MultiPlatformAnalyticsSnapshot {
  totalUsers: number
  activeUsers: number
  hotmartUsers: number
  curseducaUsers: number
  discordUsers: number
  multiPlatformUsers: number
  engagement: {
    hotmart: { total: number; sum: number }
    curseduca: { total: number; sum: number }
    combined: { total: number; sum: number }
  }
}

export interface MultiPlatformAnalyticsReader {
  read(): Promise<MultiPlatformAnalyticsSnapshot>
}
```

No Mongoose, Express, logger, or clock type crosses this port.

### 4.3 Mongoose aggregation

Create
`src/services/analytics/mongooseMultiPlatformAnalytics.reader.ts`.

`read()` makes exactly one `User.aggregate()` call. The pipeline:

1. excludes documents with `isDeleted: true` or `discord.isDeleted: true`;
2. projects boolean membership flags and numeric engagement candidates;
3. groups the complete result into one snapshot;
4. returns a typed zero snapshot when the aggregation yields no row.

No `find`, `countDocuments`, per-user query, or materialized user array is
allowed.

Platform membership preserves both representations:

- Hotmart: `hotmart.hotmartUserId` or top-level `hotmartUserId`;
- CursEduca: `curseduca.curseducaUserId` or top-level `curseducaUserId`;
- Discord: non-empty `discord.discordIds` or top-level `discordIds`.

`null` and empty string do not count as Hotmart/CursEduca identifiers. Empty
Discord arrays do not count. The aggregation must preserve meaningful legacy
IDs without treating absent values as memberships.

Active users preserve the current accepted states:

- `combined.status === "ACTIVE"`;
- top-level `status === "ACTIVE"`;
- top-level `status === "ativo"`.

Engagement preserves the current numerical behavior:

- Hotmart statistics include finite numeric, non-zero
  `hotmart.engagement.engagementScore` values.
- CursEduca statistics include finite numeric, non-zero
  `curseduca.engagement.alternativeEngagement` values.
- Combined engagement selects the first finite, non-zero numeric value from
  Hotmart, CursEduca, and the raw legacy top-level `engagement` field.
- Combined totals/sums include the selected value only when it is greater than
  zero, matching the current `finalEng > 0` guard.
- Objects, strings, `NaN`, and non-finite values never enter numeric sums.

The top-level `engagement` field is currently an object in the schema, but raw
legacy numeric documents may still exist. Tests must insert such fixtures
through `User.collection` so strict Mongoose casting cannot hide the
compatibility case.

### 4.4 Pure application service

`MultiPlatformAnalyticsService.get()` converts the snapshot into the existing
public data:

- `inactiveUsers = totalUsers - activeUsers`;
- averages are `sum / total`, or zero when total is zero;
- `platformDiversity` preserves the existing Portuguese string and one-decimal
  percentage;
- `mostPopular` preserves the current tie behavior:
  - Hotmart only when strictly greater than both alternatives;
  - otherwise CursEduca when strictly greater than Discord;
  - otherwise Discord;
- `bestEngagement` preserves the current tie behavior:
  - Hotmart only when its average is strictly greater;
  - otherwise CursEduca.

The service is deterministic, side-effect free apart from its injected reader,
and does not mutate the snapshot.

### 4.5 HTTP controller and runtime

Create
`src/controllers/analytics/multiPlatformAnalytics.controller.ts` with an
injected factory:

```ts
export function createMultiPlatformAnalyticsController(
  service: Pick<MultiPlatformAnalyticsService, 'get'>,
): ValidatedInputHandler<typeof multiPlatformAnalyticsInput>
```

Success preserves the exact existing envelope:

```ts
{
  success: true,
  totalUsers,
  activeUsers,
  inactiveUsers,
  platformStats,
  engagement,
  insights,
}
```

Unexpected errors become a typed `HttpError` with:

- status `500`;
- code `ANALYTICS_MULTI_PLATFORM_FAILED`;
- public message `Erro ao buscar analytics`;
- internal cause available only to the shared redacting error handler.

Create `src/services/analytics/multiPlatformAnalytics.runtime.ts` to compose the
reader, service, and controller. No import-time database query is allowed.

### 4.6 Route and legacy removal

Mount the runtime handler through:

```ts
withValidatedInput(
  multiPlatformAnalyticsInput,
  getMultiPlatformAnalytics,
)
```

Then prove, by negative reference scan, that
`src/controllers/analytics.controller.ts` and its object export are orphaned.
Delete the file and replace its route-test mock with the runtime boundary mock.

Remove `tests/controllers/analytics.controller.test.ts` only after equivalent
canonical/legacy, deletion, tie, envelope, and error coverage exists in the new
reader/service/controller tests.

The route manifest remains unchanged at 437 routes. Update every shifted
`analytics.routes.ts` evidence line in `route-catalog.json`; the target consumer
remains `desconhecido`.

`engagementService.ts` and its Products consumer remain intact.

## 5. Tests and mutation evidence

### 5.1 Reader integration

Use MongoMemoryServer offline with canonical, legacy, mixed-platform, deleted,
zero-score, raw numeric legacy engagement, and invalid object engagement
fixtures. Prove:

- exact snapshot counts and sums;
- both deletion flags;
- canonical and legacy IDs;
- zero and invalid numeric behavior;
- one `aggregate` call;
- zero `find`, `countDocuments`, and per-user queries.

### 5.2 Service characterization

Prove exact averages, empty snapshot behavior, Portuguese insight strings, and
all current tie branches. Include a zero-user snapshot.

### 5.3 Boundary and controller

Prove strict empty input, loopback-marker removal, hostile input rejection,
exact success envelope, central 500 envelope, correlation ID, and redacted
internal detail.

### 5.4 Route wiring

Prove the route invokes the extracted validated runtime and rejects extra query
or body fields before the handler.

### 5.5 Required mutations

Each mutation is applied separately, must produce RED, and is restored:

1. remove `discord.isDeleted` from the aggregation match;
2. remove a legacy platform-ID fallback;
3. replace strict `>` tie logic with `>=`;
4. add a second Mongo query;
5. expose the caught error message;
6. rewire the route to the deleted legacy handler.

## 6. Verification gates

Run fresh:

```powershell
npm.cmd run lint
npm.cmd run types:check
npx.cmd jest --ci --runInBand
npm.cmd run build
```

Then run the unchanged Front analytics contract tests, Front lint, and Front
build. No dependency installation or lockfile change is permitted.

Final checks must prove:

- no `analytics.controller.ts`;
- no orphan `analyticsController` export;
- no new `console`, `any`, assertion cast, non-null assertion, or ignored error;
- route catalog and manifest remain 437/437;
- BO2_API tracked worktree is clean;
- the Front retains only its pre-existing staged security hook;
- no push occurs without explicit authorization.

## 7. Out of scope

- Changing public tie semantics to an explicit `Empate`;
- activating role policy or changing authentication;
- modifying the Products engagement endpoint;
- unifying every response envelope;
- deploying or validating against production traffic;
- cleaning unrelated monoliths or existing logger debt.
