# ARCH-02 Final Six Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the source-size ratchet from six files above 500 lines to zero without changing behavior or public contracts.

**Architecture:** Extract one cohesive responsibility from each residual file and keep its existing path as the compatibility boundary. Pure policies and type contracts move first; Mongo, HTTP, persistence, and batch orchestration remain in their current owners unless the task explicitly identifies an executor boundary.

**Tech Stack:** TypeScript 5.9, Node.js, Express 5, Mongoose, Jest/ts-jest, MongoMemoryServer, ESLint 10.

## Global Constraints

- Work only on `remake`; push only `origin/remake`.
- Offline only; `MONGOMS_RUNTIME_DOWNLOAD=false` for Mongo suites.
- One lowercase Conventional Commit per task.
- RED before production code; focused GREEN before commit.
- Preserve exports, response contracts, model/singleton identity, cache identity, pagination and write order.
- No new `any`, casts-to-silence, non-null assertions, ignores, or suppression debt.
- Remove each completed path from `tests/tooling/sourceFileSizeBaseline.json`; unknown/grown debt fails closed.

---

### Task 1: Split sync conflict HTTP handlers

**Files:**
- Create: `src/controllers/syncStats/conflicts.controller.ts`
- Modify: `src/controllers/syncUtilizadoresControllers/syncStats.controller.ts`
- Test: `tests/controllers/syncStatsTopology.test.ts`

**Interfaces:**
- Produces the existing conflict handler names: `getConflicts`, `getConflictById`, `resolveConflict`, `bulkResolveConflicts`, `autoResolveConflicts`, `ignoreConflict`, `getCriticalConflicts`.
- The legacy controller re-exports the same function objects; `getSyncById` and `getSnapshotStats` remain local.

- [ ] Write a topology test importing both paths and asserting identity for all seven handlers.
- [ ] Run the focused test and verify RED because the focused module does not exist.
- [ ] Move the exact handlers and their required imports without rewriting envelopes or status codes.
- [ ] Run topology, destructive-validation, error-contract and inventory tests; run lint/types.
- [ ] Commit `refactor(sync): split conflict handlers`.

### Task 2: Split ActivitySnapshot contracts

**Files:**
- Create: `src/models/SyncModels/activitySnapshot/contracts.ts`
- Modify: `src/models/SyncModels/ActivitySnapshot.ts`
- Test: `tests/models/activitySnapshotTopology.test.ts`

**Interfaces:**
- Contracts module exports the existing `Platform`, `SnapshotSource`, document/method/model interfaces.
- Legacy model path re-exports all types and preserves default model identity and `modelName === 'ActivitySnapshot'`.

- [ ] Write a topology/type test for named/default identity and the focused contracts import.
- [ ] Run it and verify missing-module RED.
- [ ] Move contracts only; keep schemas, indexes, methods, statics and model creation in the model owner.
- [ ] Run focused model tests, inventories, lint and types.
- [ ] Commit `refactor(models): split activity snapshot contracts`.

### Task 3: Split product-sales aggregation

**Files:**
- Create: `src/services/productSalesStats/aggregation.ts`
- Modify: `src/services/productSalesStatsBuilder.ts`
- Test: `tests/services/productSalesStatsAggregation.test.ts`

**Interfaces:**
- Pure aggregation consumes normalized product/user/enrollment rows and produces the existing per-product counters and totals.
- The builder retains all Mongo reads/writes and calls the pure aggregation boundary.

- [ ] Characterize a representative aggregation including active/inactive, revenue and unmatched rows.
- [ ] Run it and verify missing-module RED.
- [ ] Extract only deterministic aggregation; do not move persistence or invent missing business rules.
- [ ] Run aggregation and existing sales-stat tests, inventories, lint and types.
- [ ] Commit `refactor(analytics): split sales aggregation`.

### Task 4: Split engagement recalculation policy

**Files:**
- Create: `src/services/syncUtilizadoresServices/engagement/recalculationPolicy.ts`
- Modify: `src/services/syncUtilizadoresServices/engagement/recalculate-engagement-metrics.ts`
- Test: `tests/services/syncUtilizadores/recalculationPolicy.test.ts`

**Interfaces:**
- Pure policy owns eligibility and result classification from typed timestamps/metrics.
- Batch size, Mongo cursor/batches, logging, persistence and partial-failure isolation remain in the orchestrator.

- [ ] Characterize current eligibility boundaries and result counters.
- [ ] Run and verify missing-module RED.
- [ ] Extract the exact decisions and use them from the orchestrator.
- [ ] Run focused engagement suites, inventories, lint and types.
- [ ] Commit `refactor(engagement): split recalculation policy`.

### Task 5: Split analytics type domains

**Files:**
- Create: `src/types/analytics/core.ts`
- Create: `src/types/analytics/timeSeries.ts`
- Create: `src/types/analytics/cohorts.ts`
- Create: `src/types/analytics/responses.ts`
- Modify: `src/types/analytics.types.ts`
- Test: `tests/tooling/analyticsTypesTopology.test.ts`

**Interfaces:**
- `analytics.types.ts` remains the compatibility type barrel using `export type *`.
- No runtime value or consumer import changes.

- [ ] Write a compile-time topology test importing representative types from both focused and legacy paths.
- [ ] Run and verify missing-module RED.
- [ ] Move declarations by domain with no duplicate owners or circular imports.
- [ ] Run analytics suites, inventories, lint and types.
- [ ] Commit `refactor(types): split analytics contracts`.

### Task 6: Split student platform calculations

**Files:**
- Create: `src/utils/studentData/hotmart.ts`
- Create: `src/utils/studentData/curseduca.ts`
- Modify: `src/utils/studentDataConsolidator.ts`
- Test: `tests/utils/studentDataConsolidatorTopology.test.ts`

**Interfaces:**
- Focused modules own existing platform-specific progress/engagement calculations.
- Legacy consolidator retains public exports and overall cross-platform composition.

- [ ] Add topology and representative behavior characterization for Hotmart and CursEduca fallbacks.
- [ ] Run and verify missing-module RED.
- [ ] Move exact platform algorithms and typed structural contracts; retain fallback precedence.
- [ ] Run consolidator tests, inventories, lint and types.
- [ ] Commit `refactor(students): split platform consolidation`.

### Task 7: Close ARCH-02

**Files:**
- Modify: `docs/HARDENING-WORKPLAN.md`

- [ ] Confirm `tests/tooling/sourceFileSizeBaseline.json` is `{}` and the fail-closed inventory passes.
- [ ] Run `npm run lint` and `npm run types:check`.
- [ ] Run `$env:MONGOMS_RUNTIME_DOWNLOAD='false'; $env:NODE_ENV='test'; npm test`.
- [ ] Run `npm run build`, `git diff --check`, and verify package/lockfile diffs are empty.
- [ ] Record exact line reductions, suite/test totals, warnings and offline boundaries.
- [ ] Commit `docs(hardening): close source size debt` and push `remake` only after every gate is green.
