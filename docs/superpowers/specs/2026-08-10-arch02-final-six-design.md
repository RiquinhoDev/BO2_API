# ARCH-02 Final Six Design

## Goal

Reduce the fail-closed source-size baseline from six files to zero without changing runtime behavior, public imports, HTTP contracts, model identity, singleton identity, persistence ordering, or external-integration boundaries.

## Boundaries

- `syncStats.controller.ts`: move conflict handlers behind a focused controller and retain compatibility re-exports.
- `ActivitySnapshot.ts`: move TypeScript contracts out of the schema/model owner; retain the exact Mongoose model instance.
- `productSalesStatsBuilder.ts`: separate pure sales aggregation from orchestration/persistence.
- `recalculate-engagement-metrics.ts`: separate eligibility/result policy from batch orchestration.
- `analytics.types.ts`: split type declarations into domain files and retain a compatibility type barrel.
- `studentDataConsolidator.ts`: separate Hotmart/CursEduca calculation helpers from public consolidation orchestration.

## Invariants

- Branch is `remake`; commits and pushes target only `origin/remake`.
- No real API, production MongoDB, Redis, Discord, scheduler, or deployment access.
- Every production extraction starts with a focused RED topology or behavior test.
- Every resulting handwritten production TypeScript file is at most 500 physical lines.
- No new `any`, cast-to-silence, non-null assertion, ignore, or suppression debt.
- Existing exports, Mongoose identities, response envelopes, data ordering, pagination, and write ordering remain unchanged.
- One lowercase Conventional Commit per source monolith.

## Verification

Each task runs its focused characterization, source-size inventory, production-boundary inventory, lint, and TypeScript. The final gate runs the complete offline Jest suite and build, verifies unchanged lockfiles, updates the hardening workplan, and pushes only after all evidence is green.

## Out of scope

ARCH-03 response-envelope normalization. The final six are behavior-preserving architecture work; response contracts remain untouched.
