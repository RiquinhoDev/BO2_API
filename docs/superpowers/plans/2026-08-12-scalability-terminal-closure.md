# Scalability Terminal Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining code scalability debt and produce honest, read-only operational evidence for the 61% -> 100% decision.

**Architecture:** Three bounded layers: remove data-sized database fan-out, add bounded concurrency/singleflight at cache and provider boundaries, then run a read-only operational harness against the user-authorized target. The existing SCALE-01/SCALE-02 inventory remains fail-closed and is extended only after reviewed production commits.

**Tech Stack:** TypeScript 5.9, Node.js, Jest, Mongoose/MongoDB, existing logger/config/runtime ports, JSON inventory ratchets.

## Global Constraints

- Work only on branch `remake`; do not edit `main`, do not push.
- TDD is mandatory: record a real failing RED before every production change and a fresh GREEN afterwards.
- Never call a real write-capable external integration from tests or validation.
- Operational Mongo validation is read-only: `explain('executionStats')` and reads only; fail closed unless the target is explicitly recognized as non-production/read-only.
- Preserve result cardinality, ordering, partial-failure accounting, transaction/session semantics and existing HTTP contracts.
- Never fix complete/global analytics by truncating to 200.
- Bounded concurrency must have a configured ceiling no greater than 10; provider defaults should remain 2-4.
- No unbounded `Promise.all`, runtime `createIndex`/`syncIndexes`, dependency install, lockfile change, or secret output.
- Eject a candidate if batching changes compensating writes, strict write order, idempotency, or transaction semantics.
- Preserve unrelated work and Front user dirt (`.claude/settings.local.json`, `scripts/git-hooks/`).

---

### Task 1: Eliminate safe N+1 and data-sized await fan-out

**Files:**
- Modify candidates: `src/services/productSalesStatsBuilder.ts`, `src/services/classes/mongooseClassDetails.reader.ts`, `src/services/studentMovement.service.ts`, `src/services/activitySnapshot.service.ts`, `src/services/achievementEvaluation.service.ts`, `src/services/guru/guruDiscrepancy.service.ts`, `src/services/guru/guruTrialService.ts`, `src/controllers/acTags/activeCampaignOps.controller.ts`, `src/controllers/acTags/activeCampaignCourse.controller.ts`
- Create: `tests/scalability/scale02PartitionB.contract.test.ts`
- Modify only relevant existing behavior tests under `tests/services/` and `tests/controllers/`

**Interfaces:**
- Consumes: existing repositories/models and service ports.
- Produces: set-based or chunked operations with query count `O(1)` or `ceil(N/200)`, or a documented ejection.

- [ ] Characterize every live candidate and eject dead code or unsafe ordered/transactional writers before editing.
- [ ] Add tests with literal N=1,10,100 expectations proving complete cardinality/order, every item accounted once, fixed/chunk query count, deduplicated keys, and peak concurrency <=10.
- [ ] Run focused tests and record the expected RED caused by current linear fan-out.
- [ ] Replace per-entity reads with set queries/chunks; where batching cannot replace awaits, use the smallest bounded worker pool that preserves failure/order semantics.
- [ ] Run focused GREEN, TypeScript, owned ESLint and diff-check.
- [ ] Commit one scoped lowercase Conventional Commit and write the implementer report.

### Task 2: Eliminate cache stampedes and unbounded provider scans

**Files:**
- Modify candidates: `src/services/analyticsCache.service.ts`, `src/controllers/engagement/summary.controller.ts`, `src/controllers/engagement/controllerSupport.ts`, `src/services/nativeTagProtection.service.ts`, `src/services/testimonialTagSync.service.ts`, `src/services/tagMonitoring/weeklyTagMonitoring.service.ts`, `src/services/guru/crossReference.service.ts`, `src/services/clareza/raiox/data.ts`
- Create: `tests/scalability/scale02PartitionC.contract.test.ts`
- Modify only relevant existing behavior tests.

**Interfaces:**
- Consumes: existing cache stores, provider ports, timers and logging.
- Produces: keyed singleflight and bounded workers with deterministic result/error aggregation.

- [ ] Characterize live call sites and eject operations whose provider ordering/compensation cannot be preserved.
- [ ] Add fake-timer tests proving 50 identical cache requests invoke the calculator once, rejection clears in-flight state, and different keys do not block.
- [ ] Add N=10/100/10k provider tests proving peak concurrency is within configured limits and every input is accounted once without real sleeps or network.
- [ ] Run focused RED against current stampede/sequential behavior.
- [ ] Implement process-local singleflight and bounded iteration through existing ports; do not claim distributed singleflight.
- [ ] Run focused GREEN, TypeScript, owned ESLint and diff-check.
- [ ] Commit one scoped lowercase Conventional Commit and write the implementer report.

### Task 3: Build and run read-only operational scalability validation

**Files:**
- Create: `scripts/validate-scalability-operational.ts`
- Create: `tests/scalability/scalabilityOperationalHarness.test.ts`
- Modify: `package.json` only to register the script; update `package-lock.json` only if npm changes it without dependency changes (expected: no change).

**Interfaces:**
- Consumes: an already-loaded, user-authorized target URI/base URL through environment variables; never prints their values.
- Produces: sanitized JSON evidence containing target fingerprint, timestamp, query/route identity, p50/p95/p99, concurrency, memory/event-loop metrics and Mongo execution statistics.

- [ ] Discover the available validation mechanism from environment names and existing config without printing values.
- [ ] Write RED tests proving missing authorization, production-looking/write-capable targets, write commands and secret-bearing output are rejected.
- [ ] Implement a fail-closed read-only harness with an explicit allow flag, command allowlist, timeouts, zero-write assertion and sanitized output.
- [ ] Run synthetic deterministic validation first.
- [ ] If authorized target inputs are available, run representative `explain('executionStats')` and 1/10/50 read-only concurrency probes; otherwise report the exact missing mechanism and do not claim operational closure.
- [ ] Commit harness separately only after tests/types/lint/build pass.

### Task 4: Integrate scalability evidence and reconcile macro progress

**Files:**
- Modify: `src/contracts/scalability-read-inventory.json`
- Modify: `scripts/generate-scalability-read-inventory.mjs`
- Modify: `tests/contracts/scalabilityReadInventory.test.ts`
- Modify: `docs/HARDENING-WORKPLAN.md`

**Interfaces:**
- Consumes: reviewed commits and their RED/GREEN reports from Tasks 1-3.
- Produces: exact complete/pending/ejected decisions, fail-closed source pointers and the final macro percentage.

- [ ] Run the inventory checker before changes and capture exact expected drift.
- [ ] Add only factual completed/ejected decisions; retain explicit pending reasons for any stopped item.
- [ ] Add mutation/restoration coverage for new fan-out, concurrency and operational-evidence rules.
- [ ] Run inventory, scalability, types, normal lint, build and diff/lock/status gates.
- [ ] Dispatch an independent whole-wave review; fix findings and re-review once.
- [ ] Set Scalability to 100% only if code inventory has zero unresolved debt and the authorized operational evidence passes; otherwise record the exact honest percentage and blocker.

