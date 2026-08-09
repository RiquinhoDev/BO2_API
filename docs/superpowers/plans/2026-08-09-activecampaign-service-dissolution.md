# ActiveCampaign Service Dissolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Dissolve `activeCampaignService.ts` into transport, contact, tag and product-coordination modules while preserving its complete public API.

**Architecture:** One stateful transport owns configuration and HTTP mechanics. Contact and tag services use narrow ports. Product coordination uses repositories and late-bound façade delegates. The original singleton becomes a compatibility composition root below 500 lines.

**Tech Stack:** TypeScript 5.9 strict, Axios, Mongoose, Jest 29, ts-jest, offline fakes.

## Global Constraints

- Branch `remake`; zero real ActiveCampaign, MongoDB or Redis access.
- No new dependencies, `any`, type-silencing casts, non-null assertions or suppressions.
- Preserve every public method, named/default export and observable order.
- Every created/touched handwritten source file must contain at most 500 physical lines.

---

### Task 1: Extract transport

**Files:**
- Create: `src/services/activeCampaign/activeCampaignTransport.ts`
- Create: `tests/services/activeCampaign/activeCampaignTransport.test.ts`
- Modify: `src/services/activeCampaign/activeCampaignService.ts`

**Interfaces:**
- Produces `ActiveCampaignTransport` with `client`, `ensureAvailable`, `checkRateLimit`, `retryRequest`, `rethrowIntegrationUnavailable`, `formatError`, and `testConnection`.

- [x] Add failing tests for client caching/config change, retryable/non-retryable failures and unavailable integration before Axios.
- [x] Confirm missing-module RED.
- [x] Implement transport with injected runtime reader, clock and sleep.
- [x] Mutate retry classification, confirm RED, restore GREEN.
- [x] Delegate façade transport surfaces and run focused configuration/service tests.

### Task 2: Extract contacts and tags

**Files:**
- Create: `src/services/activeCampaign/activeCampaignContacts.service.ts`
- Create: `src/services/activeCampaign/activeCampaignTags.service.ts`
- Create: `tests/services/activeCampaign/activeCampaignContacts.test.ts`
- Create: `tests/services/activeCampaign/activeCampaignTags.test.ts`
- Modify: `src/services/activeCampaign/activeCampaignService.ts`

**Interfaces:**
- Contacts produces the existing contact/custom-field methods.
- Tags produces the existing tag/read/batch methods and consumes contacts.

- [x] Add failing tests for contact paging, create/update branching, cached ID, custom-field no-create, idempotent add and absent removal.
- [x] Implement the contact boundary with a narrow user metadata repository.
- [x] Implement the tag boundary with transport/contact ports.
- [x] Mutate paging termination and idempotent association separately; confirm RED and restore GREEN.
- [x] Rewire all façade methods without changing consumer imports.

### Task 3: Extract product coordination and close

**Files:**
- Create: `src/services/activeCampaign/activeCampaignProductTags.service.ts`
- Create: `tests/services/activeCampaign/activeCampaignProductTags.test.ts`
- Modify: `src/services/activeCampaign/activeCampaignService.ts`
- Modify: `tests/tooling/sourceFileSizeBaseline.json`
- Modify: `docs/HARDENING-WORKPLAN.md`

**Interfaces:**
- Product coordinator exposes `applyTagToUserProduct`, `removeTagFromUserProduct`, `syncContactByProduct`, and `removeAllProductTags`.
- Façade late-bound ports preserve method spying/overrides.

- [x] Add failing tests for external-before-local order, missing records, dedup, save/update payloads and partial failure contracts.
- [x] Implement repository ports and Mongoose adapter without dynamic imports.
- [x] Rewire the façade and prove existing singleton spies still intercept tag calls.
- [x] Remove the 1,010-line baseline entry and prove source-size ratchet GREEN.
- [x] Run lint, strict TypeScript, focused tests, complete offline Jest, build, diff and lockfile checks.
- [x] Commit coherent lowercase Conventional Commits and push deliberately to `origin/remake`.
