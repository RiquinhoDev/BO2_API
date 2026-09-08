# Class and inactivation parity evidence

Date: 2026-09-08
Destination: `C:/Users/User/.codex/worktrees/d43b/BO2_API`, branch `remake`, baseline `0704745b`
Source inspected read-only: `b4836ee9` through `git show` / commit diffs
Status: code and owned tests complete; parent-owned catalogs and security metadata still require integration.

## Requirements implemented

- Class directory counts enrollments from `hotmart.enrolledClasses[].classId` for OGI classes and `combined.allClasses[]` entries with `source: curseduca` for CursEduca classes. Counts no longer depend on stale root `classId`, nonexistent root `status`, or one query per class.
- Hotmart first-enrollment and class-change history uses the resolved canonical class name, including when the provider name is missing or differs.
- The `Class` facade and legacy `models/class/InactivationList` path both resolve to the canonical top-level `InactivationList` schema and `inactivationlists` collection. The duplicate schema registration was removed.
- Inactivation list reads use real `InactivationList` documents, stable ordering, bounded pagination, status translation, batched missing-name resolution, server-side student counts, and omission of the embedded student array from list pages.
- Added bounded student-list reads with literal escaped search, current user state, class-name resolution, stable ordering, and pagination metadata.
- Added deletion of the history record only. It does not update users or products.
- List reversal rejects invalid/already-reversed/oversized lists, restores only students whose stored `previousState` was `ativo`, leaves students already inactive untouched, changes only OGI user fields and Hotmart/Discord UserProducts, records status history, and stores reversal metadata.
- List creation defaults to Hotmart + Discord. UserProduct updates filter to requested platforms and leave CursEduca/Clareza products unchanged. Class-id mutations are nonempty, unique, string-only, and capped at 100.
- List reads cap pages at 200 and offsets at 100,000. List reversals fail closed above 5,000 students.
- Mounted `GET /api/classes/inactivationLists/:id/students` and `DELETE /api/classes/inactivationLists/:id` through the existing class runtime/service/writer boundaries.

## TDD evidence

RED was captured before the corresponding production changes:

1. Unit regressions: `hotmartMutationPlan` failed both resolved-name cases; `classModelTopology` failed because the active schema lacked `execution.totalProcessed`. Result: 2 failed suites, 3 failed tests, 8 passed.
2. Integration regressions: class directory returned `studentCount: 0` instead of 2 from enrolled classes; class inactivation would not compile because student-list and delete controller factories did not exist. Result: 2 failed suites; directory had 2 failed and 5 passed tests.
3. Canonical compatibility import: loading the old class-model path after the top-level model raised `OverwriteModelError`. Result: 1 failed suite.
4. Reversal mutation bound: with the guard removed, a 5,001-student list returned success and changed state instead of HTTP 413. Result: 1 failed test, 20 skipped.

GREEN evidence after implementation:

- Focused unit: 2 suites, 11 tests passed.
- Focused class integration: 2 suites, 27 tests passed; after adding the reversal cap, the final file contains 21 inactivation tests.
- Canonical model compatibility: 1 suite, 1 test passed.
- Reversal cap regression: 1 test passed.
- Class architecture/routes/scalability regression set: 4 suites, 36 tests passed.
- Broad class + universal-sync selection: 44 suites, 291 tests passed in 87.422 seconds. Tests used cached MongoDB 8.2.6 with `MONGOMS_RUNTIME_DOWNLOAD=false`; no dependency download or provider call occurred.
- Full `npm.cmd run types:check`: exit 0 against the current shared worktree.
- ESLint over the owned production files: exit 0.
- `git diff --check`: exit 0.

The broad test output contains pre-existing Mongoose duplicate-index and reserved-path warnings. No test failed because of them, and this block did not suppress or weaken them.

## Parent integration requirements

- Review and regenerate the parent-owned route catalog/manifest for the two mounted endpoints. `npm.cmd run routes:catalog:check` currently reports the catalog or manifest as stale.
- Review authorization, destructive-operation classification, OPS-02 decisions, response contracts, and scalability inventory for both endpoints.
- After route metadata regeneration, rerun the response catalog with `RESPONSE_CONTRACT_FRONT_ROOT=C:/Users/User/Documents/GitHub/Riquinho/api/Front/Front`. Before regeneration it cannot classify the existing `GET /api/classes/users/search` and `POST /api/classes/syncComplete` because their source-line evidence shifted to lines 90 and 92.
- The shared scalability inventory check currently sees repository-wide concurrent drift; the parent owns regeneration and review.
- Dev/live data compatibility, browser validation, deployment, provider behavior, and operational closure remain unverified and outside this offline block.

## Bounded Clareza execution review

The requested read-only review found one completion-classification defect in
`canonicalOperationsExecution.ts`: the guard recognised `success: false` and a
positive numeric `errors`, but canonical aliases report partial failures through
`failures` and `conflicts`. Such a result could therefore settle the outer
receipt as complete. The parent accepted ownership of that correction.

The production-mount test was not valid evidence for canonical execution. It
mocked the legacy `clareza.job` module while the runtime loads
`clarezaCanonical.job`; isolated execution produced one passing ADMIN denial and
two SUPER_ADMIN HTTP 500 failures. The parity routing suite passed 13/13 in
isolation, but covered only `CLAREZA_CANONICAL_ENABLED=true`; an explicit false
legacy fallback case was still absent at review time.

Fresh review gates: receipt 12/12, canonical job 3/3, execution context 2/2,
companion backfill 2/2, canonical refresh boundary 7/7, and isolated parity
routing 13/13. The eight-file combined run had 6 passing suites and 2 failing
suites (15 failed / 30 passed); one was the production-mount defect above and
the parity-routing failures were timeouts that did not reproduce in isolation.
No Clareza execution/controller/route file was edited during this review.

## Main-parity scalability additions

The TypeScript AST scanner moved from the recorded 384 sites to 421 during the
initial review. All 37 additions were listed and adjudicated. Four are explicit
array `find` false positives (`TAGS_OBRIGATORIAS` and
`TAGS_ESTADO_VIGIADAS` at two call sites each); they must remain per-site
exclusions with source evidence rather than a global receiver allowlist.

Three Clareza companion generation reads were assigned to this block. A new
regression with 251 rows per collection first failed 3/3 because the stores
materialised the unbounded query directly. Earnings, Raio-X, and Top 10 now use
stable `_id` cursors with `batchSize: 200` and retain every row. The focused
GREEN was 3/3; five adjacent companion/runtime/retention suites were 13/13.

Concurrent renewal work added a thirty-eighth site in
`acTagWatch.routes.ts` after the original scan, moving the live count to 422.
It was reported immediately and remains part of the final adjudication rather
than being hidden by a baseline-only hash update. The scanner now validates a
separate main-parity site manifest while preserving all fixed SCALE-01,
SCALE-02, and SCALE-03 identities and counts.

### Final scalability reconciliation

The frozen shared tree contains 442 Mongoose `find`/`aggregate` sites under the
TypeScript AST scanner (hash
`013710d9fd626a310cd028b89bdc9dea2ac4c8fe10eb41e3cd97bcce8d22c12f`). The
main-parity manifest preserves all 37 additions from the first review and 22
concurrent decisions: 59 adjudicated, 55 complete, zero pending, and four
explicit non-Mongoose array exclusions. The removed product-sales year
materialisation remains represented as a resolved decision; its replacement is
a bounded `distinct` over the fixed 1900-2100 horizon.

The final direct scanner check passed with SCALE-01 40/0, SCALE-02 11/0,
SCALE-03 24/0, and main parity 55 complete / 0 pending / 4 excluded. The
mutation-backed contract suite passed 26/26 in 53.241 seconds.

### Renewal effect-boundary follow-up

The delegated DB-read follow-up also exposed missing effect hooks in purchase
date reconciliation, expiration event state/audit writes, and turma-tag provider
writes. Two new lease-loss regressions first failed because the claim proceeded
without an ownership assertion; after adding local-mutation hooks immediately
before each write, purchase and expiration suites passed 82/82. A mutation that
removed `providerStarted` from the turma-tag POST produced the expected order
failure (`local, post, success` instead of `local, provider, post, success`);
restoring the hook passed 13/13. Purchase-date and expiration field writes now
mark provider start before each request and provider success exactly once only
after a `true` result. False returns and thrown requests do not mark success.

Final scoped static evidence: full TypeScript check passed, ESLint passed over
the owned production renewal files, and `git diff --check` passed. Test files in
these pre-existing characterization suites are not part of the production
ESLint scope and retain their existing `any`-heavy fixture style.
