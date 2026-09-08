# Task 10 — `all` composite manual sync

Date: 2026-09-08
Branches: backend `remake` / Front `remake`

## Outcome

Implemented the bounded `syncType: all` composite on the existing `remake` branches.

Backend commit: `0684a3d2` (`feat(cron): add bounded all composite`).
Front commit: `0454ae7` (`feat(cron): expose all policy state`).

The backend now treats the persisted `syncType: all` as the exact capability identity. No
display-name allowlist or substring grants this capability. Manual mutation is default-off through
the typed `ALL_SYNC_MANUAL_EXECUTION_ENABLED` switch and requires complete Hotmart and CursEduca
credentials. The existing scheduled path remains available through the same bounded dispatcher.

## Implemented surface

- Extracted `all` orchestration from `jobDispatcher.ts` into `allSyncComposite.ts`.
- Reads both bounded Hotmart and CursEduca snapshots before child execution. The aggregate source
  cap is 20,000 items; each child keeps its existing provider/effective safety cap.
- Runs both child UniversalSync dry-run plans first. The aggregate refuses live mode when either
  child is incoherent/failing, when a real `projectedEffects` metric is missing, or when the combined
  effective mutation budget exceeds 20,000. The UniversalSync preview now exposes that real metric
  as `plan.projectedMutations`; aggregate plans expose both child projections and their total.
- Dry-run keeps provider reads and bounded local planning but performs no provider/local writes.
  Preflight hooks retain ownership assertion while intentionally suppressing receipt phase
  transitions. Live children receive the real hooks sequentially; the second writer is not started
  after the first live child fails. Ownership-loss errors remain throwable so the canonical receipt
  can settle indeterminate.
- Propagates `dryRun`, `phaseHooks`, and `triggeredBy` through source fetches and child requests.
  Child/provider failures become the fixed public `Execução All sync falhou` result without raw
  provider messages.
- Removed synthetic Discord counts. Discord is an explicit `{ status: 'skipped', reason:
  'not-configured' }` no-op in both the aggregate plan and live result; its stats contribute only a
  truthful skipped count.
- Added backend list-view state for the aggregate switch, including capability, cap, reason,
  preview availability and live ON/OFF state.
- Front metadata now resolves aggregate jobs by exact `syncType: all`, while the existing generic
  Cron controls render cap, manual switch, preview/live availability and blocked state.

## TDD evidence

Initial RED, before the implementation module/config field existed:

```text
TS2307 Cannot find module .../src/services/cron/scheduler/allSyncComposite
TS2551 config allSyncManualExecutionEnabled missing
TS7006 implicit any
```

Focused GREEN:

```text
tests/services/cron/allSyncComposite.test.ts
1 suite, 12 tests passed

tests/services/cron/allSyncComposite.test.ts
tests/controllers/cronManualExecutionView.test.ts
tests/services/cron/schedulerJobDispatcher.pipeline.test.ts
tests/services/cron/hotmartSyncSafety.test.ts
tests/services/cron/curseducaSyncSafety.test.ts
5 suites, 71 tests passed
```

Coverage includes exact `syncType` capability and negative near-name/type cases, typed default-off
and credential gates, manual guard, option/hook propagation, strict dry-run, source/provider and
aggregate overflow before child mutation, real child-plan projections, preflight-before-live order,
sanitized provider/child failure, sequential live failure containment, truthful Discord no-op,
UniversalSync preview projection output, existing Hotmart/CursEduca safety, dispatcher compatibility,
and backend Front-state contract.

Backend static gates:

```text
npm.cmd run types:check                 PASS
npm.cmd run build                       PASS
npm.cmd run lint -- --max-warnings=0    PASS
git diff --check                       PASS
```

Front focused/static gates:

```text
src/features/cron/components/__tests__/CronJobList.test.tsx
1 suite, 11 tests passed

npm.cmd exec tsc -- --noEmit --pretty false   PASS
npm.cmd run lint -- --max-warnings=0          PASS
npm.cmd run build                             PASS
git diff --check                             PASS (line-ending warnings only)
```

The Front build emitted existing Browserslist/Tailwind ambiguity and chunk-size warnings only.
Backend tests emitted existing Mongoose duplicate-index/reserved-key warnings only.

## Scope and residual risks

- No provider/network call, production DB, dependency install, cache deletion, browser/live run,
  deployment, push, merge, rebase or `main` mutation was performed.
- Receipt/replay/lease behavior remains owned by the existing scheduler composite receipt; this
  task preserves the path and rethrows ownership-loss errors. Provider/live receipt settlement was
  not exercised against a real database.
- Static and focused tests prove code/evidence closure only. They do not prove provider credentials,
  production data shape, Mongo concurrency, deployment, or operational/live closure.
- Parent owns independent review and repository-wide gates.
- Front pre-existing `.claude/settings.local.json` and untracked `scripts/git-hooks/` were preserved
  untouched and unstaged.
