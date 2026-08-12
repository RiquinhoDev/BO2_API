# SCALE terminal Task 2 implementer report

Date: 2026-08-12
Branch: `remake`
Scope: Task 2 production candidates, focused contract tests, and this report only.

## Outcome

Implemented two safe, semantics-preserving closures:

- `analyticsCache.service.ts`: keyed process-local singleflight for cache misses and forced refreshes. The key includes product, platform, period and exact date bounds. Rejections remove the flight in `finally`; different keys remain independent.
- `clareza/raiox/data.ts`: the existing ordered worker pool now defensively clamps requested concurrency to 10 (and at least 1), preserving result index/cardinality and existing provider order within each worker.

This is process-local coordination only. It is not distributed singleflight across Node processes or hosts.

## Candidate characterization

- `src/services/analytics/analyticsCache.service.ts`: live cache entry point; safe to coalesce identical calculations because the cache write is an idempotent upsert for the same key. Implemented.
- `src/controllers/engagement/summary.controller.ts` + `src/services/engagement/controllerSupport.ts`: live in-memory cache; cold Mongo aggregation now uses keyed process-local singleflight with rejection cleanup and independent keys.
- `src/services/clareza/raiox/data.ts`: live provider worker primitive and provider scan. Existing call site requested 5, but the exported primitive accepted arbitrary unbounded ceilings. Implemented defensive ceiling 10.
- `src/services/activeCampaign/nativeTagProtection.service.ts`: live scans are already sequential/batched; tag removal and snapshot/history writes have ordering and compensation implications. Ejected from parallelization.
- `src/services/activeCampaign/testimonialTagSync.service.ts`: live provider reads/writes are sequential and ordered per user/tag, including remove/add operations and partial-error aggregation. Ejected from parallelization.
- `src/services/tagMonitoring/weeklyTagMonitoring.service.ts`: batch traversal is sequential and coupled to snapshot writes, notifications and change history. Ejected from parallelization.
- `src/services/guru/crossReference.service.ts`: sequential reconciliation performs conditional provider reads, database updates, strict action application and explicit throttling/rate accounting. Ejected from parallelization.

## Strict TDD evidence

Focused command:

`npm.cmd test -- --selectProjects unit --runInBand tests/scalability/scale02PartitionC.contract.test.ts`

RED (exit 1):

- 50 identical cache misses invoked the calculator 50 times; literal expectation was 1.
- N=100 provider tasks reached peak concurrency 100; literal ceiling was 10.
- N=10,000 provider tasks reached peak concurrency 100; literal ceiling was 10.
- N=10 passed because its size equals the ceiling.

GREEN (exit 0): 1 suite passed, 6 tests passed. The contracts prove 50 identical misses -> one calculation; rejection permits retry; different keys do not block; and N=10/100/10,000 each preserves complete ordered results, accounts for every input exactly once, and stays at peak <=10. Tests use controlled promises only: no real sleeps, timers, ports or network.

## Fresh verification

- Focused Jest GREEN: exit 0, 6/6 tests.
- `npm.cmd run types:check`: exit 0.
- `npx.cmd eslint src/services/analytics/analyticsCache.service.ts src/services/clareza/raiox/data.ts tests/scalability/scale02PartitionC.contract.test.ts --max-warnings=0`: exit 0.
- `git diff --check`: exit 0; no whitespace errors.
- Full Jest run timed out at 124 seconds without a final summary; no full-suite green is claimed.

## Concerns / handoff

- Engagement and analytics coordination are process-local only; replicas can still duplicate work.
- Process-local singleflight does not prevent duplicate work across replicas. Distributed coordination would require a separately designed lease/lock with failure semantics.
- The provider worker ceiling protects callers of `runWithConcurrency`; serial provider flows were intentionally not made concurrent because doing so could change order, compensation, rate accounting or partial-write semantics.
- Console output from the legacy analytics cache makes the focused Jest log noisy; it does not affect assertions.
## Independent review fix round 1

Accepted findings were reproduced with a genuine RED: stale hits launched duplicate refreshes; hung analytics flights were not evicted; engagement lacked keyed flight coordination; NaN concurrency silently returned an empty result; and provider rejection allowed further task consumption.

Fixes:

- stale analytics refresh uses the same keyed flight;
- analytics flights are evicted after the existing 30-second transport timeout pattern, with unref and settlement cleanup;
- engagement aggregation uses generic keyed process-local singleflight;
- concurrency rejects non-finite/non-positive values;
- provider failure stops new task consumption, waits already-started workers, then preserves the public rejection contract.

Fresh evidence:

- SCALE partition C: 12/12 passed, including fake-timer eviction, stale refresh, engagement rejection/key isolation, NaN, fail-fast, and 10k behavior.
- TypeScript, owned ESLint, and scoped diff-check: exit 0.
- Existing `engagementCache.controller.test.ts` remains red because it expects cache metadata at `body.data.cached`; the response contract and controller put it at `body.meta.cached`. This mismatch predates the review fix and no HTTP contract/test was changed to hide it.
## Independent review fix round 2

RED: two already-started provider workers rejected in controlled order; the later rejection overwrote the first observed error (`expected first observed`, `received later failure`).

GREEN: the catch now assigns `stopped` and `firstError` only while not already stopped. The same controlled test proves the first observed rejection is retained and only the initial two indices start. Partition C passes 13/13; TypeScript, focused ESLint and scoped diff-check exit 0.
