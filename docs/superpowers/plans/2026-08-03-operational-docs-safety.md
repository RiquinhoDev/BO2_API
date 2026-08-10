# Operational Documentation Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove destructive and production-facing instructions from current operational documentation while retaining a verified, concise tag-monitoring code reference.

**Architecture:** One documentation-only task replaces a mixed stale runbook in place, deletes a superseded dead-code handoff, updates the curated index, and records scoped proof in the hardening workplan. Runtime code and historical archives remain unchanged.

**Tech Stack:** Markdown, ripgrep, Git, npm scripts, Jest, ESLint, TypeScript.

## Global Constraints

- Work only on branch `remake`.
- Do not execute document commands, install dependencies, use network access, call real APIs, connect to MongoDB, seed data, deploy, or push.
- Do not modify runtime source, tests, route contracts, package metadata, or `docs/archive/`.
- Preserve `docs/TAG_MONITORING_BACKEND_DOCUMENTATION.md` as the stable reference path.
- Scope negative operational-command claims to the touched current documentation; historical plans/specs/archive are records and may contain old command text.
- Keep commits lowercase Conventional Commits.

---

### Task 1: Safe operational documentation surface

**Files:**
- Rewrite: `docs/TAG_MONITORING_BACKEND_DOCUMENTATION.md`
- Delete: `docs/HANDOFF_SWEEP_CODIGO_MORTO.md`
- Modify: `docs/README.md`
- Modify: `docs/HARDENING-WORKPLAN.md`

**Interfaces:**
- Consumes: verified tag-monitoring paths under `src/models/tagMonitoring/`, `src/services/tagMonitoring/`, `src/controllers/tagMonitoring/`, `src/routes/tagMonitoring.routes.ts`, `src/jobs/weeklyTagSnapshot.job.ts`, and the scheduler dispatch branch for named CronJobConfig jobs in `src/services/cron/scheduler.ts`.
- Produces: a stable, non-executable tag-monitoring reference and scoped hardening evidence with no destructive Git, direct database, seed, network, or real-integration instructions.

- [ ] **Step 1: Capture the unsafe baseline without executing it**

Run static searches only:

```powershell
rg -n 'db\.|reset --hard|git fetch|\bcurl\b|\bnpx\b|ACTIVECAMPAIGN|seedWeeklyTagMonitoringJob|C:\\Users\\' docs/TAG_MONITORING_BACKEND_DOCUMENTATION.md docs/HANDOFF_SWEEP_CODIGO_MORTO.md
```

Expected: non-zero matches, including `db.weekly_native_tag_snapshots.createIndex` and `git reset --hard origin/remake`.

- [ ] **Step 2: Prove the handoff is superseded and unreferenced**

Run:

```powershell
rg -n --pcre2 '\[[^]]+\]\([^)]*HANDOFF_SWEEP_CODIGO_MORTO\.md[^)]*\)' docs -g '*.md' -g '!HARDENING-WORKPLAN.md' -g '!superpowers/plans/**' -g '!superpowers/specs/**'
rg -n 'SWEEP|código morto|dead code' docs/HARDENING-WORKPLAN.md
```

Expected: no live Markdown-link match in the active docs search (no output, exit 1); the workplan remains the current dead-code authority, while workplan/plan/spec filename mentions are classified as records.

- [ ] **Step 3: Rewrite the tag reference and delete the stale handoff**

Replace the tag document with concise sections for status, verified runtime map, request/auth contract pointers, scheduled job, offline verification, operator safety boundary, and maintenance rule. Include no executable Mongo/ActiveCampaign/deployment/seed/`curl` examples. Delete the obsolete handoff.

- [ ] **Step 4: Update current documentation authorities**

Change `docs/README.md` so the tag document is described as a code reference rather than an operational runbook. In `docs/HARDENING-WORKPLAN.md`, record the exact files removed/rewritten, line counts measured from Git, scoped forbidden-pattern result, and that no document command or external system was executed.

- [ ] **Step 5: Run focused static verification**

Run:

```powershell
rg -n 'db\.|reset --hard|git fetch|\bcurl\b|\bnpx\b|ACTIVECAMPAIGN|seedWeeklyTagMonitoringJob|C:\\Users\\' docs/TAG_MONITORING_BACKEND_DOCUMENTATION.md docs/README.md
rg -n --pcre2 '\[[^]]+\]\([^)]*HANDOFF_SWEEP_CODIGO_MORTO\.md[^)]*\)' docs -g '*.md' -g '!HARDENING-WORKPLAN.md' -g '!superpowers/plans/**' -g '!superpowers/specs/**'
rg -n 'WeeklyTagSnapshot' src/jobs/weeklyTagSnapshot.job.ts src/services/cron/scheduler.ts
git diff --check
```

Expected: the forbidden-pattern search has zero matches; the active-doc Markdown-link search has no output (exit 1); live job dispatch references remain, and `git diff --check` exits 0.

- [ ] **Step 6: Run repository gates offline**

Run serially:

```powershell
npm.cmd run lint
npm.cmd run types:check
$env:MONGOMS_RUNTIME_DOWNLOAD='false'; npm.cmd test -- --ci --runInBand
npm.cmd run build
```

Expected: all commands exit 0 without a Mongo binary download or external integration call.

- [ ] **Step 7: Commit the implementation**

```powershell
git add docs/TAG_MONITORING_BACKEND_DOCUMENTATION.md docs/HANDOFF_SWEEP_CODIGO_MORTO.md docs/README.md docs/HARDENING-WORKPLAN.md
git commit -m "docs: remove unsafe runbook commands"
```

### Task 2: Independent review and closure

**Files:**
- Modify: `docs/HARDENING-WORKPLAN.md` only if measured evidence or a review finding requires correction.

**Interfaces:**
- Consumes: Task 1 commit, report, focused static results, and offline gate outputs.
- Produces: independent spec/quality verdict, corrected evidence if needed, and a final reviewed tree.

- [ ] **Step 1: Review Task 1 against its brief and full diff**

Expected: explicit spec-compliance and task-quality verdicts; every Critical or Important finding enters the fix loop.

- [ ] **Step 2: Apply and re-review any required fixes**

Expected: each finding is marked addressed, with no new Critical or Important breakage.

- [ ] **Step 3: Run a whole-range review and final controller gates**

Expected: final review clean; repeat the focused searches, `git diff --check`, lint, TypeScript ratchet, offline Jest, and build on final HEAD.

- [ ] **Step 4: Record completion evidence**

Expected: exact deletion/rewrite counts and fresh gate counts are present without broad claims about historical documents.
