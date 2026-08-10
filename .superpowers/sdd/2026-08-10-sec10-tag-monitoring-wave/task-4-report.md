# Task 4 report - Critical-tag errors and domain closure

## Scope

- Migrated exactly eight live critical-tag handlers to internalError.
- Wrapped seven ordinary routes with asyncRoute after authenticate.
- Kept withValidatedInput(tagMonitoringDeleteInput, ...) on permanent delete and threaded next through its callback without stacking wrappers.
- Preserved success, 400, 404 and 409 payloads, IDs, query parsing, soft/permanent delete semantics and service write order.
- Removed eight local 500 formatters and eight obsolete no-explicit-any suppressions.
- No push, external API, real database, scheduler, deploy, dependency or lockfile mutation.

## TDD evidence

RED before production edits:

MONGOMS_RUNTIME_DOWNLOAD=false npx.cmd jest --ci --runInBand tests/controllers/tagMonitoringErrorContract.test.ts

Result: 1 suite failed; 9 expected legacy failures (the existing list sentinel plus eight table cases) and 47 passed. Each failure exposed the secret local error field and lacked stable code/correlation ID.

GREEN after the minimal migration:

- Focused contract: 55/55 tests.
- Combined contract/routes/destructive/inventory: 4/4 suites, 70/70 tests.
- Route catalog: 7/7 tests and 439/439 declarations after removing one inherited blank-line offset already present at HEAD b3899c4.

Stable codes:

- CRITICAL_TAG_LIST_FAILED
- CRITICAL_TAG_ADD_FAILED
- CRITICAL_TAG_REMOVE_FAILED
- CRITICAL_TAG_DELETE_FAILED
- CRITICAL_TAG_TOGGLE_FAILED
- CRITICAL_TAG_PRIORITY_UPDATE_FAILED
- CRITICAL_TAG_NATIVE_TAGS_FAILED
- CRITICAL_TAG_STATS_FAILED

## Inventory and negative proof

- Task inventory: critical-tag local 500 sites 8 -> 0.
- Whole wave: Tag Monitoring local 500 sites 27 -> 0.
- Global SEC-10 inventory: 233 -> 206 (Task 4 checkpoint 214 -> 206).
- no-explicit-any suppressions for criticalTag.controller.ts: 8 -> 0.
- Literal grep for res.status(500)|error.message under the domain and route: zero results.
- Inventory mutation/restoration test remains green.

## Major offline gate

- lint:baseline:prune: PASS
- lint: PASS
- types:check: PASS
- MONGOMS_RUNTIME_DOWNLOAD=false npm test -- --runInBand: PASS, 318/318 suites and 1734/1734 tests
- build: PASS
- git diff --check: PASS
- Lockfile diff: empty

No forceExit was used. Existing noisy console output occurred, but no worker-shutdown warning or open-handle failure was emitted.

## Closure boundary

The Tag Monitoring domain is code-complete for this SEC-10 wave. SEC-10 remains globally open for 206 other local HTTP 500 sites, and operational deployment/observation was not performed.