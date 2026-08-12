# Scalability final wave - Task 3

## Scope and outcome

Task 3 reviewed analytics cache statistics/warmup, ActiveCampaign manual/native/testimonial flows, weekly tag monitoring, and Guru cross-reference. No real provider, production Mongo, or network call was made.

- Changed: `analyticsCache.getCacheStats()` no longer materializes every cache document to evaluate half-life. Mongo evaluates the same `now > calculatedAt + (expiresAt - calculatedAt) / 2` predicate and returns only `$count`.
- Characterized: 50 concurrent warmups for the same calendar window fill the monthly/yearly keys once each through the existing keyed singleflight. No extra warmup scheduler was added because the requested behavior already existed.
- Ejected: five provider/write flows below. Parallel execution cannot preserve their current observable semantics with the available boundaries.

## TDD evidence

RED:

`npm.cmd test -- --runInBand tests/scalability/scale02PartitionC.contract.test.ts`

- 1 failed, 14 passed.
- Expected failure: `getCacheStats()` still called the old model API (`countDocuments is not a function` in the focused aggregate-only double).
- The warmup characterization passed immediately, proving existing keyed singleflight behavior rather than a missing feature.

GREEN:

`npm.cmd test -- --runInBand tests/scalability/scale02PartitionC.contract.test.ts --silent`

- 1 suite passed; 15/15 tests passed.
- N=10/100/10,000 bounded-provider helper coverage remained green.
- Jest emitted only the repository's pre-existing Mongoose reserved-path warning.

## Exact ejections

### ActiveCampaign manual evaluation

`activeCampaignOps.controller.ts::testCron` traverses products and user-products while `decisionEngine.evaluateUserProduct` may execute external tag actions and writes per-item errors into the manual execution log. No idempotency key or compensation boundary spans independent evaluations; parallelism could reorder provider writes and persisted error accounting.

### Native tag capture

`nativeTagProtection.service.ts::captureNativeTagsBatch` preserves sequential provider reads and per-email snapshot/history behavior. Capture is also the safety input for later protected removals. There is no transaction or idempotency boundary covering provider state plus Mongo snapshot/history, so concurrent captures are not safely equivalent.

### Testimonial tag sync

`testimonialTagSync.service.ts::syncTestimonialTags` deliberately orders contact lookup/create, old completion-tag removal, new-tag additions, then `lastSyncedAt` persistence. Results aggregate partial failures per user/tag. Parallelizing users or tags could reorder remove/add operations and persist sync state after a different partial provider outcome.

### Weekly tag monitoring

`weeklyTagMonitoring.service.ts::performWeeklySnapshot` couples per-email provider reads to snapshot creation, previous-snapshot comparison, critical-change history, grouped notifications, cleanup, and an explicit 50-item batch/1,000 ms delay. A generic worker would bypass or alter the existing provider throttle and change ordering; no provider-aware rate port exists here.

### Guru cross-reference

`crossReference.service.ts` performs conditional CursEduca reads, refreshes local user state, applies ordered status actions, enforces a 20-call budget, and delays 300 ms after successful reads. CursEduca-sync reconciliation also applies first-pass actions, missed-user actions, then stale bulk reconciliation. Parallelism would alter API budget winners, action order, timestamps, and partial-error details.

## Safety boundary

No ejected flow was changed. Reconsideration requires an explicit provider-aware limiter plus idempotency/compensation design and tests proving identical ordering, API-budget selection, timestamps, and partial-failure accounting.
