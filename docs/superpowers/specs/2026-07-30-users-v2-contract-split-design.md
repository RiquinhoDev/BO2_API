# Users V2 Contract Split Design

**Date:** 2026-07-30
**Status:** approved for implementation planning
**Repositories:** `BO2_API` and `Front`, branch `remake`

## 1. Context

`GET /api/users/v2` currently has two incompatible response contracts:

- without `productId`, it returns flattened `UserProduct` enrollment rows;
- with `productId`, it calls `getUsersForProduct()` and returns users with a
  nested `products[]` array.

This polymorphism is not declared at the HTTP boundary. Live consumers already
disagree about the shape:

- Dashboard and ActiveCampaign expect flattened enrollment rows;
- `usersV2Service` and `AnalyticsPage` expect users with `products[]`.

The mismatch causes real defects:

1. the product filter can replace Dashboard enrollment rows with user objects;
2. `AnalyticsPage` normalizes flattened rows to `products: []`, so product and
   progress metrics become empty or zero;
3. Analytics calculates from the first API page only, not the complete data
   set;
4. `status === "active"` in the Front does not match the persisted canonical
   value `ACTIVE`;
5. `engagementLevel` queries a field that is not stored in the `UserProduct`
   schema;
6. `enrolledAfter` is currently applied to `User.createdAt`, not
   `UserProduct.enrolledAt`;
7. product-filter pagination happens before user search, so totals and pages
   can disagree with the returned rows;
8. user IDs grouped without a stable sort can move between pages.

The previous Users V2 analytics extraction established reusable strict input,
controller, service, reader, runtime, error-handling and route-wiring patterns.
This design extends those patterns without reopening the stats, comparison or
heatmap implementations.

## 2. Goals

- Give every new endpoint exactly one stable response contract.
- Preserve all useful Dashboard and ActiveCampaign behaviors.
- Move Analytics calculations to a bounded server-side aggregation.
- Keep unknown external consumers of `/api/users/v2` working during an
  observable migration window.
- Remove redundant helpers, types, hooks and transformations once cross-repo
  negative-reference proof shows they are dead.
- Reduce `users.controller.ts` vertically by domain, not by copying its body.
- Use strict inputs, projected reads, deterministic ordering and central error
  handling.
- Keep all work offline: no real Guru, Hotmart, ActiveCampaign, CursEduca,
  Discord or production Mongo access.

## 3. Non-goals

- Do not modify the adjacent user-detail routes currently mounted as
  `/api/users/:id`, `/api/users/by-email/:email` and
  `/api/users/:userId/products`, or the Users V2 stats, comparison and heatmap
  behavior. The stale `/api/users/v2/...` comments above the detail handlers
  are documentation debt, not live routes.
- Do not define the removal date for the legacy route without traffic evidence.
- Do not introduce cursor pagination in this slice; the public contract keeps
  page/limit semantics.
- Do not redesign the Dashboard UI.
- Do not compute engagement trends; existing `trend: 0` remains outside this
  slice.
- Do not remove compatibility code that still has a proven consumer.

## 4. Chosen architecture

### 4.1 Explicit enrollment resource

Add:

```http
GET /api/users/v2/enrollments
```

This endpoint always returns flattened enrollment rows. It never changes shape
because a filter is present.

The implementation is split into:

- `usersV2EnrollmentListInput`: strict query schema;
- `UsersV2EnrollmentListService`: pure orchestration and response mapping;
- `MongooseUsersV2EnrollmentListReader`: projected, deterministic persistence
  adapter;
- injected controller with stable public errors;
- import-safe runtime composition.

No query logic remains in `users.controller.ts`.

### 4.2 Server-side analytics resource

Add:

```http
GET /api/users/v2/analytics
```

This endpoint returns complete Analytics-page aggregates. It uses one bounded
`UserProduct.aggregate()` pipeline with narrow user/product lookups and facets.
The browser does not fetch every user or calculate global metrics from a page.

The implementation is split into:

- an independent strict-empty input schema;
- pure analytics service;
- Mongoose aggregate reader;
- injected controller;
- import-safe runtime.

### 4.3 Legacy compatibility adapter

Keep:

```http
GET /api/users/v2
```

The route becomes a thin adapter:

- without `productId`, it delegates to the canonical enrollment use case;
- with `productId`, it preserves the historical grouped-user response through
  a typed legacy adapter;
- it contains no duplicated query or response-mapping implementation;
- it emits `Deprecation: true`;
- it emits `Link` headers naming both successor resources;
- it does not emit `Sunset` until an operational removal date is approved;
- usage is recorded through the existing route-template observability path,
  using the single shared redaction function.

The deletion trigger is explicit:

1. all first-party Front consumers have migrated;
2. the remake API is deployed;
3. the legacy route has an agreed observation window with no unexplained
   traffic;
4. route removal is coordinated with the route catalog and Front manifest.

Compatibility is characterized before extraction. In particular, the legacy
adapter retains its historical maximum `limit` of `100`, accepts
`topPercentage`, and preserves the grouped, unpaginated `productId` branch
instead of silently converting that branch to enrollment rows. Corrections to
search ordering, escaped matching, `enrolledAfter` and engagement filtering are
intentional bug fixes, but the legacy success envelope and branch-specific row
shapes remain unchanged. Hostile operator, dotted and prototype keys are never
retained for compatibility.

The legacy route has a dedicated translator rather than reusing the strict new
schema directly:

- it accepts the currently named fields and retains current defaulting and
  clamping behavior;
- it translates any present `topPercentage` to the historical fixed
  engagement threshold `77`;
- invalid optional legacy filters continue to be ignored where the existing
  handler ignores them;
- benign unknown keys remain ignored during the observation window;
- hostile operator, dotted and prototype keys are rejected before translation;
- with `productId`, non-product filters remain ignored because that is the
  characterized historical branch behavior.

Characterization tests lock each of these rules before the old handler is
replaced.

## 5. Enrollment input contract

The new endpoint accepts only:

| Field | Contract |
|---|---|
| `page` | positive integer, default `1` |
| `limit` | positive integer, default `50`, hard maximum `200` |
| `platform` | `hotmart`, `curseduca`, or `discord` |
| `productId` | 24-character hexadecimal Mongo ObjectId |
| `status` | `ACTIVE`, `INACTIVE`, `SUSPENDED`, `CANCELLED`, or `PARA_INATIVAR` |
| `search` | trimmed literal text, 1–200 characters |
| `progressLevel` | `MUITO_BAIXO`, `BAIXO`, `MEDIO`, `ALTO`, or `MUITO_ALTO` |
| `engagementLevel` | comma-separated values from `NONE`, `MUITO_BAIXO`, `BAIXO`, `MEDIO`, `ALTO`, `MUITO_ALTO` |
| `maxEngagement` | finite integer from `0` to `100` |
| `minEngagement` | finite integer from `0` to `100` |
| `lastAccessBefore` | valid ISO date-time |
| `enrolledAfter` | valid ISO date-time |

Unknown fields, dotted keys, Mongo operators and literal own `__proto__`,
`constructor` or `prototype` keys return `400` through the common validated
input boundary.

`topPercentage` is not part of the new contract. The current Front sends
`topPercentage=10`, while the backend ignores the number and applies a fixed
score threshold of 77. The Front will migrate that quick filter to the honest
and equivalent `minEngagement=77`, and the visible label changes from the false
`Top 10%` claim to `Engagement >= 77`. A UI characterization test locks the
label and request together. The legacy adapter continues accepting
`topPercentage` for compatibility.

When both engagement bounds are present, `minEngagement` must be less than or
equal to `maxEngagement`; contradictory bounds return `400`.

Search is escaped before constructing a case-insensitive regular expression.
Client input never becomes a raw regex.

## 6. Enrollment filtering and pagination semantics

- `productId`, `platform` and `status` filter `UserProduct`.
- `progressLevel` maps to score ranges:
  - `MUITO_BAIXO`: `0 <= progress < 25`;
  - `BAIXO`: `25 <= progress < 40`;
  - `MEDIO`: `40 <= progress < 60`;
  - `ALTO`: `60 <= progress < 80`;
  - `MUITO_ALTO`: `80 <= progress <= 100`.
- `engagementLevel` maps to the same `engagement.engagementScore` ranges used
  by the enrollment response:
  - `NONE`: `score <= 0`;
  - `MUITO_BAIXO`: `0 < score < 20`;
  - `BAIXO`: `20 <= score < 40`;
  - `MEDIO`: `40 <= score < 60`;
  - `ALTO`: `60 <= score < 80`;
  - `MUITO_ALTO`: `score >= 80`.
  It does not query the nonexistent `engagement.engagementLevel` field.
  One shared domain classifier defines these intervals and is consumed by both
  the Mongo filter builder and response mapping; route-local copies are
  removed. Other engagement classifiers with genuinely different domain
  semantics are not silently rewritten in this slice.
- `minEngagement` and `maxEngagement` apply to the stored numeric engagement
  score and may be combined.
- `enrolledAfter` applies to `UserProduct.enrolledAt`.
- `search` and soft-delete checks apply before pagination.
- `status=ACTIVE` preserves the current additional canonical-user guard:
  `User.combined.status` must also be `ACTIVE`.
- `lastAccessBefore` preserves the existing enrollment last-action semantics;
  missing or null `engagement.lastAction` also matches.

Pagination remains user-based to preserve Dashboard behavior:

1. form the complete filtered set of users having at least one matching
   `UserProduct`;
2. sort by user `_id` ascending;
3. count and page unique user IDs;
4. fetch only matching enrollment rows for those users;
5. restore page user order and use enrollment `_id` as the row tie-breaker.

The response makes that unit explicit:

```ts
interface UsersV2EnrollmentListResponse {
  success: true
  data: UsersV2EnrollmentRow[]
  pagination: {
    total: number
    totalPages: number
    page: number
    limit: number
    unit: 'users'
    returnedRows: number
  }
  filters: UsersV2EnrollmentFilters
}
```

`pagination.total` is the number of matching unique users having at least one
matching enrollment. Canonical users with zero `UserProduct` rows are never
counted by this enrollment resource. A page can contain more rows than `limit`
when one user has multiple matching enrollments; `returnedRows` makes this
explicit.

Each row preserves the current Dashboard/ActiveCampaign fields:

- enrollment `_id`;
- populated/projected `userId` with `_id`, name, email, average engagement and
  average engagement level;
- populated/projected `productId` with `_id`, name, code and platform;
- platform, status, enrolledAt and isPrimary;
- progress percentage, compatibility `progressPercentage`, lastActivity;
- engagement score, derived level and lastAction;
- root average engagement fields.

Average engagement is calculated over the enrollment rows included by the
active filters, preserving the current visible-page semantics. Missing or
non-finite scores contribute zero. Products missing from the product
collection retain the original product ID instead of dropping the row.

The reader must prove bounded query count independent of the number of users
and products. It may use a facet plus projected enrichment reads, but may not
use `populate`, per-user queries or per-product queries.

Bounded query count alone is insufficient. Before fixing the persistence
design, representative default, platform, product, status, score-range and
combined query shapes must be inspected with `explain("executionStats")`.
Index changes are selected from that evidence and added in the same backend
block with regression tests; no speculative family of indexes is created.
Execution evidence records winning stages and document/key examination ratios.
Aggregation work is bounded with `maxTimeMS`; disk spill is disabled by default
and may be enabled only for an evidenced pipeline with an explicit operational
limit. The unanchored literal substring search is a documented compatibility
exception that may scan: it remains escaped and time-bounded until a separately
planned normalized-search index or managed search migration can preserve its
semantics.

## 7. Analytics response contract

```ts
interface UsersV2AnalyticsResponse {
  success: true
  data: {
    overview: {
      totalUsers: number
      totalActiveUsers: number
      totalProducts: number
      avgProgress: number
    }
    byPlatform: Array<{
      platform: string
      userCount: number
      percentage: number
    }>
    byProduct: Array<{
      productId: string
      productName: string
      platform: string
      totalUsers: number
      activeUsers: number
      avgProgress: number
      activeRate: number
    }>
  }
}
```

Semantics:

- include users with at least one `UserProduct`;
- exclude users whose canonical soft-delete flag is true;
- `totalUsers` is the distinct user count;
- `totalActiveUsers` is the distinct user count with at least one
  `UserProduct.status === "ACTIVE"`;
- unlike `status=ACTIVE` in the enrollment listing, Analytics does not require
  `User.combined.status === "ACTIVE"` because its subject is active
  enrollments, not canonical-user state; the Front labels must not present the
  two values as the same metric;
- `totalProducts` is the distinct joined product count;
- overview `avgProgress` preserves equal user weighting: average each user's
  finite enrollment progress values, then average users;
- platform counts are distinct users per platform, so a multi-platform user
  may appear in more than one platform group;
- product counts are distinct users; the unique `(userId, productId)` index
  makes this equivalent to enrollment count for valid data;
- product `activeUsers` uses canonical uppercase `ACTIVE`;
- product average progress uses finite values clamped to `0..100`;
- percentages and averages are finite zeros for empty inputs;
- product rows sort by `totalUsers` descending, then `productId` ascending;
- platform rows sort by `userCount` descending, then platform ascending.

The aggregation:

1. projects only fields required from `UserProduct`;
2. looks up only the user deletion flag and drops deleted users;
3. looks up only product name/platform;
4. normalizes BSON numeric progress safely;
5. uses facets/groups for overview, platform and product data;
6. returns a typed zero result without fallback queries;
7. uses the project's bounded `maxTimeMS`.

No external service or network dependency participates.

## 8. Front migration

### Dashboard

- Replace `/users/v2` with `/users/v2/enrollments`.
- Replace `topPercentage=10` with `minEngagement=77`.
- Relabel the quick filter from `Top 10%` to `Engagement >= 77`; do not retain a
  percentile claim for a fixed threshold.
- Validate the response as `unknown` through a Zod schema.
- Preserve filters, page controls, empty/error states and rendered row shape.

### ActiveCampaign

- Replace `/users/v2` search with `/users/v2/enrollments`.
- Keep `search`, `limit=1` and the flattened `userId` extraction.
- Validate the response with the existing enrollment schema, strengthened only
  where runtime evidence supports it.

### Analytics

- Stop calling `usersV2Service.getUsers()` for global metrics.
- Load `/users/v2/analytics` through a Zod-validated service/hook.
- Render overview, product metrics and platform distribution from server
  aggregates.
- Remove client-side global aggregation helpers when negative-reference proof
  shows no remaining consumer.
- Remove `useUsersV2`, `getUsers`, `getUsersByProduct` and related test-only
  surfaces only after cross-repo proof that no production route/component uses
  them. A test page is not sufficient reason to retain a production data path;
  if `HooksTest.page.tsx` is unmounted and only imported by coverage tests, it
  and its dedicated tests are removed together.

Detail-user and stats methods that still have consumers stay in place.

## 9. Error handling and observability

- Controllers return stable public messages through `HttpError`.
- Dependency details appear only in the central redacted logger.
- Correlation IDs remain present in response headers and error envelopes.
- No controller logs raw queries, names, emails, IDs or URLs.
- Legacy usage records only a redacted route template and the successor
  resource names.
- The route catalog marks `/api/users/v2` deprecated with a reason and the
  approved successor links. Route instrumentation is extended to emit those
  `Link` values without raw user input; the catalog remains the single source
  of truth.
- Runtime imports must not connect to Mongo or execute a query.

## 10. Test strategy

### Characterization before extraction

Lock:

- the flattened no-`productId` response;
- the grouped legacy `productId` response;
- every currently used filter and empty response;
- user-based pagination and row enrichment;
- success envelopes and current public error behavior.

### Enrollment service and reader

Use pure service tests plus MongoMemoryServer with
`MONGOMS_RUNTIME_DOWNLOAD=false`. Prove:

- product filters never change the new endpoint shape;
- search is literal for `+`, `.`, `(` and `[` characters;
- search and product filters compose before count/pagination;
- stable pages have no duplicate or missing users;
- progress boundaries include exactly 100;
- engagement levels derive from scores;
- `enrolledAfter` uses the enrollment date;
- deleted users and inactive combined users under `status=ACTIVE` are excluded;
- product lookup misses preserve rows;
- all response numeric values are finite;
- query count is bounded and no `populate`/N+1 fallback exists.

Mutation tests must fail if:

1. pagination moves before search;
2. user ID sorting is removed;
3. `productId` reintroduces the grouped shape;
4. search is used as an unescaped regex;
5. `enrolledAfter` moves back to `User.createdAt`;
6. a per-user or per-product query is added.

### Analytics reader and service

Seed:

- users with multiple products and platforms;
- active, inactive and deleted users;
- product metadata;
- missing, Decimal128, Long, string, object, `NaN` and infinite progress;
- an empty database.

Prove exact unique-user, active, platform, product and equal-weight progress
semantics, deterministic order, one aggregate and no fallback query.

### HTTP and Front

Prove:

- strict rejection of unknown, dotted, operator and prototype keys;
- exact success and error envelopes;
- dependency details never reach responses;
- import purity;
- exact route-to-runtime wiring;
- legacy translation, ignored benign unknowns, rejected hostile keys, headers
  and delegation;
- Dashboard filters/pagination still render;
- ActiveCampaign lookup still resolves a user ID;
- Analytics renders complete server aggregates and performs no all-users fetch;
- route catalog and generated Front manifest agree after the two routes are
  added.

Run focused tests after every task and the complete backend and Front gates at
the end. Browser Playwright is attempted only if the sandbox contains the
required browser; inability to launch is reported explicitly and never hidden.

## 11. Dead-code and redundancy policy

Before deleting any candidate:

1. search every import form in both repositories;
2. inspect route mounts and dynamic imports;
3. distinguish production consumers from test-only coverage;
4. delete source and dedicated tests together only when no live consumer
   remains;
5. run negative scans after the deletion.

Expected candidates include:

- `getUsersForProduct` after the legacy route is eventually removed, not
  before;
- route-local Users V2 interfaces moved to focused modules;
- client aggregation helpers superseded by the analytics response;
- unused Users V2 hooks/service methods and the unmounted hook test page;
- obsolete mocks required only by the old inline handler.

Compatibility code is not considered dead while the legacy route is inside its
observation window. It must remain isolated and carry its deletion trigger.

## 12. Delivery and gates

- Work only on `remake`; never `main`.
- One coherent subject per commit, Conventional Commits with lowercase subject.
- No dependency installation without stopping for approval.
- No real APIs or production Mongo.
- Backend gates: lint, TypeScript `0/0`, focused Jest, full Jest and build.
- Front gates: format/lint, focused Jest, full Jest, build and route contract.
- Catalog and manifest increase from `437` to `439` because two routes are
  added and none is removed.
- Catalog invariants change intentionally: authenticated routes `432 -> 434`
  and deprecated routes `18 -> 19`. The deprecation test continues proving that
  the original 18 entries are exactly the cron-tags mounts and that the only
  additional deprecated entry is `/api/users/v2`, with reason and successor
  links.
- No backend deployment before the coordinated Front migration is ready.
- Final independent whole-branch review must have no open Critical or
  Important finding.
