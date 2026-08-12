# Task 1 implementer report

## Status

- Completed the live, safe database-read N+1 in `productSalesStatsBuilder.ts`.
- Preserved complete sales cardinality and the deterministic first-enrollment rule (`enrolledAt`, then `_id`).
- The builder now issues two `UserProduct.find` queries per product: the product enrollments and one deduplicated `$in` lookup for all of those users.
- No real network or database was used.

## RED / GREEN

- RED: `npm.cmd test -- --runInBand tests/scalability/scale02PartitionB.contract.test.ts`
  - exit 1; 1 suite failed, 3 tests failed.
  - N=1 observed the second query without `$in`; N=10 and N=100 attempted a third query and failed on `.sort`, proving the current query count grew with unique users.
- GREEN: `npm.cmd test -- --runInBand tests/scalability/scale02PartitionB.contract.test.ts`
  - exit 0; 1 suite passed, 3 tests passed.
  - Literal N=1/10/100 fixtures prove fixed query count, deduplicated user keys, complete record totals, and exactly one first enrollment per unique user.

## Candidate decisions

- `productSalesStatsBuilder.ts`: implemented safe set-based read.
- `mongooseClassDetails.reader.ts`: live read path, but a complete set-based replacement spans heterogeneous CursEduca/class-id predicates and multiple result shapes; ejected from this bounded change rather than risk cardinality/contract drift.
- `studentMovement.service.ts`: ejected; explicit sequential best-effort writes and per-student clock instants are contract behavior.
- `activitySnapshot.service.ts`: ejected; per-user reads plus snapshot writes preserve partial failure accounting.
- `achievementEvaluation.service.ts`: ejected; evaluation persists per user and aggregates partial failures.
- `guruDiscrepancy.service.ts`: ejected; identity fallback, dependent enrollment creation/status writes, and per-candidate result ordering are coupled.
- `guruTrialService.ts`: ejected; provider fallback and per-user directed writes preserve partial failure accounting.
- `activeCampaignOps.controller.ts`: ejected; decision evaluation can execute external actions and the loop preserves error accounting.
- `activeCampaignCourse.controller.ts`: preview-only loop is live, but each product evaluator may perform data-sized internal work; changing outer concurrency would not eliminate that fan-out and could overload the shared boundary.

## Concerns

- The ejected live candidates remain scalability debt and must stay explicit in the terminal inventory.
- This task does not claim operational closure or external-provider safety.
