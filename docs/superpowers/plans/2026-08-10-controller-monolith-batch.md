# Controller Monolith Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace four controllers above 900 lines with compatible facades and cohesive focused modules, reducing source-size debt from 30 to 26.

**Architecture:** Preserve the original controller import paths as facades. Move existing handlers and their private helpers by responsibility, preserving statement order and public behavior. Characterize facade identity before extraction and use the existing behavioral suites as the semantic safety net.

**Tech Stack:** TypeScript 5.9, Express 5, Mongoose, Jest/ts-jest, ESLint 10.

## Global Constraints

- Work only on branch `remake`; push only `origin/remake`.
- No production file may exceed 500 physical lines after extraction.
- No behavior, response envelope, status, route export, side-effect order, or integration boundary changes.
- Zero real API, MongoDB, Redis, scheduler, deployment, or network calls.
- One lowercase Conventional Commit per original monolith.
- No new `any`, cast-to-silence, non-null assertion, ignore, or suppression debt.

---

### Task 1: Split Guru analytics controller

**Files:**
- Modify: `src/controllers/guru.analytics.controller.ts`
- Create: focused modules under `src/controllers/guruAnalytics/`
- Test: `tests/controllers/guruAnalyticsTopology.test.ts`

**Interfaces:**
- Consumes: existing models/services and Express handler signatures.
- Produces: the same six named handler exports from the legacy controller path.

- [ ] Write a failing topology test importing the planned focused owners and asserting facade identity.
- [ ] Run it and confirm missing-module RED.
- [ ] Move churn, MRR, and comparison/reconciliation handlers plus only their required helpers.
- [ ] Run TypeScript, lint, focused Guru analytics tests, source-size ratchet, and diff check.
- [ ] Prune the obsolete size entry and commit `refactor(guru): split analytics controller`.

### Task 2: Split engagement controller

**Files:**
- Modify: `src/controllers/engagement.controller.ts`
- Create: focused modules under `src/controllers/engagement/`
- Test: `tests/controllers/engagementTopology.test.ts`

**Interfaces:**
- Consumes: existing analytics models, cache semantics, and Express signatures.
- Produces: the same five handler exports and shared cache instance behavior.

- [ ] Write and verify the missing-focused-module RED topology test.
- [ ] Extract cache/support, global summaries, user details, and per-user details without changing cache keys/TTL.
- [ ] Run TypeScript, lint, focused engagement tests, source-size ratchet, and diff check.
- [ ] Prune the obsolete size entry and commit `refactor(engagement): split controller responsibilities`.

### Task 3: Split Guru snapshot controller

**Files:**
- Modify: `src/controllers/guru.snapshot.controller.ts`
- Create: focused modules under `src/controllers/guruSnapshots/`
- Test: `tests/controllers/guruSnapshotTopology.test.ts`

**Interfaces:**
- Consumes: existing snapshot models/services and destructive DTOs.
- Produces: the same eight handler exports plus `mapStatus`.

- [ ] Write and verify the missing-focused-module RED topology test.
- [ ] Extract CRUD, historical builder/policies, and historical handlers while preserving date/status logic and write order.
- [ ] Run TypeScript, lint, focused snapshot/security tests, source-size ratchet, and diff check.
- [ ] Prune the obsolete size entry and commit `refactor(guru): split snapshot controller`.

### Task 4: Split cron-management controller

**Files:**
- Modify: `src/controllers/syncUtilizadoresControllers/cronManagement.controller.ts`
- Create: focused modules under `src/controllers/syncUtilizadoresControllers/cronManagement/`
- Test: `tests/controllers/cronManagementTopology.test.ts`

**Interfaces:**
- Consumes: existing scheduler/service/model boundaries and Express signatures.
- Produces: the same eleven named handler exports.

- [ ] Write and verify the missing-focused-module RED topology test.
- [ ] Extract read handlers, mutation handlers, tag-rule lookup, and scheduler operations without changing next/error behavior.
- [ ] Run TypeScript, lint, focused cron tests, source-size ratchet, and diff check.
- [ ] Prune the obsolete size entry and commit `refactor(cron): split management controller`.

### Task 5: Final gate and progress record

**Files:**
- Modify: `docs/HARDENING-WORKPLAN.md`

- [ ] Record exact before/after line counts and the 30-to-26 ratchet reduction.
- [ ] Run `npm run lint`, `npm run types:check`, offline full Jest, `npm run build`, diff and lockfile checks.
- [ ] Commit the documentation and any mechanically relocated fail-closed inventories.
- [ ] Push only `origin/remake`, verify local/remote HEAD equality, and report the complete eight-pillar progress table.
