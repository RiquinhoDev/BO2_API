# Scalability Round One Task 1

## Outcome

- `activity-snapshot.cohort-fanout`: changed to an ordered read-only worker pool capped at 10; cardinality, input order and duplicates are retained and failures reject.
- `student-movement.ordered-writes`: ejected. Per-item clocks, ordered best-effort writes, input-ordered errors and no rollback are contractual.
- `activity-snapshot.partial-writes`: ejected. Each dependent activity read feeds a snapshot write; counters advance only after success, without a transaction/idempotency key.
- `achievements.partial-writes`: ejected. Each user is mutated and saved before sequential counters; concurrent saves have no explicit idempotency/compensation boundary.
- `product-sales.product-loop-writes`: ejected. Each product couples dependent reads to a stats upsert; cross-product failure/order semantics have no transaction.

## TDD

RED: focused test failed because `mapCohortMilestonesBounded` did not exist. GREEN covers N=1/10/100, duplicates, indexed order, peak concurrency `<=10`, and failure propagation.

No inventory, generator, workplan, package, Front or unrelated partition file changed. No push.
