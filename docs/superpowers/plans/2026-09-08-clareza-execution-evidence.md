# Clareza canonical execution evidence

Date: 2026-09-08
Worktree: `C:\Users\User\.codex\worktrees\d43b\BO2_API`
Branch: `remake`

## Scope

This checkpoint integrates canonical Clareza execution with the existing durable Mongo receipt and Redis refresh coordinator. It adds an async execution context, default-off gates before the Redis claim, provider and mutation ownership fences, and a dedicated canonical job. It does not activate a schedule, make provider calls, deploy, or promote the canonical runtime.

The canonical pipeline publishes the core generation, runs retention as best effort, requires all Raio-X, Earnings, and Top 10 companion refreshes to complete without reported errors, then warms read caches as best effort. A companion failure rejects the execution so the outer receipt cannot settle as completed.

## RED evidence

- Canonical context/job tests initially failed to compile because `canonicalExecutionContext.ts` and `clarezaCanonical.job.ts` did not exist.
- Store ownership tests then failed because Mongo candidate creation and Redis claim reached their mutation ports after ownership loss: 2 failed, 9 passed.
- `redisRefreshJobStore.test.ts` failed 1/5 because `read()` executed its state-reconciliation Lua script after ownership loss and returned `Redis refresh job state returned an invalid result` instead of `ownership lost`.
- `coreCarteiraAnalyzeRuntime.test.ts` failed 1/1 because the portfolio Redis cache write completed after ownership loss.
- `clarezaRefreshExecution.receipt.test.ts` failed to compile with `TS2339: Property 'assertOwnership' does not exist on type 'ClarezaRefreshPhaseHooks'`. This exposed that the operations wrapper had phase reporting but no real outer-receipt ownership assertion.

## GREEN evidence

- `redisRefreshJobStore.test.ts`: 1 suite, 5 tests passed.
- `coreCarteiraAnalyzeRuntime.test.ts`: 1 suite, 1 test passed.
- Receipt/context/job regression set: 3 suites, 17 tests passed.
- Final full Clareza service and canonical job set: 73 suites, 325 tests passed in 36.398 seconds.
- `npm.cmd run types:check`: passed after the receipt ownership hook was added.
- Canonical source lint (`clarezaCanonical.job.ts`, Clareza core, operations, and `fmpJsonRuntime.ts`): passed with zero warnings.
- `git diff --check`: passed.

The repository-wide lint remains red on 182 errors in concurrently imported renewal, product, and route files outside this ownership scope. No lint error was reported in the canonical Clareza execution files.

## Safety semantics

- `assertClarezaRefreshEnabled()` and `getCanonicalFmpApiKey()` run before the inner Redis coordinator claim. Disabled configuration therefore performs no Redis, Mongo, or provider work.
- `ClarezaRefreshPhaseHooks.assertOwnership()` delegates to the durable receipt lease. `withCanonicalExecution()` carries those hooks through async boundaries.
- Every FMP HTTP attempt asserts receipt ownership before Axios and reports provider start/success around the actual request.
- Mongo generation, publication, run, alias, suggestion, and companion mutations assert ownership immediately before the effect.
- Redis coordinator claim, reconciliation read, renew, checkpoint, complete, and fail scripts assert ownership immediately before scripts that can mutate state. The pure owner query remains read-only.
- Redis cache writes made inside canonical execution assert ownership immediately before the effect.

## Remaining integration gates

The parent integration still owns scheduler delegation, routes/controllers, configuration and contract catalogs, and the full repository gate after concurrent renewal/product work settles. Isolated provider, external Mongo/Redis, deployment, and promotion evidence remain separate operational work.
