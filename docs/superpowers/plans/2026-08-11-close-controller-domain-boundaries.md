# Close Controller Domain Boundaries Implementation Plan

> **Required skills:** Use `superpowers:test-driven-development` for each behavior-preserving move, `superpowers:verification-before-completion` before every completion claim, and `superpowers:finishing-a-development-branch` for final integration.

**Goal:** Close the remaining ARCH-02 responsibility boundary by removing non-HTTP service/support modules from `src/controllers` and preventing that architectural drift from returning.

**Architecture:** Controllers remain HTTP adapters. Pure mapping, domain support, integration support, and shared error forwarding live under `src/services` or `src/security`. Existing public handlers, routes, response shapes, write order, and side effects remain unchanged; only module ownership and imports move.

**Tech Stack:** TypeScript, Express, Jest, ESLint, existing offline MongoMemoryServer test infrastructure.

**Global Constraints:** Work only on `remake`; offline only; no production APIs/Mongo/Redis; no `any`, assertion casts, non-null assertions, suppressions, dead compatibility wrappers, or semantic rewrites; one lowercase Conventional Commit per coherent slice; use `apply_patch` for edits; run the full offline gate before push.

## Task 1: Establish the controller-boundary ratchet

**Files:**

- Create: `tests/tooling/controllerResponsibilityBoundary.test.ts`
- Create: `tests/tooling/controllerResponsibilityBaseline.json`

- [ ] Inventory every handwritten `src/controllers/**/*.ts` file whose basename is not `*.controller.ts` or `index.ts`.
- [ ] Write a RED test that reports the current misplaced support/service modules and fails closed for any new unclassified file.
- [ ] Add mutation coverage proving a newly introduced `support.ts`, `mapping.ts`, or `*.service.ts` under controllers fails.
- [ ] Commit the RED ratchet fixture independently.

## Task 2: Move shared application-error forwarding to security

**Files:**

- Move: `src/controllers/forwardApplicationError.ts` → `src/security/forwardApplicationError.ts`
- Modify: every production and test importer returned by exact `rg` inventory.

- [ ] Characterize `IntegrationUnavailableError` preservation and generic error forwarding before moving.
- [ ] Move the implementation without a compatibility re-export.
- [ ] Update all imports, including middleware and routes.
- [ ] Run focused error-boundary, route-catalog, TypeScript, lint, and negative-grep checks.
- [ ] Commit as `refactor(errors): move application error forwarding`.

## Task 3: Move domain support modules out of controllers

**Files:**

- Move: `src/controllers/acTags/activeCampaignHistoryReason.ts` → `src/services/activeCampaign/historyReason.ts`
- Move: `src/controllers/engagement/support.ts` → `src/services/engagement/controllerSupport.ts`
- Move: `src/controllers/guruAnalytics/support.ts` → `src/services/guruAnalytics/controllerSupport.ts`
- Move: `src/controllers/guruSnapshots/support.ts` → `src/services/guruSnapshots/controllerSupport.ts`
- Move: `src/controllers/syncUtilizadoresControllers/cronManagement/support.ts` → `src/services/cron/controllerSupport.ts`
- Move: `src/controllers/syncUtilizadoresControllers/curseduca/support.ts` → `src/services/curseducaServices/controllerSupport.ts`
- Move: `src/controllers/tagEvaluation/mapping.ts` → `src/services/tagEvaluation/mapping.ts`
- Move: `src/controllers/testimonials/testimonialControllerSupport.ts` → `src/services/testimonials/controllerSupport.ts`
- Move: `src/controllers/testimonials/testimonialTags.service.ts` → `src/services/testimonials/testimonialTags.service.ts`
- Modify: exact production/test importers discovered by `rg`.

- [ ] Run current focused characterization tests before each domain move.
- [ ] Move files and repair only relative imports required by the new location.
- [ ] Update all production and test importers; leave no re-export façade or stale path.
- [ ] Run focused domain tests, TypeScript, lint, route catalog, response-contract checker, and negative greps.
- [ ] Commit coherent domain groups separately.

## Task 4: Close the ratchet and documentation

**Files:**

- Modify: `tests/tooling/controllerResponsibilityBaseline.json`
- Modify: `tests/tooling/controllerResponsibilityBoundary.test.ts`
- Modify: `docs/HARDENING-WORKPLAN.md`
- Create: `docs/reports/2026-08-11-controller-domain-boundary.md`

- [ ] Prune the baseline to zero and prove mutation/restoration still detects new misplaced modules.
- [ ] Verify every remaining non-`*.controller.ts` file under controllers is an intentional barrel (`index.ts`) or named legacy HTTP adapter (`clarezaController.ts`, `studentsController.ts`), with an explicit finite classification.
- [ ] Mark only the ARCH-02 responsibility checkbox complete and update the eight-pillar estimate from 78.1% to 78.8%.
- [ ] Record exact before/after inventory, commits, exclusions, and non-operational caveats.

## Task 5: Terminal verification and integration

- [ ] Run `npm.cmd run lint:baseline:prune` and prove no unexpected suppression change.
- [ ] Run `npm.cmd run lint`.
- [ ] Run `npm.cmd run types:check`.
- [ ] Run controller-boundary, route-catalog, response-contract, and affected characterization suites.
- [ ] Run one full offline Jest suite with `MONGOMS_RUNTIME_DOWNLOAD=false` and `--runInBand`.
- [ ] Run `npm.cmd run build`.
- [ ] Run `git diff --check`, lockfile diff, stale-path greps, and orphan-process audit.
- [ ] Request independent review, fix findings, commit docs, and push `remake` only after the final clean gate.
