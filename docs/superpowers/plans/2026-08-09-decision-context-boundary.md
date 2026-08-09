# Decision Context Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `decisionEngine.service.ts` to at most 500 physical lines by extracting context loading, persisted-rule adaptation and metric calculation without changing behavior.

**Architecture:** A narrow Mongoose-backed loader produces one typed decision context. A model-free metric calculator derives the existing values from that context, an injected clock and activity reader. The engine keeps orchestration, cooldown writes, dry-run guards, rule evaluation and ActiveCampaign effects.

**Tech Stack:** TypeScript 5.9 strict, Mongoose, Jest 29, ts-jest, MongoMemoryServer offline.

## Global Constraints

- Work only on `remake`; never deploy or access real APIs, MongoDB or Redis.
- No `any`, casts used to silence types, non-null assertions, suppressions or new dependencies.
- Preserve all public responses, queries, defaults, write ordering and exactly four `if (!dryRun)` guards.
- Every handwritten TypeScript file in this change must have at most 500 physical lines.

---

### Task 1: Characterize rule adaptation

**Files:**
- Create: `tests/services/activeCampaign/decisionContextLoader.test.ts`
- Create: `src/services/activeCampaign/decisionContextTypes.ts`
- Create: `src/services/activeCampaign/decisionContextLoader.ts`
- Modify: `src/services/activeCampaign/decisionEngine.service.ts`

**Interfaces:**
- Produces: `loadDecisionContext(userId, productId, repositories): Promise<DecisionContext>`.
- Produces: shared `DecisionContext`, `DecisionUserProduct`, `InternalRule` contracts.

- [ ] Write tests that preserve missing-record failure and adaptation of string and structured TagRule conditions, actions, tags, priority, levels and cooldowns.
- [ ] Run the focused test before implementation and confirm failure because the loader does not exist.
- [ ] Implement narrow repository ports, Mongoose runtime adapter and exact persisted-rule adaptation.
- [ ] Mutate one adaptation rule, confirm semantic RED, restore and confirm GREEN.
- [ ] Rewire the engine to consume the loader without moving any effects.
- [ ] Run context, condition, level-policy and dry-run tests.

### Task 2: Extract pure decision metrics

**Files:**
- Create: `tests/services/activeCampaign/decisionMetrics.test.ts`
- Create: `src/services/activeCampaign/decisionMetrics.ts`
- Modify: `src/services/activeCampaign/decisionEngine.service.ts`

**Interfaces:**
- Consumes: `DecisionContext` from Task 1.
- Produces: `calculateDecisionMetrics(context, dependencies): Promise<DecisionMetrics>`.

- [ ] Write tests for stored engagement values, learner-activity null semantics, enrollment fallback, login/action totals and injected-clock day calculations.
- [ ] Run the focused test and confirm failure because the calculator does not exist.
- [ ] Implement the model-free calculator with injected `now` and learner-activity reader.
- [ ] Mutate one date/engagement decision, confirm RED, restore and confirm GREEN.
- [ ] Rewire the engine and remove the old metric/date methods.
- [ ] Negative-scan the calculator for models, Mongoose, APIs, environment reads, `any`, casts and suppressions.

### Task 3: Enforce the architecture limit and close the block

**Files:**
- Modify: `docs/HARDENING-WORKPLAN.md`
- Create: `tests/tooling/sourceFileSizeInventory.test.ts`

**Interfaces:**
- Produces: a machine-checked failure when a handwritten `src/**/*.ts` file newly crosses 500 physical lines, while tracking the existing 39-file migration baseline.

- [ ] Characterize the current above-500 inventory as a path-keyed baseline and prove the guard names and rejects a synthetic clean file that crosses 500 lines.
- [ ] Record the approved `<=500` rule and the `39 -> 0` baseline in the workplan.
- [ ] Confirm `decisionEngine.service.ts <= 500` and every new module in this block is within the limit.
- [ ] Run `npm run lint`, `npm run types:check`, complete Jest with `MONGOMS_RUNTIME_DOWNLOAD=false`, `npm run build`, `git diff --check` and lockfile diff.
- [ ] Commit with a lowercase Conventional Commit and push deliberately to `origin/remake`.
