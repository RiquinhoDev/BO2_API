# ARCH-03 Response Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every application JSON success response on `remake` to `{ success: true, data, meta? }`, preserve semantic public/protocol responses, update all owned Front consumers atomically, and close the response-contract catalog with zero legacy families.

**Architecture:** The reviewed route catalog remains the identity authority. A terminal response taxonomy distinguishes canonical application JSON from public documents, redirects, streams/files, and no-content; every migration wave changes Back, known Front consumers, tests, and the catalog together.

**Tech Stack:** TypeScript, Express, React, Axios, Zod, Jest, Testing Library, Vite, AST-based contract generator.

## Global Constraints

- Back repository: `BO2_API`, branch `remake`; Front repository: sibling `Front`, branch `remake`.
- Preserve unrelated Front worktree entries `.claude/settings.local.json` and `scripts/git-hooks/`; never stage or modify them.
- No `/v1`, `/v2`, compatibility alias, permanent adapter, multi-shape Front fallback, `any`, silencing cast, non-null assertion, suppression, or dead legacy code.
- Public Clareza HTML feeds remain exact public documents; all other JSON success responses use `success/data/meta`.
- Errors remain exclusively under SEC-10; status, headers, write order, dry-run behavior, and side effects are invariant.
- Offline only; zero production integrations or databases.

---

### Task 1: Extend the canonical success contract and terminal taxonomy

**Files:**
- Modify: `src/contracts/responseContract.ts`
- Modify: `scripts/generate-response-contract-catalog.mjs`
- Modify: `tests/contracts/responseContractRatchet.test.ts`
- Modify: `tests/contracts/responseContractCatalog.test.ts`
- Create: `tests/contracts/responseMigrationInventory.test.ts`
- Modify: `src/contracts/response-contract-catalog.json`

**Interfaces:**
- Produces: `SuccessResponse<T, M>`, `successResponse(data, meta?)`, `ApplicationResponseFamily = 'success-data'`, and semantic families `public-document | no-content | redirect | stream-or-file`.

- [ ] Write RED tests for typed optional meta, forbidden terminal families, exact public-document membership, and mutation/restoration of a reintroduced domain-envelope/raw-json/501-only decision.
- [ ] Extend the helper without adding Express send behavior.
- [ ] Teach the checker to distinguish reviewed public documents from unresolved raw JSON and fail closed on any forbidden family.
- [ ] Seed a migration inventory from the current 439 identities plus the comparator routes; inventory entries contain identity, owner, current family, target family, Front consumer, and status.
- [ ] Prove normal check is read-only and update cannot auto-accept family/shape drift.
- [ ] Commit `feat(contracts): define terminal response taxonomy`.

### Task 2: Migrate raw application JSON

**Files:**
- Modify: `src/controllers/classes/classDirectory.controller.ts`
- Modify: `src/controllers/classes/classDetails.controller.ts`
- Modify: `src/controllers/renewal.controller.ts`
- Modify: `src/controllers/users/studentHistory.controller.ts`
- Modify: `src/controllers/users/studentStats.controller.ts`
- Modify: `src/controllers/users/userPlatformStats.controller.ts`
- Modify: `src/controllers/usersSimpleList.controller.ts`
- Modify: `src/contracts/response-contract-catalog.json`
- Modify Front: `../Front/src/features/inactivation/inactivation.api.ts`
- Modify Front: `../Front/src/services/renewalOffers.service.ts`
- Modify Front: `../Front/src/hooks/useUsers.ts`
- Add/modify matching Back controller characterization and Front API tests.

**Interfaces:**
- Produces canonical envelopes for all 10 non-Clareza raw-json application identities; pagination/counts move to `meta`, while domain objects/arrays move to `data`.

- [ ] Characterize every current payload and Front parser; RED must show the canonical expected envelope.
- [ ] Migrate Back handlers with `successResponse`; preserve status and ordering.
- [ ] Replace Front fallback parsing with one exact typed/Zod parser.
- [ ] Prove loading/success/empty/error and pagination where present.
- [ ] Update only reviewed catalog identities; mutate one top-level legacy key, prove RED, restore.
- [ ] Commit Back and Front independently with matching domain subjects, then record both hashes.

### Task 3: Reclassify and protect Clareza public documents

**Files:**
- Modify: `tests/controllers/sec10ApplicationWave.contract.test.ts`
- Create: `tests/controllers/clarezaPublicDocuments.contract.test.ts`
- Modify: `src/contracts/response-contract-catalog.json`
- Modify: `tests/contracts/responseMigrationInventory.test.ts`

- [ ] Capture exact shapes for all Clareza public GET feeds, including comparator, dynamic ticker documents, searches, diagnostics, top10, carteira, earnings, and thermometer data.
- [ ] Reclassify only those GET identities as `public-document`; refresh/application responses use success-data.
- [ ] Prove byte/top-level shape compatibility against pre-migration fixtures and reject `success/data` wrapping on public documents.
- [ ] Commit `test(clareza): protect public document contracts`.

**Task 3 responsibility boundary:** this migration task owns the finite route membership,
controller passthrough, status, cache headers, JSON versus raw serialization, and rejection of
a canonical `{ success: true, data }` wrapper. It does not freeze universal financial payload
values for dynamic/cache-backed Clareza records and makes no controller or service production
change. Financial correctness and dynamic producer values remain owned by the existing
per-service tests; Task 3 records their provenance without treating cache-seeded examples as
universal producer snapshots.

### Task 4: Migrate identity, authentication, users, and dashboard domains

**Files:**
- Modify controllers under `src/controllers/users/`, plus `src/controllers/auth.controller.ts`, `src/controllers/dashboard.controller.ts`, `src/controllers/dashboardQuick.controller.ts`, `src/controllers/studentsController.ts`, and the exact user/dashboard route-inline handlers in `src/routes/users.routes.ts` and `src/routes/dashboardRoutes.ts`.
- Modify corresponding tests under `tests/controllers/`.
- Modify Front consumers under `../Front/src/services/api.ts`, `../Front/src/services/usersV2.service.ts`, `../Front/src/hooks/`, `../Front/src/contexts/AuthContext.tsx`, and dashboard/student components identified by the catalog.
- Modify corresponding Front tests.

- [ ] Generate the exact identity list from the migration inventory and assert no user/auth/dashboard identity is omitted.
- [ ] Run characterization RED per owner file before production edits.
- [ ] Move all success payload domain fields under `data`; counts, pagination, filters, execution time, and warnings under `meta`.
- [ ] Update all Front consumers to one exact parser and delete fallback branches/comments.
- [ ] Run Back+Front focused gates and commit in owner-sized slices.

### Task 5: Migrate classes, courses, lessons, analytics, and engagement

**Files:**
- Modify controllers under `src/controllers/classes/` and `src/controllers/analytics/`.
- Modify `src/controllers/course.controller.ts`, `src/controllers/courseLessons.controller.ts`, `src/controllers/lessons.controller.ts`, `src/controllers/cohortAnalytics.controller.ts`, `src/controllers/businessAnalytics.controller.ts`, and `src/controllers/engagement/*.controller.ts`.
- Modify corresponding route/controller/service tests.
- Modify catalog-linked Front consumers under `../Front/src/features/analytics/`, `../Front/src/hooks/useClasses.ts`, `../Front/src/hooks/useCohortAnalytics.ts`, `../Front/src/hooks/Usebusinessanalytics.ts`, and class/dashboard components.

- [ ] Lock exact membership from the inventory.
- [ ] RED/GREEN migrate each cohesive owner, including mixed success routes.
- [ ] Preserve dry-run and mutation semantics for recalculation/evaluation endpoints.
- [ ] Remove Front `data || classes`, envelope-or-raw, and other fallback parsing.
- [ ] Run Back+Front focused tests, catalog check, and commit owner-sized slices.

### Task 6: Migrate ActiveCampaign, tags, testimonials, and monitoring

**Files:**
- Modify controllers under `src/controllers/acTags/`, `src/controllers/tagMonitoring/`, and `src/controllers/testimonials/`, plus `src/controllers/tagEvaluation.controller.ts`.
- Modify matching Back tests.
- Modify Front consumers under `../Front/src/features/activecampaign/`, `../Front/src/features/tagMonitoring/`, `../Front/src/features/testimonials/`, and their tests.

- [ ] Lock exact identity membership and characterize local success/partial-result shapes.
- [ ] Migrate success responses without changing ActiveCampaign side-effect order, dry-run, partial processing, or destructive validation.
- [ ] Replace all Front multi-shape fallbacks with exact schemas.
- [ ] Preserve public error handling through the canonical Front `apiError` boundary.
- [ ] Run both repositories' focused gates and commit by subdomain.

### Task 7: Migrate Guru, Hotmart, renewal, and Discord renewal

**Files:**
- Modify Guru controllers in `src/controllers/guru*.ts`, `src/controllers/guruAnalytics/`, and `src/controllers/guruSnapshots/`.
- Modify Hotmart controllers in `src/controllers/hotmart/`.
- Modify `src/controllers/renewal.controller.ts`, `src/routes/renewalAc.routes.ts`, and `src/routes/discordRenewal.routes.ts`.
- Modify matching Back tests and Front consumers under `../Front/src/features/guru/`, `../Front/src/services/renewal*.service.ts`, and `../Front/src/hooks/useDiscord*.ts`.

- [ ] Lock exact identity membership; preserve the Guru SSO redirect as redirect.
- [ ] RED/GREEN migrate application success payloads and pagination/meta.
- [ ] Preserve webhook acknowledgement timing, sync partial failures, compensation order, and integration-unavailable 503.
- [ ] Delete `success ? result : ...` and message/error compatibility parsing from the Front.
- [ ] Run focused Back+Front gates and commit by domain.

### Task 8: Migrate sync, cron, events, products, discovery, and residual application routes

**Files:**
- Modify controllers under `src/controllers/sync/`, `src/controllers/syncStats/`, and `src/controllers/syncUtilizadoresControllers/`.
- Modify `src/controllers/cron/cronManagement.controller.ts`, `src/routes/events.routes.ts`, `src/routes/achievements.routes.ts`, `src/controllers/products/`, `src/controllers/discovery.controller.ts`, `src/controllers/metrics.controller.ts`, `src/controllers/webhooks.controller.ts`, and residual owners listed by the inventory.
- Modify corresponding Back tests and catalog-linked Front consumers, especially `../Front/src/features/cron/`.

- [ ] Lock exact residual membership and make the inventory fail if any application identity is unowned.
- [ ] RED/GREEN migrate all success and partial-result responses.
- [ ] Preserve long-running operation IDs, job state, validation, compensation, and write ordering.
- [ ] Update Front cron schemas/parsers atomically and delete legacy branches.
- [ ] Run focused Back+Front gates and commit by cohesive owner.

### Task 9: Remove 501-only and dead legacy surfaces

**Files:**
- Modify the exact 13 route/controller identities marked `501-only` in `src/contracts/response-contract-catalog.json`.
- Modify `tests/security/routeCatalog.test.ts`, contract tests, and any Front callers found by the scanner.

- [ ] Re-run rule #9 for each identity: if shadowed/unconsumed and superseded, remove route+handler+tests; if intended, implement its existing documented behavior under success-data.
- [ ] Do not guess business behavior: stop on any live 501 route without an authoritative successor/spec.
- [ ] Prove route membership and Front anti-join after each removal/implementation.
- [ ] Commit each business-independent group separately.

### Task 10: Terminal ratchet, dead-code sweep, and closure

**Files:**
- Modify: `src/contracts/response-contract-catalog.json`
- Modify: `tests/contracts/responseMigrationInventory.test.ts`
- Modify: `tests/contracts/responseContractCatalog.test.ts`
- Modify: `docs/HARDENING-WORKPLAN.md`
- Create: `docs/reports/2026-08-11-arch03-response-contract-closeout.md`

- [ ] Require catalog membership equal mounted membership and only `success-data`, `public-document`, `redirect`, `stream-or-file`, or `no-content`.
- [ ] Require zero application identities outside success-data and zero public documents outside the finite Clareza allowlist.
- [ ] Scan Back and Front for `/v1`, `/v2`, legacy response adapters, multi-shape fallbacks, deprecated success types, and dead compatibility exports.
- [ ] Run complete Back offline Jest/build/lint/types/catalog gates.
- [ ] Run complete Front lint/types/tests/build without staging unrelated local files.
- [ ] Verify lockfiles, diff-check, clean tracked worktrees, and no orphan processes.
- [ ] Mark ARCH-03 100% and update the eight-pillar total only after all mechanical criteria pass.
- [ ] Commit `docs(contracts): close response migration` and push only `remake` after final review.
