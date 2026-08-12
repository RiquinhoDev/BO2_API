# Tooling Suppression Wave Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Preserve behavior and verify each domain before committing.

**Goal:** Remove the 1,065 ESLint suppressions owned by three non-overlapping domain partitions, reducing the repository baseline from 1,515 to at most 450.

**Architecture:** Production owners replace direct console calls with the existing canonical logger and replace `any`/unused/mechanical rule debt with domain types or `unknown` plus narrowing. Executors never edit ESLint configuration or the suppression baseline; one integrator prunes it after all reviewed commits.

**Tech Stack:** TypeScript strict, ESLint suppression baseline, Jest, canonical logger/redaction.

## Global Constraints

- Branch `remake`; no push, dependency changes, lockfile changes or Front edits.
- No shared logger, ESLint config, `eslint-suppressions.json`, generator or workplan edits by executors.
- Preserve log severity, useful structured context, redaction and error causes.
- Replace `any` with exact DTOs/generics or `unknown` plus runtime guards; no casts that merely hide debt.
- No inline eslint-disable comments or new suppressions.
- Run focused behavior tests, TypeScript and owned ESLint without suppressions before commit.
- Do not revert another worker's edits.

### Task 1: Sync services — exact baseline 331 across 18 files

Own `src/services/syncUtilizadoresServices/**`. Remove all suppressions in this subtree. Preserve sync ordering, reports, adapters and provider error boundaries. Add or strengthen focused tests where typing/log changes expose an untested branch.

### Task 2: Guru, ActiveCampaign and Clareza — exact baseline 377 across 36 files

Own matching services/controllers under `guru*`, `activeCampaign`, `acTags` and `clareza`. Remove all suppressions in these owners without changing provider behavior. Preserve throttling, compensation, redaction and protocol DTOs.

### Task 3: Operations, dashboards, history and analytics — exact baseline 357 across 26 files

Own `src/jobs/**`, `src/services/cron/**`, dashboard services/controllers, history controllers and analytics services. Remove all suppressions in these owners. Preserve job scheduling, aggregation outputs and operational log severity.

### Task 4: Integrate baseline and macro evidence

Verify all three ownership counts reached zero, run `lint:baseline:prune`, assert the repository baseline is <=450 with zero additions, and run normal lint/types/focused tests/build/diff/locks. Independent whole-wave review checks casts, swallowed errors, log redaction and semantic drift before updating the workplan percentage.
