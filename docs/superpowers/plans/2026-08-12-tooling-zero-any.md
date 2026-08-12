# Tooling Zero-Any Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all 272 remaining explicit-any suppressions and close Tooling at 100%.

**Architecture:** Treat each shared data boundary as a typed unit. Replace explicit any with model inference, exact DTOs, or unknown plus guards; prune suppressions only after the normal compiler and linter accept each unit.

**Tech Stack:** TypeScript 5, ESLint suppressions, Jest, Mongoose.

## Global Constraints

- Preserve runtime behavior, HTTP contracts, write ordering, and error handling.
- Never add `as any`, inline disables, `ts-ignore`, broad casts, empty catches, or weaker tests.
- A 100% claim requires explicit-any = 0 plus normal lint, types, build, and focused tests.

---

### Task 1: Zero ratchet

**Files:**
- Modify: `tests/tooling/eslintSuppressionBaseline.test.ts`

**Interfaces:**
- Consumes: `eslint-suppressions.json`
- Produces: fail-closed assertion `noExplicitAny === 0`

- [ ] Change the expected explicit-any count from 272 to 0.
- [ ] Run `npm.cmd test -- --runInBand tests/tooling/eslintSuppressionBaseline.test.ts`.
- [ ] Verify RED reports received 272.

### Task 2: Controllers and routes

**Files:**
- Modify: every inventory file under `src/controllers/**` and `src/routes/**` with an explicit-any suppression.
- Modify: `eslint-suppressions.json`

**Interfaces:**
- Consumes: Express request types, controller DTOs, Mongoose filter/pipeline types.
- Produces: typed HTTP boundaries with unchanged responses and statuses.

- [ ] Replace request/query/pipeline anys with exact local DTOs or library types.
- [ ] Narrow caught/external values from unknown before property access.
- [ ] Run focused controller/route contract suites and `npm.cmd run types:check`.
- [ ] Remove only obsolete controller/route suppressions.

### Task 3: Services, jobs, models, and shared types

**Files:**
- Modify: every remaining inventory file under `src/services/**`, `src/jobs/**`, `src/models/**`, and `src/types/**`.
- Modify: `eslint-suppressions.json`

**Interfaces:**
- Consumes: provider payloads, Mongoose documents, internal service DTOs.
- Produces: typed provider/model boundaries without changed ordering or side effects.

- [ ] Replace model proxy casts with actual model method types.
- [ ] Define exact provider DTOs or narrow unknown through record/array/string guards.
- [ ] Preserve sequential writes and partial-failure accounting.
- [ ] Run focused service/job/model suites and `npm.cmd run types:check`.
- [ ] Remove only obsolete service/job/model suppressions.

### Task 4: Terminal verification and reconciliation

**Files:**
- Modify: `docs/HARDENING-WORKPLAN.md`
- Modify: `tests/tooling/eslintSuppressionBaseline.test.ts`
- Create: `docs/superpowers/reports/tooling-zero-any-final.md`

**Interfaces:**
- Consumes: final ESLint inventory and fresh gate output.
- Produces: factual Tooling and macro percentages.

- [ ] Run the zero ratchet and verify GREEN.
- [ ] Mutate one suppression back and verify the ratchet RED, then restore it.
- [ ] Run negative diff scans for escape casts and disables.
- [ ] Run normal lint, TypeScript, build, focused tests, and `git diff --check`.
- [ ] Recalculate Tooling and macro percentages from the final inventory.
- [ ] Commit the implementation without pushing.
