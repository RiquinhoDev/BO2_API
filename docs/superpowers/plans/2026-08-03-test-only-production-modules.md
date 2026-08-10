# Test-only Production Modules Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove two production modules retained only by tests, delete their stale plans/tests, and preserve the verified live successors.

**Architecture:** Execute two independent deletion units. Each unit first proves its target has no production consumer, then uses the target's remaining Jest import as genuine RED evidence, removes the orphaned test/reference, and verifies the live successor remains GREEN. Record final cross-unit evidence only after both code commits exist.

**Tech Stack:** TypeScript 5.9, Jest 29 with ts-jest, ESLint suppression baseline, PowerShell, Git.

## Global Constraints

- Work only on branch `remake`; do not reset, pull, merge, or push.
- Do not execute either removed function or contact MongoDB, ActiveCampaign, Discord, Guru, Hotmart, CursEduca, or another external service.
- Set `MONGOMS_RUNTIME_DOWNLOAD=false` for the full Jest gate.
- Do not install dependencies or modify either lockfile.
- Preserve `src/controllers/tagEvaluation.controller.ts`, its route, all tag evaluators except `applyTags.ts`, `decisionEngine.service.ts`, `tagOrchestrator.service.ts`, `platformEngagementNormalizer.ts`, and their live consumers.
- Preserve historical records under `docs/superpowers/`; only the two named stale root plans are deleted.
- Stop only the affected unit if a production import, dynamic import, `require`, route mount, scheduler registration, job startup, or package command is discovered.
- Do not weaken Jest, lint, TypeScript, build, egress, or secret guards.
- Use `apply_patch` for edits and deletions.
- Commit each deletion unit separately; record final evidence in a third documentation commit.
- Do not modify the sibling Front repository, deployment state, or remote branch.

---

### Task 1: Remove the orphaned ActiveCampaign tag applicator

**Files:**
- Delete: `src/jobs/dailyPipeline/tagEvaluation/applyTags.ts`
- Delete: `tests/jobs/applyTags.test.ts`
- Delete: `INTEGRATION_PLAN.md`
- Delete: `TAG_SYSTEM_V2_IMPLEMENTATION.md`
- Modify: `eslint-suppressions.json`

**Interfaces:**
- Consumes: no production interface; only `tests/jobs/applyTags.test.ts` imports `evaluateAndApplyTags`.
- Produces: no replacement. The existing `tagEvaluation.controller` and `tagOrchestrator.service.ts` remain the live evaluation/application paths.

- [ ] **Step 1: Prove the target is absent from production wiring**

Run:

```powershell
rg -n --glob '*.ts' --glob 'package.json' 'evaluateAndApplyTags|tagEvaluation/applyTags' src package.json
rg -n --glob '*.ts' 'tagEvaluation\.controller|tagOrchestrator' src
```

Expected: the first command finds only definitions/comments inside `applyTags.ts`; the second shows the live controller/route/orchestrator consumers. Any other first-command match stops this unit.

- [ ] **Step 2: Capture the live successor baseline**

Run:

```powershell
npx.cmd jest tests/services/tagOrchestratorActivity.test.ts --runInBand
```

Expected: the focused orchestrator suite passes without real ActiveCampaign access.

- [ ] **Step 3: Delete only the production target and capture RED**

Delete `src/jobs/dailyPipeline/tagEvaluation/applyTags.ts` with `apply_patch`, leaving its test temporarily intact. Run:

```powershell
npx.cmd jest tests/jobs/applyTags.test.ts --runInBand
```

Expected: RED because Jest cannot resolve `../../src/jobs/dailyPipeline/tagEvaluation/applyTags`. This proves the dedicated test is a consumer of the deleted module, not evidence of a production caller.

- [ ] **Step 4: Remove the orphaned test and stale root plans**

Delete with `apply_patch`:

```text
tests/jobs/applyTags.test.ts
INTEGRATION_PLAN.md
TAG_SYSTEM_V2_IMPLEMENTATION.md
```

Do not delete any other file under `src/jobs/dailyPipeline/tagEvaluation/`.

- [ ] **Step 5: Prune only the target's lint suppression**

Run:

```powershell
npm.cmd run lint:baseline:prune
git diff -- eslint-suppressions.json
```

Expected: only the `src/jobs/dailyPipeline/tagEvaluation/applyTags.ts` suppression entry is removed. Restore unrelated hunks with `apply_patch` if present.

- [ ] **Step 6: Prove cleanup and successor preservation**

Run:

```powershell
rg -n --glob '*.ts' --glob 'package.json' 'evaluateAndApplyTags|tagEvaluation/applyTags' src tests package.json
Test-Path src\controllers\tagEvaluation.controller.ts
Test-Path src\services\activeCampaign\tagOrchestrator.service.ts
Get-ChildItem src\jobs\dailyPipeline\tagEvaluation -File -Filter *.ts | Sort-Object Name
npx.cmd jest tests/services/tagOrchestratorActivity.test.ts --runInBand
git diff --check
```

Expected: reference grep empty; both `Test-Path` calls return `True`; twelve remaining tag-evaluation files are listed; the orchestrator suite passes; diff check exits 0.

- [ ] **Step 7: Commit the tag unit**

```powershell
git add src/jobs/dailyPipeline/tagEvaluation/applyTags.ts tests/jobs/applyTags.test.ts INTEGRATION_PLAN.md TAG_SYSTEM_V2_IMPLEMENTATION.md eslint-suppressions.json
git commit -m "chore(tags): remove orphaned applicator" -m "Keep the mounted evaluator and canonical orchestrator while deleting the unregistered ActiveCampaign write path and its stale plans." -m "Co-Authored-By: Codex <codex@openai.com>"
```

Expected: one deletion-unit commit; no push.

---

### Task 2: Remove the orphaned engagement calculator

**Files:**
- Delete: `src/services/syncUtilizadoresServices/engagement/engagementCalculator.service.ts`
- Delete: `tests/services/engagement/engagementCalculator.service.test.ts`
- Modify: `tests/services/users/mongooseUsersV2Comparison.reader.test.ts`

**Interfaces:**
- Consumes: no production interface; its own test imports it, and the Users V2 reader test mocks the path only to assert it is not loaded.
- Produces: no replacement. `platformEngagementNormalizer.ts` remains the live shared normalizer used by Users V2 analytics.

- [ ] **Step 1: Prove zero production imports and identify the negative test reference**

Run:

```powershell
rg -n --glob '*.ts' --glob 'package.json' 'engagementCalculator\.service' src package.json
rg -n 'engagementCalculator\.service|mockEngagementCalculatorModuleLoaded|mockBatchAverage' tests
rg -n 'platformEngagementNormalizer|normalizePlatformEngagement' src
```

Expected: the first command is empty; the second finds the dedicated test plus the negative mock/assertions in `mongooseUsersV2Comparison.reader.test.ts`; the third proves live normalizer consumers.

- [ ] **Step 2: Capture live successor baselines**

Run:

```powershell
npx.cmd jest tests/services/engagement/platformEngagementNormalizer.test.ts tests/services/users/mongooseUsersV2Comparison.reader.test.ts tests/services/users/usersV2OverviewAnalytics.service.test.ts --runInBand
```

Expected: all three suites pass.

- [ ] **Step 3: Delete only the production target and capture RED**

Delete `src/services/syncUtilizadoresServices/engagement/engagementCalculator.service.ts` with `apply_patch`. Run:

```powershell
npx.cmd jest tests/services/engagement/engagementCalculator.service.test.ts tests/services/users/mongooseUsersV2Comparison.reader.test.ts --runInBand
```

Expected: RED module-resolution failures from the dedicated import and the obsolete Jest mock path.

- [ ] **Step 4: Remove the orphaned test and obsolete negative mock**

Delete `tests/services/engagement/engagementCalculator.service.test.ts` with `apply_patch`.

In `tests/services/users/mongooseUsersV2Comparison.reader.test.ts`, remove exactly:

```ts
const mockBatchAverage = jest.fn()
const mockEngagementCalculatorModuleLoaded = jest.fn()
```

Remove the entire `jest.mock` block targeting `engagementCalculator.service`, and remove exactly:

```ts
expect(mockEngagementCalculatorModuleLoaded).not.toHaveBeenCalled()
expect(mockBatchAverage).not.toHaveBeenCalled()
```

Preserve every read-count and result assertion in the test.

- [ ] **Step 5: Prove cleanup and successor preservation**

Run:

```powershell
rg -n --glob '*.ts' --glob 'package.json' 'engagementCalculator\.service|mockEngagementCalculatorModuleLoaded|mockBatchAverage' src tests package.json
rg -n 'platformEngagementNormalizer|normalizePlatformEngagement' src tests
npx.cmd jest tests/services/engagement/platformEngagementNormalizer.test.ts tests/services/users/mongooseUsersV2Comparison.reader.test.ts tests/services/users/usersV2OverviewAnalytics.service.test.ts --runInBand
git diff --check
```

Expected: deleted-path/mock grep empty; live normalizer references remain; all three focused suites pass; diff check exits 0.

- [ ] **Step 6: Commit the engagement unit**

```powershell
git add src/services/syncUtilizadoresServices/engagement/engagementCalculator.service.ts tests/services/engagement/engagementCalculator.service.test.ts tests/services/users/mongooseUsersV2Comparison.reader.test.ts
git commit -m "chore(engagement): remove orphaned calculator" -m "Retain the shared platform normalizer and Users V2 reader while deleting a production service preserved only by tests." -m "Co-Authored-By: Codex <codex@openai.com>"
```

Expected: one deletion-unit commit; no push.

---

### Task 3: Record and verify the complete cleanup

**Files:**
- Modify: `docs/HARDENING-WORKPLAN.md`

**Interfaces:**
- Consumes: the committed tag and engagement deletion evidence from Tasks 1 and 2.
- Produces: the operational record of exact deletions, preserved successors, and fresh gate counts.

- [ ] **Step 1: Run all offline gates on both deletion commits**

Run serially:

```powershell
npm.cmd run lint
npm.cmd run types:check
$env:MONGOMS_RUNTIME_DOWNLOAD='false'; npx.cmd jest --ci --runInBand
npm.cmd run build
```

Expected: every command exits 0. Record exact suite/test and TypeScript ratchet counts. Existing non-failing warnings remain reported, not silently fixed outside scope.

- [ ] **Step 2: Update the workplan with measured evidence**

In `docs/HARDENING-WORKPLAN.md`:

1. remove every active-work reference to `applyTags.ts` from full-scan and unfinished AC-tag work;
2. add a checked dead-code item recording 438 production lines, 260 dedicated test lines, and 914 stale root-document lines removed;
3. record that the obsolete Users V2 negative mock was removed while the real reader assertions remain;
4. name the preserved tag controller/evaluators/orchestrator and platform normalizer/Users V2 consumers;
5. record zero live references, focused RED/GREEN evidence, exact final gate counts, and confirmation that no removed function, production database, or external API ran.

- [ ] **Step 3: Run final structural checks**

Run:

```powershell
git diff --check
git status --short
git ls-files INTEGRATION_PLAN.md TAG_SYSTEM_V2_IMPLEMENTATION.md src/jobs/dailyPipeline/tagEvaluation/applyTags.ts src/services/syncUtilizadoresServices/engagement/engagementCalculator.service.ts
rg -n --glob '*.ts' --glob 'package.json' 'evaluateAndApplyTags|tagEvaluation/applyTags|engagementCalculator\.service|mockEngagementCalculatorModuleLoaded|mockBatchAverage' src tests package.json
```

Expected: no whitespace errors; only the workplan is uncommitted; `git ls-files` and the live-reference grep are empty.

- [ ] **Step 4: Commit the operational record**

```powershell
git add docs/HARDENING-WORKPLAN.md
git commit -m "docs(dead-code): record test-only cleanup" -m "Capture preserved runtime successors and fresh offline gates after removing both orphaned production modules." -m "Co-Authored-By: Codex <codex@openai.com>"
```

Expected: commit succeeds; `git status -sb` is clean and shows `remake` ahead of `origin/remake`. Do not push.
