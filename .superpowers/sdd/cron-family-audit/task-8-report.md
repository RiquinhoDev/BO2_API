# Task 8 — Hotmart manual sync safety and Front contract

Date: 2026-09-07
Status: round 1 remediation implemented with focused offline evidence; independent re-review pending. Provider, operational, production, and deployment closure intentionally not claimed.

## Scope and preflight

- Backend: `C:\Users\User\.codex\worktrees\d43b\BO2_API`, branch `remake`, starting `7b866e97`.
- Front: `C:\Users\User\Documents\GitHub\Riquinho\api\Front\Front`, branch `remake`, starting `17c73f2`.
- Existing Front dirt `.claude/settings.local.json` and `scripts/git-hooks/` was preserved, never staged.
- Offline boundary held: no provider/network request, real or external DB, dependency install, cache deletion, push, merge, rebase, deploy, or `main` mutation.
- Canonical Hotmart identity confirmed from Front metadata: exact job name `Job de Hotmart` with `syncType: hotmart`; aliases and CursEduca remain unsupported.

## Implementation

### Backend

- Added exact `hotmart-sync` capability with cap metadata tied to the shared 20,000 provider/read/effective-mutation limit and kill-switch reason `HOTMART_SYNC_MANUAL_EXECUTION_ENABLED`.
- Added strict typed default-off configuration, immutable runtime access, credential gating, query-state reason, and manual live guard. Scheduled execution does not consult the switch.
- Hardened Hotmart transport before accumulation: page size 100, maximum 200 pages, aggregate maximum 20,000 users, strict array/pagination envelopes, error/partial rejection, alias contradiction checks, cursor progress checks, stable identity checks, and duplicate identity rejection.
- Propagated dry-run, `triggeredBy`, and phase hooks through the exact Hotmart dispatcher/adapter path. Provider phase hooks fence authentication and every paginated request.
- Added bounded UniversalSync Hotmart preflight. It validates canonical identity/email uniqueness, reads the local snapshot with a physical 20,001 sentinel, computes a sanitized deterministic plan, rejects effective overflow before report/history/effect creation, and returns dry-run without writes.
- Added ownership assertions immediately before report/history/user/class/student-history/UserProduct/snapshot writes, including helper paths. Phase-enabled item failures fail closed instead of being converted into a continuing partial run.
- Added strict Hotmart dispatcher result normalization: explicit success, finite non-negative bounded counters, valid dry-run plan, canonical fixed failure message, and no raw runner/provider fields.
- Updated source-backed response catalog evidence and SCALE-01 Mongoose baseline hash after line movement; no new Mongoose list site was introduced by the local preflight (384 remains).

### Front

- Added generic Cron coverage for exact Hotmart capability `hotmart-sync`, verified cap `20,000`, preview available/live blocked state, exact backend block reason, and sanitized result rendering.
- Added a negative test proving `Nightly Job de Hotmart` cannot obtain Hotmart authorization from a similar name when the backend capability is blocked.
- No parallel Front mutation path was added; existing generic Cron controls remain backend-policy driven.

### Review round 1 remediation

- Backend finding 1: report/snapshot/history helper writes now re-assert ownership and local mutation phase immediately before each model write; phase-enabled helper failures escape instead of becoming partial success.
- Backend finding 2: UniversalSync Hotmart preflight now models effective User/UserProduct/Class/class-history/snapshot/report effects, caps actual updateMany targets, and uses bounded `limit + 1` local reads; an under-item source can fail closed before effects.
- Backend finding 3: Hotmart dispatcher preserves typed control errors and converts provider/UniversalSync details to the fixed public failure `Execução Hotmart sync falhou`.
- Backend finding 4: mode-aware normalizer rejects dry-run mismatches, non-boolean mode, malformed success/error counters, contradictory plan counters, and invalid preview plans.
- Backend finding 5: adapter validates the complete raw provider snapshot (including stable identity and duplicate checks) before progress enrichment; provider failures and invalid rows escape.
- Backend finding 6: every `requestWithRetry` attempt and lesson/progress request receives provider/ownership hooks; ownership loss stops further lessons/retries and escapes.
- Front finding 7: generic Cron now retains one request ID per `job + mode` over timeout/409/504/indeterminate outcomes and rotates only after definitive success/failure.
- Front finding 8: specialized Hotmart `JobsList`/`useExecuteJob` now consume backend-owned policy, expose preview/live modes, call the canonical Cron trigger envelope (`executionSucceeded`, `dryRun`, `x-request-id`), and retain per-job/mode identity; absent/blocked policy fails closed.

## Commits

Backend:

- `3f50becf feat(cron): harden Hotmart manual sync`
- `e878e053 chore(lint): prune Hotmart suppressions`
- `7ec34f77 fix(cron): accept Hotmart pagination aliases`
- `9d956679 fix(cron): close Hotmart review findings`

Front:

- `e7d60e2 test(cron): cover Hotmart backend policy`
- `1c11d58 fix(cron): align Hotmart manual controls`

## TDD evidence

### Fresh RED

Initial focused command before the implementation:

```text
npm.cmd exec -- jest tests/services/cron/hotmartSyncSafety.test.ts --runInBand --no-cache
FAIL .../hotmartSyncSafety.test.ts
Tests: 5 failed, 0 passed
```

Observed failures were the expected missing capability (`unsupported`), missing typed switch, provider safety tests unable to reach transport because the fixture had not yet initialized request runtime config, and dispatcher fetching Hotmart without options/hooks. The fixture/environment failure was corrected before using the provider RED as implementation evidence; no test was weakened.

### Fresh GREEN

Final backend focused command:

```text
npm.cmd exec -- jest tests/bootstrap/config.test.ts tests/services/cron/hotmartSyncSafety.test.ts tests/services/hotmartRuntimeConsumers.test.ts tests/services/cron/schedulerJobDispatcher.test.ts tests/services/cron/schedulerJobDispatcher.pipeline.test.ts tests/services/cron/schedulerJobExecution.test.ts tests/services/universalSync.runtimeConfig.test.ts --runInBand --no-cache
Test Suites: 7 passed, 7 total
Tests: 99 passed, 99 total
```

The Task 8 safety suite first ended at `10 passed, 10 total`; after the explicit top-level cursor-alias compatibility fix it ended at `11 passed, 11 total`. It covers exact capability/switch, page overflow, malformed envelope, contradictory aliases, repeated cursor and identity, supported top-level pagination, dispatcher propagation, preview zero writes, pre-effect effective overflow, and strict result sanitization.

Front focused command:

```text
npm.cmd test -- --runInBand src/features/cron
Test Suites: 10 passed, 10 total
Tests: 68 passed, 68 total
```

Round 1 TDD evidence:

```text
Backend RED: hotmartSyncReviewRound1.test.ts — 7 failed (normalizer, provider hooks/snapshot, public error, ownership fence, effective cap).
Backend GREEN: npm.cmd exec -- jest tests/services/cron/hotmartSyncReviewRound1.test.ts tests/services/cron/hotmartSyncSafety.test.ts tests/services/cron/schedulerJobDispatcher.test.ts tests/services/cron/schedulerJobDispatcher.pipeline.test.ts tests/services/cron/schedulerJobExecution.test.ts tests/services/universalSync.runtimeConfig.test.ts --runInBand --no-cache
Test Suites: 6 passed, 6 total; Tests: 72 passed, 72 total.

Front RED: useCronManagement.requestIdentity.test.tsx — failed with `Expected: 1; Received: 2` request IDs before identity retention implementation.
Front GREEN: npm.cmd test -- --runInBand src/features/cron/__tests__/useCronManagement.requestIdentity.test.tsx src/features/cron/__tests__/useCronManagement.test.tsx src/features/cron/__tests__/cron.api.test.ts src/features/cron/__tests__/cron.manualExecution.test.ts src/features/cron/__tests__/cron.schemas.test.ts src/features/cron/components/__tests__/CronJobList.test.tsx src/pages/gerirAlunos/hotmartSync/hooks/__tests__/useExecuteJob.policy.test.tsx src/pages/gerirAlunos/hotmartSync/hooks/__tests__/mutationHooks.coverage.test.tsx src/pages/gerirAlunos/hotmartSync/components/__tests__/JobViews.test.tsx src/pages/gerirAlunos/hotmartSync/__tests__/SyncPage.test.tsx
Test Suites: 10 passed, 10 total; Tests: 53 passed, 53 total.
Front specialized RED: useExecuteJob.policy.test.tsx — missing canonical `executionSucceeded` and policy guard; 2 failed.
Front specialized GREEN: same focused command above; 2 specialized tests pass within the 10-suite/53-test result.
```

## Exact validation

Backend:

- `npm.cmd run types:check`: pass.
- `npm.cmd run build`: pass.
- `npm.cmd run lint`: pass after `npm.cmd run lint:baseline:prune`; the prune removed only two now-unused Hotmart transport suppressions and was committed separately.
- `npm.cmd run routes:catalog:check`: `Route catalog is current (409 runtime identities).`
- `RESPONSE_CONTRACT_FRONT_ROOT=C:\Users\User\Documents\GitHub\Riquinho\api\Front\Front npm.cmd run contracts:responses:check`: `Response catalog is current (409 decisions; 212 Front calls; 187 consumers).`
- `npm.cmd run scalability:reads:check`: `SCALE-01 inventory OK: 40 complete / 0 pending; SCALE-02 11 complete / 0 pending; SCALE-03 24 complete / 0 pending; 384 Mongoose list sites (AST v2)`.
- `git diff --check` and staged diff checks: pass before commits.
- Complete backend suite was not run; parent owns that gate.

Front:

- `npm.cmd test -- --runInBand src/features/cron`: `10` suites / `68` tests pass.
- `npm.cmd exec -- tsc --noEmit --pretty false`: pass.
- `npm.cmd run lint`: pass.
- `npm.cmd run build`: pass. Existing Vite/Browserslist/Tailwind/chunk-size warnings remain baseline warnings.
- `git diff --check` and staged diff check: pass.

Touched hand-written source/test files remain at or below 500 physical lines. The generated response catalog is intentionally larger and excluded from that constraint.

## Concerns and non-claims

- No Hotmart/provider call, network integration, real MongoDB/production DB, browser/live-user session, deployment, promotion, push, merge, rebase, or `main` mutation was performed.
- Scheduled Hotmart semantics were preserved at the dispatcher boundary, but no production scheduler execution was claimed.
- Existing Mongoose duplicate-index/reserved-path warnings appeared in Jest output; they are pre-existing and did not fail the focused gates.
- Operational receipt replay/conflict/indeterminate behavior is inherited from the canonical Tasks 5–7 execution path and was not re-run as a full integration suite here; independent round 1 re-review remains required.
