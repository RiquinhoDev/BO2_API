# Dead one-off scripts cleanup design

## Context

`src/scripts/` contains sixteen top-level TypeScript programs with no inbound
reference from production source, tests, route registration, job startup, or
`package.json`. They still compile into `dist`, carry lint suppressions, and
include stale personal identifiers, direct database mutations, and calls to
external services.

Two scripts under `src/scripts/maintenance/` are different: each has an
explicit `package.json` command, focused tests, documentation, and a guarded
operational procedure. They remain live.

## Decision

Delete all sixteen unregistered top-level programs as one dead-code unit:

- `add-discord-id.ts`
- `add-discord-id-joao.ts`
- `check-student.ts`
- `clean-duplicate-classes.ts`
- `diagnose-classes.ts`
- `find-joao-turma.ts`
- `fix-status-inconsistencies.ts`
- `get-joao-class.ts`
- `investigate-classes.ts`
- `migrateWebhookSource.ts`
- `sync-status-from-userproducts.ts`
- `test-discord-assignrole.ts`
- `test-discord-inactivation.ts`
- `test-final-joao.ts`
- `test-inactivation-flow.ts`
- `test-joao-complete.ts`

This removes 1,789 source lines. It does not remove the live controller export
also named `migrateWebhookSource`.

## Long-term boundary

A production-adjacent script belongs in the repository only when it has all of
the following:

1. an explicit package command or documented runtime entrypoint;
2. an owner and current runbook;
3. safe defaults, with writes or external calls disabled unless explicitly
   enabled;
4. focused tests for its guard and core behavior.

Unregistered personal investigations and one-time repair programs are not an
archive. Git history is the recovery mechanism.

## Repository changes

- Delete the sixteen top-level files from `src/scripts/`.
- Keep both files under `src/scripts/maintenance/` unchanged.
- Remove the corresponding entries from `eslint-suppressions.json`.
- Update `docs/HARDENING-WORKPLAN.md` so its full-scan classification no longer
  names removed scripts and record the completed sweep with fresh evidence.
- Do not touch root `scripts/`, runtime routes, scheduled jobs, maintenance
  commands, lockfiles, or the sibling Front repository.

## Safety and validation

No removed program will be executed. Validation is entirely offline:

1. prove no static import, export-from, literal dynamic import, literal
   `require`, route mount, job registration, test import, or package command
   references any removed path;
2. prove all sixteen source files are absent and both maintenance scripts are
   present;
3. prune only their lint suppressions;
4. run `npm.cmd run lint`, `npm.cmd run types:check`,
   `npx.cmd jest --ci --runInBand`, and `npm.cmd run build`;
5. inspect the final diff and run `git diff --check`.

Any discovered live consumer stops deletion of that specific script. A gate
regression is fixed without weakening tests, lint, type checks, or egress
guards.

## Delivery

The implementation is one auditable dead-code commit because the files share
one invariant: they are unregistered standalone entrypoints. Documentation and
lint-baseline cleanup ship in the same commit so the repository never records
a knowingly stale intermediate state. No push is included.
