# Task 4 report — SEC-10 Wave B1

Date: 2026-08-10
Branch: `remake`
Base: `635a9c218f1564cff02702ddb3c683ae1fcc2d5a`

## Outcome

Task 4 is code-complete and locally verified offline. All 25 live Sync Utilizadores and cron-management controller-local HTTP 500 sites now forward unexpected failures through the central error boundary. The exact production inventory moved from 116 to 91, with public error detail remaining 0.

No dependency was installed, no network or real integration/job was invoked, no real MongoDB/Redis service was started, and `MONGOMS_RUNTIME_DOWNLOAD=false` was set for the focused and complete Jest gates.

## Exact live inventory

- Cron commands: 5
- Cron operations: 4
- Cron queries: 2
- CursEduca dashboard: 1
- CursEduca products: 4
- CursEduca sync: 1
- CursEduca users: 3
- Sync reports: 3
- Sync stats: 2

Total: 25 live fatal catches. The test mounts the real cron, CursEduca, sync-report and sync-stats routers for 24 paths; the cron-expression infrastructure failure is exercised directly because its normal invalid-input branch intentionally remains a local 400.

## Catch and side-effect characterization

Every one of the 25 assigned fatal catches only formatted the terminal HTTP 500 response; none performed a compensating database/state write. They now preserve their existing log calls and then call `next(internalError(...))` with a stable operation code.

The following non-fatal or compensating catches were deliberately left untouched:

- Cron-expression business validation still returns its existing local 400.
- The cron-query legacy-config lookup remains best-effort.
- The CursEduca dashboard helper still logs and rethrows to its controller boundary.
- CursEduca per-stage validation, cross-reference, cache/stat rebuild and optional import failures retain their partial/degraded behavior.
- The CursEduca fatal sync path still logs the fatal message and stack before forwarding the error.

No job-transition or persistence order existed inside the assigned fatal catches, so there was no compensating write to move. Scheduled/manual history mapping and error counters are characterized in the focused suite.

## Long-running/background behavior

The existing CursEduca background endpoint still sends 202 immediately and retains its fire-and-forget `.catch(...).finally(...)` chain. Because the reused sync handler now requires `next`, the background owner supplies a local `NextFunction`-compatible callback that records the stable public error in `global.__curseducaSyncError`; it never calls the Express `next` after headers have been sent.

The focused test proves immediate 202, no central-error envelope or second response, stable background failure in the status endpoint, `result: null`, `running: false`, and non-null `finishedAt`. The isolated case also passed with `--detectOpenHandles` and normal teardown.

## Preserved contracts

- Cron destructive validated-input adapters still own delete, manual-trigger and tag-rules-only inputs and now forward `next` to the same controllers.
- Existing ObjectId guards and invalid-id responses remain in place.
- CursEduca credential kill switch returns 400 before the adapter is invoked.
- Manual CursEduca sync still passes `triggeredBy: MANUAL`, preserves source data, report/sync-history identifiers, report URLs and finalized error/warning counts.
- CursEduca product, product-membership and aggregate-stat envelopes retain their cardinality; the characterization covers two products, three memberships and the existing average-progress rule.
- Cron history retains `MANUAL` versus `CRON`, durations and per-run error counters.

## TDD evidence

Genuine RED, after adding the 25 central-boundary cases and before production migration:

```text
npm.cmd run test:unit -- --runInBand tests/controllers/syncUtilizadoresErrorContract.test.ts
1 suite failed, 25 tests failed, 25 total, exit 1
```

The handlers returned their legacy local 500 bodies, leaked the injected secret or omitted the canonical stable code/correlation contract. Harness-only TypeScript setup failures encountered before this run were not counted as RED.

Final focused central GREEN, including five preserved-behavior cases:

```text
npm.cmd run test:unit -- --runInBand --detectOpenHandles tests/controllers/syncUtilizadoresErrorContract.test.ts
1 suite passed, 30 tests passed, 30 total, exit 0
Time: 5.808s (7.7s wall)
```

One earlier combined run hung because the five newly appended Supertest requests lacked the repository's offline loopback marker. Isolation showed the egress guard correctly blocking them. Only the harness was corrected; the final normal-teardown run above passed. Two confirmed orphaned npm/Jest processes from the terminated diagnostic run were stopped, and the final process audit found no BO2_API Jest process.

## Focused Wave B GREEN

```text
$env:MONGOMS_RUNTIME_DOWNLOAD='false'; npm.cmd test -- --runInBand \
  tests/controllers/syncUtilizadoresErrorContract.test.ts \
  tests/controllers/cronManagementTopology.test.ts \
  tests/controllers/curseducaControllerTopology.test.ts \
  tests/controllers/syncStatsTopology.test.ts \
  tests/security/cronDestructiveValidation.test.ts \
  tests/security/curseducaDestructiveValidation.test.ts \
  tests/security/syncDestructiveValidation.test.ts \
  tests/tooling/productionBoundaryInventory.test.ts \
  tests/tooling/eslintRatchet.test.ts

9 suites passed, 9 total
73 tests passed, 73 total
exit 0
Time: 15.574s (17.5s wall)
```

The focused output contains only existing model/schema initialization warnings; no test failure or open handle was reported.

## Exact inventory and suppression proof

The ratchet baseline removed exactly the 25 assigned entries and lowered the ceiling:

```text
localHttp500: 116 - 25 = 91
publicErrorDetail: 0
productionBoundaryInventory.test.ts: 5/5 passed
Sync Utilizadores baseline membership: 0
```

Only the obsolete `@typescript-eslint/no-explicit-any` suppression counts were removed from `syncReports.controller.ts` (4) and `syncStats.controller.ts` (3). Their existing `no-console` counts remain 6 and 2. No new suppression was added.

## Full Wave B gate

```text
npm.cmd run lint
exit 0

npm.cmd run types:check
exit 0

$env:MONGOMS_RUNTIME_DOWNLOAD='false'; npm.cmd test -- --runInBand
322 suites passed, 322 total
1876 tests passed, 1876 total
exit 0
Time: 186.571s (188.8s wall)

npm.cmd run build
exit 0
Time: 15.2s wall
```

## Diff, encoding and dependency proof

```text
git diff --check
exit 0

Owned UTF-8 audit: BOM=False and NUL=False for every changed source/test/tooling file
Tracked git diff --numstat: numeric text rows only
Final staged binary/numstat audit: numeric text rows only

git diff --name-only 635a9c2 -- package-lock.json yarn.lock pnpm-lock.yaml
(no output)
```

The pre-existing mojibake in legacy comments/log strings is byte-preserved outside the intentional hunks; the reviewed Git diff shows no broad replacement or encoding churn. No new `any`, type assertion, non-null assertion, ignore directive, or suppression was added.

## Commit

```text
refactor(sync): centralize sync-utilizadores errors
```

The commit hash is returned separately because the report is part of that same cohesive commit. No push was performed.

## Tooling concern

`apply_patch` was attempted first for every edit phase. It succeeded for the initial report creation but intermittently failed for owned TypeScript/JSON/report files with the Windows sandbox ACL error:

```text
windows sandbox failed: helper_unknown_error: apply deny-read ACLs
```

Per the task brief's pre-authorization, only those owned files used narrowly scoped `.NET` `ReadAllText`/`WriteAllText` calls with `UTF8Encoding(false)`. Every resulting hunk was reviewed, `git diff --check` passed, and the BOM/NUL audit was clean.

## Concerns

No functional blocker remains. Existing Mongoose reserved-pathname/duplicate-index warnings and legacy model-initialization console output remain outside this slice; they did not affect the focused or full gates.
