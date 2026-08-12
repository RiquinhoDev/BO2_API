# Scalability Final Code Wave Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. All production changes use strict RED/GREEN TDD.

**Goal:** Resolve every remaining scalability code decision that can be changed without altering business, write-order, compensation or provider semantics.

**Architecture:** Three non-overlapping partitions: full-set analytical reads, local/database fan-out writers, and provider/cache workflows. A final integrator alone updates the inventory and macro percentage.

**Tech Stack:** TypeScript, Jest, Mongoose, existing repositories/provider ports and SCALE ratchets.

## Global Constraints

- Branch `remake`, no push, no main changes, no dependency or lockfile changes.
- No production Mongo or external API calls. Mock the lowest provider boundary; preserve real local behavior.
- Preserve cardinality, order, timestamps, partial-failure accounting, idempotency and compensation.
- Never truncate full-set analytics; cursor-batch or aggregate complete populations.
- Bounded concurrency ceiling <=10; no unbounded `Promise.all`.
- Eject with exact evidence if safe equivalence cannot be proven.
- Executors do not edit inventory/generator/workplan or each other's files.

### Task 1: Close four SCALE-01 full-set decisions

Own product users full-set, quick/cohort heatmaps and grouped course lessons. Characterize consumers and response shapes; add 10k equivalence tests. Replace full materialization with complete cursor batches, aggregation, or paired grouped pagination only when exact equivalence is provable. Record genuine ejections.

### Task 2: Close remaining local/database fan-out decisions

Own student movement, activity snapshots, achievement evaluation, and any local-only Guru trial/discrepancy paths. Add N=1/10/100 tests for bounded execution, deterministic order and complete partial-error accounting. Prefer set reads and chunked bulk writes; eject operations whose per-item timestamps, transactions or compensations are contractual.

### Task 3: Close remaining cache/provider decisions

Own analytics cache stats/warmup, ActiveCampaign evaluation/native/testimonial flows, weekly monitoring and Guru cross-reference. Add aggregation for stats, keyed/bounded warmup, and provider-safe bounded workers only where configured rate/idempotency semantics are preserved. Use fake timers; never real provider calls.

### Task 4: Integrate and review

Extend the fail-closed inventory only with reviewed evidence, run independent review, checker/mutations, focused tests, types, normal lint, build, diff/locks/status. Calculate an honest percentage; 100% requires zero code pending plus real authorized operational evidence.
