# Class comparison boundary

## Objective

Extract `GET /api/analytics/compare` from
`src/controllers/analytics.controller.ts` as one vertical, testable boundary
without changing its route, authentication, successful comparison semantics, or
the Front consumer.

The cut must also remove the comparison-only cache, timer, types, and logging
from the legacy controller once negative reference checks prove them orphaned.

## Current evidence

- The route is mounted at `GET /api/analytics/compare` and classified as
  authenticated, non-writing, and consumed by the Front.
- The Front calls it from
  `src/features/analytics/analytics.api.ts` and renders partial failures in
  `ClassComparisonCard.tsx`.
- The current handler is the only consumer of the top-level `cache`,
  `CACHE_DURATION`, `cleanExpiredCache`, `cacheCleanupTimer`, `Comparison*`
  types, and `isOk` guard in `analytics.controller.ts`.
- The current import creates a ten-minute cleanup interval. It is unrefed, but
  remains an unnecessary import-time side effect.
- The Front unwraps the API envelope and validates only `data`. Therefore the
  current outer `cached` flag never reaches `ComparisonResult.cached`.
- A failed class currently produces only `{ classId, error }`, while the
  Front schema requires the numeric comparison fields and `lastCalculated` on
  every row. One partial failure can make the Front reject the whole response.

## Selected design

Use the same boundary pattern already established for class analytics, quick
stats, and global analytics:

1. A strict Zod input boundary parses `classIds`.
2. A thin validated controller maps service outcomes to the existing HTTP
   envelope and delegates unexpected errors to the central handler.
3. A pure comparison service coordinates class reads, partial failure mapping,
   summary calculation, and cache policy.
4. A small port adapts the existing `analyticsService.getClassAnalytics`
   operation. No second analytics implementation is introduced.
5. The existing generic `InMemoryTtlCache` supplies a five-minute lazy TTL.
   The new boundary creates no interval or import-time handle.

This is preferred over a mechanical handler move because it fixes the live
contract defect and removes the side effect. Extracting another endpoint first
would leave the last legacy analytics timer in place.

## Input contract

The boundary accepts only:

- empty path params;
- query `classIds`;
- empty body.

`classIds` is split on commas, each value is trimmed, and empty segments are
discarded, preserving the current parsing behavior. The resulting ordered list
must contain between two and ten non-empty identifiers. Unknown query, body, or
path fields are rejected by the shared strict boundary and NoSQL operator
guard.

The order and multiplicity supplied by the caller are preserved. Changing
deduplication semantics is outside this refactor. The normalized cache key is
`JSON.stringify(classIds)`, avoiding raw whitespace variants without changing
response order.

## Service contract

The service receives:

- the normalized ordered class ID list;
- a `ClassAnalyticsReader` port;
- a `TimedCache<ClassComparisonData>`;
- an injected clock.

It reads all requested classes concurrently. A successful class maps the
existing analytics fields without recalculation. A missing class becomes a
stable `"Turma não encontrada"` error row. A failed dependency becomes a
stable `"Erro ao obter analytics da turma"` error row; internal exception
details never enter the response.

Error rows include the complete Front-required shape:

- requested `classId`;
- omitted `className`, preserving the Front fallback label `Turma <id>`;
- numeric metrics set to zero;
- empty `lastCalculated`;
- stable `error`.

The Front already branches on the presence of `error`, so these compatibility
values are not displayed as real metrics. Summary values, best/worst classes,
and valid counts use successful rows only.

If no class is valid, the service returns a not-found outcome and does not
cache it. Otherwise it caches the complete comparison data.

## Response compatibility

The existing statuses and envelope remain:

- `200` for at least one valid class;
- `404` when every requested class is missing or fails;
- `400` from the shared boundary for invalid input;
- central stable `500` envelope for unexpected boundary failures.

Successful `data` keeps:

- `comparisons`;
- `summary`;
- `validComparisons`;
- `totalRequested`;
- `calculationDuration`;
- `lastUpdated`.

It additionally carries `cached: false | true` inside `data`, where the Front
actually reads it. The outer legacy cache metadata may remain for HTTP
compatibility, but correctness does not depend on it.

On a cache hit, the reader is not called. `lastUpdated` and the original
calculation duration remain those of the cached computation; cache age derives
from the stored timestamp and injected clock.

## Dead-code rule

Before deletion, negative reference checks must prove that the following are
used only by the legacy `compareClasses` implementation:

- the top-level `cache`;
- `CACHE_DURATION`;
- `cleanExpiredCache`;
- `cacheCleanupTimer`;
- `ComparisonOk`, `ComparisonErr`, and `Comparison`;
- `isOk`;
- the legacy `compareClasses` export and controller property.

After the new route is wired, repeat the checks and remove every orphan. Do not
remove similarly named Guru comparison or snapshot comparison code: those are
separate live domains.

## Tests and proof

Follow RED/GREEN before production changes:

1. Boundary tests: valid normalization, fewer than two, more than ten, unknown
   field, NoSQL operator, and own `__proto__`.
2. Service tests: complete success, partial missing/failure with a
   Front-compatible row, all-invalid not-found, summary uses only valid rows,
   normalized cache key, cache hit, and exact TTL expiry.
3. Controller tests: fresh envelope, cached envelope with `data.cached`, 404,
   and central redacted error.
4. Route test: `/compare` reaches the extracted validated boundary rather than
   the legacy controller.
5. Mutation proof: restore an incomplete error row and show the Front contract
   fixture rejects it, or assert the complete schema-required row directly in
   the API contract test.
6. Negative references: prove the timer/cache and legacy handler are absent
   after extraction.
7. Offline gate: lint, TypeScript 0/0, full Jest with
   `MONGOMS_RUNTIME_DOWNLOAD=false`, build, route catalog 437/437, and
   `git diff --check`.

No real external API or production MongoDB is used.

## Non-goals

- No route rename or Front UI redesign.
- No changes to Guru or snapshot comparison.
- No deduplication or sorting of selected class IDs.
- No distributed cache or new dependency.
- No work on the destructive individual recalculation endpoint in this batch.
