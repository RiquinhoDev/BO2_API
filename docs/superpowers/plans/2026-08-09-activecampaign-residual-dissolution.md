# ActiveCampaign Residual Controller Dissolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the residual ActiveCampaign controller while preserving every live route and side effect.

**Architecture:** Split by use-case ownership into ops, legacy rule CRUD and product-tag V2 controllers. Route modules depend directly on each owner, and characterization tests prove the move before the old file is removed.

**Tech Stack:** TypeScript 5.9 strict, Express 5, Mongoose 8, Jest 29, Supertest, existing offline egress guard.

## Global Constraints

- Work only on `remake`; never contact real APIs or production databases.
- Preserve route paths, envelopes, write order and error fallbacks.
- No compatibility barrel, `any`, silencing casts, non-null assertions or suppressions.
- Do not add a gate or delete aliases without a separate policy decision.

### Task 1: Characterize residual handlers

**Files:**
- Create: `tests/controllers/activeCampaignOps.controller.test.ts`
- Create: `tests/controllers/activeCampaignLegacyTagRules.controller.test.ts`
- Modify: `tests/controllers/activeCampaignTag.controller.test.ts`
- Modify: `tests/controllers/activeCampaignV2.controller.test.ts`

- [ ] Point tests at the intended owner modules and run them to obtain missing-module RED.
- [ ] Cover success, not-found, partial failure and stable empty-error fallbacks without external I/O.
- [ ] Preserve existing V2 characterization and prove a persistence mutation produces RED.

### Task 2: Extract the three owners

**Files:**
- Create: `src/controllers/acTags/activeCampaignOps.controller.ts`
- Create: `src/controllers/acTags/activeCampaignLegacyTagRules.controller.ts`
- Create: `src/controllers/acTags/activeCampaignProductTags.controller.ts`
- Modify: `src/routes/ACroutes/activecampaign.routes.ts`
- Modify: `src/runtime/registerRoutes.ts`
- Delete: `src/controllers/acTags/activecampaign.controller.ts`

- [ ] Move handlers and only their required imports/types/helpers.
- [ ] Replace console calls with the canonical logger without changing public output.
- [ ] Rewire both route composition roots directly and delete the old file.
- [ ] Run focused tests and negative import/file greps.

### Task 3: Ratchets, documentation and gate

**Files:**
- Modify: `eslint-suppressions.json`
- Modify: `src/security/route-catalog.json` only if route declaration lines move.
- Modify: `tests/tooling/productionBoundaryInventory.test.ts`
- Modify: `docs/HARDENING-WORKPLAN.md`

- [ ] Prune suppressions and regenerate line-only inventory evidence.
- [ ] Record measured line reductions and the two policy debts.
- [ ] Run route catalog, production inventory, lint, TypeScript, full offline Jest, build and `git diff --check`.
- [ ] Commit with a lowercase Conventional Commit and push only to `origin/remake`.