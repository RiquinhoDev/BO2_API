# Scalability Round 1 Task 2 report

## Verdict

All three Guru decisions are ejected from concurrency. No stable idempotency key exists for their dependent writes, and each flow has observable order, throttle, compensation or first-error semantics. Production code remains unchanged; new N=1/10/100 contracts make those constraints mutation-proof with provider/database ports mocked.

## Decisions

- `guru-discrepancy.compensation`: ejected. Missing identity requires ordered `findByEmail -> saveCurseducaUserId -> createPendingEnrollment`; a failure saving the identity rejects immediately and must not create an enrollment or process later candidates.
- `guru-cross-reference.actions`: ejected. Database reads are already set-based. Actions write per UserProduct in source order; the post-Guru path additionally has a provider budget of 20 and a 300 ms throttle after successful checks. No idempotency boundary permits bounded parallel actions without changing timestamps, action order or partial failures.
- `guru-trials.expired-writes`: ejected. Each item performs ordered `fetchSubscriptionById -> user.save -> UserProduct.updateMany`; advancing to compensation before the user save settles changes partial state. Provider failures are counted per item and later items continue.

## RED / GREEN evidence

- Discrepancy RED: temporarily removed the awaited identity save. The focused run exited 1 with an unhandled `identity-save`, proving the dependent failure would escape its original boundary and enrollment ordering would be unsafe.
- Cross-reference RED: temporarily removed the awaited action write. N=10 reached peak 10 and N=100 peak 100 instead of 1; focused run exited 1 with 2 failures.
- Expired-trial RED: temporarily removed the awaited user save. N=1/10/100 all reached peak 2 instead of 1; focused run exited 1 with 3 failures.
- GREEN: `npm.cmd test -- --runInBand --silent tests/scalability/scaleRound1Task2.contract.test.ts tests/scalability/scaleRound1GuruExpired.contract.test.ts tests/scalability/scaleRound1GuruCrossReference.contract.test.ts` exited 0: 3 suites, 18 tests.

## Contract coverage

- N=1/10/100 fallback identity resolution, dependent write order, peak concurrency 1 and first compensation failure.
- N=1/10/100 cross-reference action order, peak concurrency 1, complete action-error accounting and ordered details.
- N=1/10/100 expired-trial provider/user/enrollment order, peak concurrency 1 and complete provider-error accounting.
- No real Mongo, Guru or CursEduca call was made.

## Scope

No inventory, generator, workplan, package or Front file was edited. These decisions remain pending scalability debt by design; this task does not claim operational closure.
