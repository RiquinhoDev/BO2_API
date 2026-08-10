# Decision Condition Evaluator Extraction Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the condition language from `decisionEngine.service.ts` into focused, pure, typed modules without changing rule, dry-run, cooldown, or tag-execution behavior.

**Architecture:** A minimal value contract isolates the evaluator from Mongoose. A metric-predicate module owns the allowed field/operator matrix, while a parser module preserves the current precedence (`&&`, then `||`, then legacy textual `AND`, then simple expressions) and fail-closed behavior. `DecisionEngine` remains the orchestration boundary and only maps its context into the pure input.

**Tech Stack:** TypeScript 5.9, Jest 29, ts-jest, ESLint 10.

## Global Constraints

- Work only on branch `remake`.
- Remain fully offline: no real APIs, Mongo, or Redis.
- Preserve the four `if (!dryRun)` guards, `setCooldown`, and `executeDecisions` semantics.
- Add no `any`, casts used as suppressions, non-null assertions, lint suppressions, dependencies, or lockfile changes.
- One lowercase Conventional Commit; push only after the full gate is green.

---

### Task 1: Characterize the condition language

**Files:**
- Create: `tests/services/activeCampaign/decisionConditionEvaluator.test.ts`

**Interfaces:**
- Consumes: planned `evaluateDecisionCondition(condition, values, onUnknown?)`.
- Produces: a behavior matrix covering every supported field/operator, null defaults, logical precedence, parentheses handling, legacy textual `AND`, and unknown fail-closed behavior.

- [ ] **Step 1: Write the failing tests**

Import the planned evaluator and assert the exact current compatibility matrix: `daysInactive` aliases login days; `lastAccessDate` aliases action days; all six primary numeric fields support `>=`, `>`, `<`, and `===`; engagement supports `<` and `>=`; totals support `>=`; `&&` has priority over `||`; textual `AND` retains its narrower legacy field set; missing conditions and unknown expressions return `false`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx jest --ci --runInBand tests/services/activeCampaign/decisionConditionEvaluator.test.ts`

Expected: FAIL because the evaluator module does not exist.

### Task 2: Implement the pure evaluator

**Files:**
- Create: `src/services/activeCampaign/decisionConditionTypes.ts`
- Create: `src/services/activeCampaign/decisionMetricPredicates.ts`
- Create: `src/services/activeCampaign/decisionConditionEvaluator.ts`
- Test: `tests/services/activeCampaign/decisionConditionEvaluator.test.ts`

**Interfaces:**
- Produces: `DecisionConditionValues`, `evaluateMetricPredicate(expression, values, allowedFields?)`, and `evaluateDecisionCondition(condition, values, onUnknown?)`.
- Consumes: no Mongoose models, network clients, environment, or logger.

- [ ] **Step 1: Define the typed value contract**

Use numeric/null fields only. Map absent login/action dates to `Number.NaN`; preserve enrollment/progress/module/engagement/total defaults.

- [ ] **Step 2: Implement the field/operator whitelist**

Parse only anchored integer comparisons supported by the legacy engine. Return an explicit unrecognized result rather than evaluating arbitrary JavaScript.

- [ ] **Step 3: Implement logical composition**

Preserve the current precedence and split behavior. Invoke `onUnknown` for unrecognized leaf conditions and return `false`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the Task 1 command. Expected: all cases pass.

- [ ] **Step 5: Prove test sensitivity**

Temporarily mutate `&&` aggregation from `every` to `some`; rerun the focused suite and capture the expected failure. Restore it and rerun GREEN.

### Task 3: Integrate and remove the inline evaluator

**Files:**
- Modify: `src/services/activeCampaign/decisionEngine.service.ts`
- Modify: `tests/services/decisionEngineDryRun.test.ts` only if integration characterization is missing.

**Interfaces:**
- Consumes: `evaluateDecisionCondition`.
- Preserves: `evaluateRule` result contract and all side-effect ordering.

- [ ] **Step 1: Map the existing context to `DecisionConditionValues`**

Pass engagement metrics plus `userProduct.progress.percentage/currentModule`. Keep unknown-condition logging at the engine boundary through the callback.

- [ ] **Step 2: Delete the 500-line inline parser**

Replace `evaluateCondition` with a thin synchronous delegation (the async caller may continue awaiting it for compatibility).

- [ ] **Step 3: Run focused regression suites**

Run the evaluator suite and `tests/services/decisionEngineDryRun.test.ts`. Expected: GREEN, with all dry-run write guards unchanged.

### Task 4: Verify, document, and deliver

**Files:**
- Modify: `docs/HARDENING-WORKPLAN.md`

- [ ] **Step 1: Record measured line-count and topology changes**

Document the new pure modules, characterization proof, and that ARCH-02 remains open for the residual engine.

- [ ] **Step 2: Run the complete offline gate**

Run: `npm run lint:baseline:prune`, `npm run lint`, `npm run types:check`, `MONGOMS_RUNTIME_DOWNLOAD=false npm test`, `npm run build`, `git diff --check`, lockfile diff, purity greps, and dry-run guard count.

- [ ] **Step 3: Review and commit**

Review the full staged diff. Commit with `refactor(activecampaign): extract condition evaluator` and a body containing before/after line counts and RED/GREEN evidence.

- [ ] **Step 4: Push**

Push the verified commit to `origin/remake`; use the repository's explicit remake push confirmation environment variable if the hook requires it.
