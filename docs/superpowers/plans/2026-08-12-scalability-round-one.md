# Scalability Round One Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Strict RED/GREEN TDD is mandatory.

**Goal:** Close the twelve remaining SCALE-03 code decisions while preserving write, provider and partial-failure semantics.

**Architecture:** Three independent partitions own local/database flows, Guru flows and ActiveCampaign/tag flows. Every operation uses one of: set-based read plus sequential writes, idempotent chunked bulk operation, or bounded workers with indexed results and explicit failure accounting. Unsafe operations remain pending.

**Tech Stack:** TypeScript, Jest, Mongoose, dependency-injected provider ports, fake timers.

## Global Constraints

- Work only on `remake`; no push, main changes, dependency installs or lockfile changes.
- No real Mongo or external API calls.
- Preserve HTTP/service result cardinality, input order, per-item timestamps, first-error/partial-error behavior and compensating writes.
- Concurrency must be explicit and <=10; no unbounded `Promise.all`.
- A retryable write needs a stable idempotency key or existing unique/upsert boundary before it can run concurrently.
- Capture genuine RED and GREEN for N=1/10/100, including failures and duplicates.
- Executors do not edit scalability inventory/generator/workplan or another partition.

### Task 1: Local and database workflows

Own student movement, activity snapshot monthly writes and cohort fan-out, achievement evaluation, and product-sales product traversal. Prefer set reads and sequential or idempotent bulk writes. Prove peak concurrency, order, timestamps and partial failures. Eject when those semantics cannot be retained.

### Task 2: Guru workflows

Own discrepancy compensation, cross-reference actions and expired-trial writes. Mock Guru ports only. Preserve fallback identity resolution, provider throttling, action order and database compensation. Add idempotency before bounded concurrency; otherwise retain sequential writes and remove only read fan-out.

### Task 3: ActiveCampaign and monitoring workflows

Own manual actions, native-tag compensation, testimonial provider order and weekly snapshot writes. Characterize provider budgets and remove read fan-out independently of ordered writes. Never parallelize remove/add or snapshot/history compensation without an existing idempotency boundary.

### Task 4: Integration

Reconcile only independently reviewed completions, retain exact pending reasons, mutate each new ratchet decision, run focused tests/types/normal lint/build/diff and whole-wave review. Target approximately 85%; do not claim 100% before Round Two operational evidence.
