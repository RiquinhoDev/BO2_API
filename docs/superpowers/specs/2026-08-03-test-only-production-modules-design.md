# Test-only production modules cleanup design

## Context

The previous sweep removed unregistered standalone scripts and added a guard
for that entrypoint boundary. A fresh source scan now leaves two different
production modules with no production consumer:

- `src/jobs/dailyPipeline/tagEvaluation/applyTags.ts` is not imported by a
  route, runtime, scheduler, job, package command, or other production module.
  Only its dedicated Jest test and stale planning documents import or describe
  it.
- `src/services/syncUtilizadoresServices/engagement/engagementCalculator.service.ts`
  has no import in `src/`. Its dedicated Jest test imports it, while the Users
  V2 reader test mocks the path specifically to prove that the reader does not
  load it.

The live successors are distinct and remain in place: the tag evaluation
controller and pure evaluators, `tagOrchestrator.service.ts`, and
`platformEngagementNormalizer.ts` with its Users V2 consumers.

## Decision

Delete both test-only production modules and the tests that exist only for
them. Deliver the cleanup as two independently reviewable units.

### Unit 1: orphaned tag applicator

Delete:

- `src/jobs/dailyPipeline/tagEvaluation/applyTags.ts` (265 lines);
- `tests/jobs/applyTags.test.ts` (178 lines);
- `INTEGRATION_PLAN.md` (468 lines);
- `TAG_SYSTEM_V2_IMPLEMENTATION.md` (446 lines).

Remove the corresponding `no-explicit-any` suppression and stale workplan
references. The two root documents are unreferenced January 2026 plans for an
integration that never became a runtime entrypoint. Git history is their
archive.

Do not delete or alter the live `tagEvaluation.controller`, its route, the
remaining `tagEvaluation/` evaluators, the decision engine, or the canonical
tag orchestrator.

### Unit 2: orphaned engagement calculator

Delete:

- `src/services/syncUtilizadoresServices/engagement/engagementCalculator.service.ts`
  (173 lines);
- `tests/services/engagement/engagementCalculator.service.test.ts` (82 lines).

Remove the obsolete mock and the two assertions that only prove the Users V2
comparison reader does not load this module. Preserve the reader's real
two-read behavior test. Historical specs under `docs/superpowers/` stay
unchanged because they record how the live platform normalizer was extracted.

Do not delete or alter `platformEngagementNormalizer.ts`, its focused test, or
the live Users V2 analytics consumer.

## Long-term boundary

A module under `src/` must have a production consumer or a documented,
registered operational entrypoint. A Jest import cannot by itself justify
shipping a production module. Tests that only preserve an already-orphaned
implementation leave together with that implementation.

Historical design records belong under `docs/superpowers/`. Unreferenced root
plans that describe an abandoned integration are removed rather than kept as
an apparent current runbook.

## Safety and validation

No removed function will be executed. Validation is entirely offline and must
not contact MongoDB, ActiveCampaign, Discord, Guru, Hotmart, CursEduca, or any
other external service.

Before each deletion unit:

1. prove zero production imports, dynamic imports, `require` calls, mounts,
   scheduler registrations, and package commands for the target path;
2. run the focused tests of the live successors as a baseline;
3. stop only that unit if a live consumer is discovered.

After each unit:

1. prove the deleted paths and exports have zero live references;
2. prove the named successors still exist and retain their consumers;
3. run the focused successor tests;
4. inspect the diff and run `git diff --check`;
5. commit the unit separately.

After both units, run `npm.cmd run lint`, `npm.cmd run types:check`,
`npx.cmd jest --ci --runInBand` with `MONGOMS_RUNTIME_DOWNLOAD=false`, and
`npm.cmd run build`. The egress guard remains active. No test, lint, type, or
build rule may be weakened.

## Delivery

Expected direct deletion is 438 production lines, 260 dedicated test lines,
and 914 stale root-document lines, before suppression and obsolete mock
cleanup. Update `docs/HARDENING-WORKPLAN.md` with measured evidence and the
fresh final gate counts. Do not modify lockfiles, runtime contracts, routes,
the sibling Front repository, deployment state, or the remote branch. No push
is included.
