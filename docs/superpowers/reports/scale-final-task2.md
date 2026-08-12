# Scale final Task 2 report

## Outcome

Implemented the one local/database fan-out whose equivalence was provable: `syncTrialsFromGuru` now loads matching local users with one deduplicated `$in` query. Subscription iteration and directed `User.updateOne` writes remain sequential and in provider order, with per-item timestamps and complete write-error accounting unchanged. If the set read fails, the service falls back to the legacy per-subscription lookup so read failures retain their prior per-item accounting.

No real database or provider was called.

## RED / GREEN

- RED: `npm.cmd test -- --runInBand tests/scalability/scaleFinalTask2.contract.test.ts`
  - exit 1; 1 suite failed, 6 tests failed.
  - N=1/10/100 observed zero set reads and the legacy `findOne(...).select()` fan-out; write assertions could not be reached.
- GREEN: `npm.cmd test -- --runInBand tests/scalability/scaleFinalTask2.contract.test.ts tests/services/classes/studentMovement.service.test.ts tests/services/guru/guruDiscrepancy.service.test.ts tests/jobs/guruTrialCheck.job.test.ts`
  - exit 0; 4 suites passed, 17 tests passed, including the final set-read fallback regression.
  - N=1/10/100 proves one local set read, deduplicated ordered keys, sequential directed writes, provider-order results, and complete injected write-error totals.
  - N=1/10/100 student movement characterization proves peak write concurrency remains 1, input order is retained, every item consumes its own clock instant, and every injected failure is reported.

## Live call sites verified

- Student movement: `src/controllers/classes/studentMovement.controller.ts` calls `moveMany`.
- Achievement batch: `src/routes/achievements.routes.ts` and cron `src/services/cron/scheduler/jobDispatcher.ts` call `evaluateAllAchievements`.
- Guru discrepancy: `src/controllers/guruDiscrepancy.controller.ts` constructs the service.
- Guru trials: `src/controllers/guru.trials.controller.ts` and `src/jobs/guruTrialCheck.job.ts` call sync/check paths.
- Activity monthly snapshots have no current production caller found by exact symbol search; the service method remains public and unchanged.

## Ejections

- `studentMovement.service.ts`: ejected. Sequential best-effort movement, response order, and one clock instant per student are explicit contract behavior. Parallel/chunk writes would alter timestamps and partial-failure order.
- `activitySnapshot.service.ts#createMonthlySnapshots`: ejected. Each user performs an activity read followed by idempotent create/update behavior and increments processed only after success. Bulk replacement cannot preserve model hooks, per-user partial failures and existing-vs-create semantics without a larger repository seam.
- `achievementEvaluation.service.ts#evaluateAllAchievements`: ejected. Evaluation mutates the in-memory user, merges `seenAt` using evaluation-time clocks, then persists per user and separately counts errors. Bulk writes would change timestamps and failure attribution.
- `guruDiscrepancy.service.ts#mark`: ejected. Missing identity resolution, local ID persistence, dependent enrollment creation, active-subscription fail-open behavior, re-mark decisions and detail ordering are coupled per candidate. It also contains provider calls and therefore is not a local-only bounded worker candidate.
- `guruTrialService.ts#checkExpiredTrials`: ejected. Provider status determines ordered user save then UserProduct compensation/status write; parallelism or bulk writes changes partial-state behavior.
- `guruTrialService.ts#syncTrialsFromGuru` provider fallback and directed writes: ejected. Only the independent local user lookup was converted to a set read. Per-subscription provider fallback, timestamps, write order and error accounting remain sequential.

## Scope / concerns

- Inventory, generator, workplan, package files and Front were not edited.
- These ejections remain explicit scalability debt; this report does not claim operational closure or provider safety.

## Verification gates

- `npm.cmd run types:check`: exit 0.
- Focused lint reached the whole `src` tree through the repository script and exited 1 on 16 pre-existing `no-explicit-any` errors in `guruTrialService.ts`; the Task 2 change adds no explicit `any`.
## Review fix: dedupe and sequential-write mutations

- Dedupe RED: temporarily removed `Set`; focused N=1/10/100 run exited 1. N=10 and N=100 exposed duplicate normalized emails in the `$in` query (2 failures, N=1 passed).
- Sequential-write RED: restored `Set`, temporarily removed the awaited write; focused run exited 1. Peak in-flight writes became 10 and 100 for N=10/100 instead of 1 (2 failures, N=1 passed).
- GREEN: restored production behavior; `npm.cmd test -- --runInBand --silent tests/scalability/scaleFinalTask2.contract.test.ts` exited 0 with 1 suite and 10 tests passed.
- Fixtures now include duplicate and whitespace/case-variant subscription emails for N=10/100. They prove normalized query deduplication while retaining all N provider-order directed writes and peak write concurrency 1.
