# Task 1 report — dead one-off scripts

Date: 2026-08-03
Base: `acad300fa7dad9c227521739029ed30efed7a047`

## RED

Command:

```text
npx.cmd jest tests/tooling/registeredScripts.test.ts --runInBand
```

Expected failure (`Received + 18`) listed exactly these sixteen unregistered paths:

```text
src/scripts/add-discord-id-joao.ts
src/scripts/add-discord-id.ts
src/scripts/check-student.ts
src/scripts/clean-duplicate-classes.ts
src/scripts/diagnose-classes.ts
src/scripts/find-joao-turma.ts
src/scripts/fix-status-inconsistencies.ts
src/scripts/get-joao-class.ts
src/scripts/investigate-classes.ts
src/scripts/migrateWebhookSource.ts
src/scripts/sync-status-from-userproducts.ts
src/scripts/test-discord-assignrole.ts
src/scripts/test-discord-inactivation.ts
src/scripts/test-final-joao.ts
src/scripts/test-inactivation-flow.ts
src/scripts/test-joao-complete.ts
```

## GREEN

After deleting exactly the sixteen files, the same command passed:

```text
PASS tests/tooling/registeredScripts.test.ts
Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
```

## Mutation proof

The filter was deliberately changed from `&&` to `||`. The test failed and listed both preserved maintenance
programs:

```text
src/scripts/maintenance/backfill-ac-webhook-receipt-leases.ts
src/scripts/maintenance/ensure-users-v2-indexes.ts
```

The `&&` expression was restored and the focused test passed again.

## Deletion and registry evidence

- The sixteen deleted files contained 1,789 source lines in total.
- `tests/tooling/registeredScripts.test.ts` recursively scans `src/scripts/**/*.ts` and requires either the
  source path or its `dist/*.js` path in `package.json#scripts`.
- Top-level `src/scripts` listing: empty (`TOP_LEVEL_COUNT=0`).
- Maintenance listing: exactly `backfill-ac-webhook-receipt-leases.ts` and `ensure-users-v2-indexes.ts`;
  `MAINTENANCE_DIFF_COUNT=0`.

## Negative grep

The sixteen exact filenames were searched across `src`, `tests`, root `scripts`, and `package.json`:

```text
NEGATIVE_GREP=zero path references across src/tests/scripts/package.json
```

The two stale full-scan exceptions were removed from this workplan; no remaining workplan references name either
deleted full-scan program.

## Suppression diff

`npm.cmd run lint:baseline:prune` exited 0. Its only changes were removal of the sixteen `src/scripts/*.ts`
entries from `eslint-suppressions.json`; no unrelated suppression hunk was retained.

## Full gates

All gates ran serially and passed:

```text
npm.cmd run lint
  exit 0

npm.cmd run types:check
  Ratchet TypeScript respeitado: 0 erros em 0 ficheiros: {}

$env:MONGOMS_RUNTIME_DOWNLOAD='false'; npx.cmd jest --ci --runInBand
  Test Suites: 1 skipped, 161 passed, 161 of 162 total
  Tests:       2 skipped, 812 passed, 814 total

npm.cmd run build
  prebuild types:check: 0 erros em 0 ficheiros; tsc exit 0
```

## Diff review

`git diff --check` exited 0 (only the repository's LF/CRLF normalization warnings). The complete diff was
reviewed: sixteen deletions, the registry test, the suppression prune, the two workplan updates, and this report;
no maintenance, root `scripts/`, runtime route, scheduled-job, or sibling Front files changed.

## Offline / no-egress evidence

No removed program was executed. The Jest setup kept the egress guard active and the full gate used
`MONGOMS_RUNTIME_DOWNLOAD=false`; no production MongoDB or ActiveCampaign, Discord, Guru, Hotmart, or CursEduca
API was contacted. Any database exercised by tests was local/ephemeral only.

## Round 1/5 review correction

Review finding: `docs/HARDENING-WORKPLAN.md` still listed deleted `scripts/diagnose-classes.ts:127` as a live
false positive. The stale entry was removed while retaining the remaining live false positives
(`populateHistory.controller.ts`, `contactTagReader.service.ts`, and `routes/discordRenewal.routes.ts`). This
matches the design requirement that the full-scan classification no longer names removed scripts.

Checks after the correction:

```text
WORKPLAN_NEGATIVE_GREP=zero references for all 16 deleted names
git diff --check: exit 0 (LF/CRLF normalization warning only)
```
