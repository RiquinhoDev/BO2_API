# Controller Monolith Batch Design

## Goal

Reduce the fail-closed source-size debt from 30 to 26 by decomposing four large, live controllers without changing their HTTP contracts, persistence order, external boundaries, or route exports.

## Scope

- `guru.analytics.controller.ts` (995 lines): split churn, MRR, and comparison/reconciliation responsibilities.
- `engagement.controller.ts` (966 lines): split global statistics, user/detail queries, and cache ownership.
- `guru.snapshot.controller.ts` (944 lines): split CRUD handlers, historical construction, and snapshot policy helpers.
- `syncUtilizadoresControllers/cronManagement.controller.ts` (904 lines): split queries, commands, tag-rule lookup, and scheduler operations.

The existing controller path remains a compatibility facade for every mounted consumer. No route, payload, status code, authorization boundary, environment/config read, database operation, or external integration is added or removed.

## Architecture

Each monolith is decomposed along existing handler and helper seams. Shared contracts/helpers move to a focused support module only when used by more than one extracted owner. The facade re-exports the exact handler identities from the focused modules. Every handwritten production file must remain at or below 500 physical lines.

## Safety and verification

Each target starts with a topology characterization that fails because the focused owners do not exist. Existing behavioral tests remain authoritative. After extraction, TypeScript, lint, the focused tests, the source-size ratchet, and `git diff --check` must pass before its lowercase Conventional Commit. Existing ESLint suppressions may be relocated but not increased. Final verification runs the complete offline Jest suite with `MONGOMS_RUNTIME_DOWNLOAD=false`, lint, TypeScript, build, lockfile diff, and remote parity on `origin/remake`.

No real API, MongoDB, Redis, scheduler, deployment, or production system may be contacted.
