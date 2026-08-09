# Decision Level Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the complete re-engagement level decision policy from `decisionEngine.service.ts` into pure typed modules while preserving side-effect order and dry-run behavior.

**Architecture:** `decisionLevelTypes.ts` defines model-free contracts. `decisionLevelPolicy.ts` normalizes rules and produces a deterministic transition plan from values plus an injected clock. The engine maps its existing context into that input, merges the plan, and keeps each cooldown write and ActiveCampaign execution behind its existing `if (!dryRun)` guard.

**Tech Stack:** TypeScript 5.9, Jest 29, ts-jest, ESLint 10.

## Global Constraints

- Branch `remake`; offline only; no real API, Mongo, or Redis access.
- No `any`, suppression casts, non-null assertions, lint suppressions, dependencies, or lockfile changes.
- Preserve exact decisions, messages, confidence, tag ordering, cooldown duration, and effect order.
- Keep exactly four `if (!dryRun)` guards in `decisionEngine.service.ts`.

---

### Task 1: Characterize pure level behavior

**Files:**
- Create: `tests/services/activeCampaign/decisionLevelPolicy.test.ts`

**Interfaces:**
- Consumes: `buildDecisionLevelPlan(input)` and `splitDecisionRules(rules)`.
- Produces: literal expectations for rule normalization and every transition branch.

- [ ] Write table-driven tests for explicit/automatic levels, condition thresholds, stored/tag level inference, null inactivity, recent progress, return active, first apply, escalation, maintenance, configured/default cooldown, and fixed-clock dates.
- [ ] Run `npx jest --ci --runInBand tests/services/activeCampaign/decisionLevelPolicy.test.ts` and verify RED because the module is absent.

### Task 2: Implement the pure policy

**Files:**
- Create: `src/services/activeCampaign/decisionLevelTypes.ts`
- Create: `src/services/activeCampaign/decisionLevelPolicy.ts`
- Test: `tests/services/activeCampaign/decisionLevelPolicy.test.ts`

**Interfaces:**
- Produces: `DecisionLevelRule`, `DecisionLevelInput`, `DecisionLevelPlan`, `splitDecisionRules`, and `buildDecisionLevelPlan`.
- Imports no model, Mongoose, environment, logger, or API client.

- [ ] Define minimal discriminated and structural types for rules, progress signals, decisions, and plan output.
- [ ] Move threshold extraction, rule splitting, inference, appropriate-level calculation, confidence, and branch planning into pure functions.
- [ ] Run the focused suite and verify GREEN.
- [ ] Temporarily mutate one transition branch, verify focused RED, restore, and verify GREEN.

### Task 3: Integrate the plan without moving effects

**Files:**
- Modify: `src/services/activeCampaign/decisionEngine.service.ts`
- Modify: `tests/services/decisionEngineDryRun.test.ts`

**Interfaces:**
- Consumes: pure split and planning functions.
- Preserves: `DecisionResult`, public methods, cooldown writes, conflict resolution, and ActiveCampaign execution.

- [ ] Replace inline rule helpers and the level branch with pure calls and a thin merge.
- [ ] Keep the existing cooldown write in each branch by exposing the selected transition kind in the plan; do not consolidate guard placement.
- [ ] Add integration characterization for one non-dry-run cooldown branch if absent.
- [ ] Run policy, dry-run, preview, and ops focused suites.

### Task 4: Verify and deliver

**Files:**
- Modify: `docs/HARDENING-WORKPLAN.md`

- [ ] Record measured line counts, module topology, RED/GREEN proof, and remaining ARCH-02 debt.
- [ ] Run `npm run lint:baseline:prune`, lint, types, full offline tests, build, diff-check, purity scans, lockfile diff, and four-guard count.
- [ ] Review staged diff and commit `refactor(activecampaign): extract level policy` with measured evidence.
- [ ] Push the verified commit to `origin/remake`.
