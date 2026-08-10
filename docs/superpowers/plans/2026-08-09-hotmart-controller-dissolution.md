# Hotmart Controller Dissolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `src/controllers/syncUtilizadoresControllers/hotmart.controller.ts` while preserving every mounted Hotmart route, response contract, database effect, and Universal Sync behavior.

**Architecture:** Split by use case, not by arbitrary line ranges. HTTP adapters remain thin; catalog reads, legacy synchronization, progress synchronization, diagnostics, and Universal Sync orchestration receive focused modules. Characterization tests freeze behavior before each extraction, and every production dependency capable of network access is mocked or injected.

**Tech Stack:** TypeScript 5.9, Express 5, Mongoose, Jest 29, ts-jest, MongoMemoryServer, Axios.

## Global Constraints

- Work only on branch `remake`; never commit to `main`.
- Remain offline: no Hotmart API, production MongoDB, Redis, or other real integration.
- Do not run `npm ci`, delete `node_modules`, or alter either lockfile.
- Keep every handwritten TypeScript file at or below 500 lines.
- Preserve all ten mounted route contracts and methods exactly.
- No `any`, `@ts-ignore`, non-null assertions, casts used to silence types, or new ESLint suppressions.
- Apply rule #9 before extraction: prove each export is mounted or consumed; remove only code proven dead.
- Use RED/GREEN for every characterization or extracted interface; mutation must fail for the intended reason.
- One lowercase Conventional Commit per independently reviewable task.
- Final gate: lint, types, complete offline Jest suite, build, diff check, negative greps, lockfile proof, clean worktree.

---

## Target File Map

- `src/controllers/hotmart/hotmartCatalog.controller.ts`: four read-only V2 HTTP handlers.
- `src/services/hotmart/hotmartCatalog.service.ts`: product/user/stat queries and response DTOs.
- `src/services/hotmart/hotmartLegacyClient.ts`: token acquisition, paginated Hotmart users, and lesson reads behind an injectable transport.
- `src/services/hotmart/hotmartLegacySync.service.ts`: legacy full-user synchronization orchestration and bulk-write plans.
- `src/controllers/hotmart/hotmartLegacySync.controller.ts`: `syncHotmartUsers` HTTP adapter.
- `src/services/hotmart/hotmartProgressSync.service.ts`: legacy progress-only synchronization.
- `src/controllers/hotmart/hotmartProgress.controller.ts`: `syncProgressOnly` HTTP adapter.
- `src/controllers/hotmart/hotmartDiagnostics.controller.ts`: `findHotmartUser` and `compareSyncMethods`; the unmounted `testDatabaseConnection` export is removed as proven dead code.
- `src/controllers/hotmart/hotmartUniversalSync.controller.ts`: `syncHotmartUsersUniversal` and `syncProgressOnlyUniversal`.
- `src/controllers/hotmart/index.ts`: stable barrel used only by `hotmart.routes.ts`.
- `tests/controllers/hotmartCatalog.controller.test.ts`: exact HTTP envelopes and failures.
- `tests/services/hotmart/hotmartLegacyClient.test.ts`: token, pagination, and lesson transport behavior.
- `tests/services/hotmart/hotmartLegacySync.service.test.ts`: pure mapping/bulk-plan and orchestration characterization.
- `tests/services/hotmart/hotmartProgressSync.service.test.ts`: progress calculations and partial failures.
- `tests/controllers/hotmartDiagnostics.controller.test.ts`: lookup/database/compare contracts.
- `tests/controllers/hotmartUniversalSync.controller.test.ts`: authenticated actor forwarding, callbacks, and public envelopes.
- `src/routes/hotmart.routes.ts`: imports rewired to the new barrel; route declarations unchanged.
- `docs/HARDENING-WORKPLAN.md`: record the completed split and measured line reduction.

### Task 1: Freeze route inventory and catalog contracts

**Files:**
- Create: `tests/controllers/hotmartCatalog.controller.test.ts`
- Create: `src/services/hotmart/hotmartCatalog.service.ts`
- Create: `src/controllers/hotmart/hotmartCatalog.controller.ts`
- Modify: `src/routes/hotmart.routes.ts`
- Modify: `src/controllers/syncUtilizadoresControllers/hotmart.controller.ts`

**Interfaces:**
- Produces: `listHotmartProducts()`, `findHotmartProductBySubdomain(subdomain)`, `listHotmartProductUsers(productId)`, `getHotmartStatsSnapshot()`.
- Produces: `getHotmartProducts`, `getHotmartProductBySubdomain`, `getHotmartProductUsers`, `getHotmartStats` Express handlers.

- [x] Write exact response-contract tests for the four V2 routes, including empty results, missing product, query failure, canonical top-level subdomain, current product-user status/progress mapping, and unchanged status codes.
- [x] Run `npx jest --ci --runInBand tests/controllers/hotmartCatalog.controller.test.ts` and verify RED by temporarily replacing one expected response field in the legacy handler.
- [x] Restore the mutation and extract the query/service boundary without changing query filters, projection, population, ordering, or envelopes.
- [x] Rewire only the four V2 route imports and remove only their old definitions/imports.
- [x] Run the new suite, `tests/controllers/hotmart.controller.test.ts`, lint, types, and `git diff --check`; verify GREEN.
- [x] Commit with `refactor(hotmart): extract catalog handlers` and record the controller line-count reduction in the body.

### Task 2: Extract the legacy Hotmart transport

**Files:**
- Create: `src/services/hotmart/hotmartLegacyClient.ts`
- Create: `tests/services/hotmart/hotmartLegacyClient.test.ts`
- Modify: `src/controllers/syncUtilizadoresControllers/hotmart.controller.ts`

**Interfaces:**
- Produces: `HotmartLegacyTransport` with `getAccessToken()`, `listUsers(pageToken?)`, and `listUserLessons(userId, accessToken)`.
- Produces: `createHotmartLegacyClient({ http, credentials, subdomain })` with fail-fast configuration and no import-time environment validation.

- [x] Write tests for credential absence, token error payload, users pagination token variants, lessons request parameters, and Axios/non-Axios error normalization.
- [x] Run the focused suite and verify RED because the client factory does not exist.
- [x] Implement the typed client by moving the existing URL, headers, payload, and error semantics unchanged; do not call it in a test without a mocked transport.
- [x] Delete the now-duplicated private transport helpers from the controller.
- [x] Run focused tests, lint, types, and diff check; verify GREEN.
- [x] Commit with `refactor(hotmart): extract legacy client`.

### Task 3: Extract the full legacy synchronization use case

**Files:**
- Create: `tests/services/hotmart/hotmartLegacySync.service.test.ts`
- Create: `src/services/hotmart/hotmartLegacySync.service.ts`
- Create: `src/controllers/hotmart/hotmartLegacySync.controller.ts`
- Modify: `src/routes/hotmart.routes.ts`
- Modify: `src/controllers/syncUtilizadoresControllers/hotmart.controller.ts`

**Interfaces:**
- Consumes: `HotmartLegacyTransport` from Task 2.
- Produces: `executeHotmartLegacySync(deps): Promise<HotmartLegacySyncResult>` with explicit counts, warnings, and errors.
- Produces: `syncHotmartUsers` thin HTTP handler preserving the current response envelope.

- [x] Characterize multi-page ingestion, email-less users, existing/new users, class resolution, engagement normalization, timestamp conversion, bulk-write chunking, history writes, partial-page failure, and final `SyncHistory` state.
- [x] Mutate class identity or an existing counter and verify the focused test fails with the expected persisted-state mismatch.
- [x] Restore the mutation, implement the service with injected clock/client/repositories, and retain write order and partial-failure behavior.
- [x] Replace the legacy handler with a thin adapter and rewire only `/syncHotmartUsers`.
- [x] Remove the extracted block and dead imports from the old controller.
- [x] Run focused characterization, existing Universal Sync characterization, lint, types, and diff check; verify GREEN.
- [x] Commit with `refactor(hotmart): extract legacy user sync` and include before/after line counts.

### Task 4: Extract progress synchronization

**Files:**
- Create: `tests/services/hotmart/hotmartProgressSync.service.test.ts`
- Create: `src/services/hotmart/hotmartProgressSync.service.ts`
- Create: `src/controllers/hotmart/hotmartProgress.controller.ts`
- Modify: `src/routes/hotmart.routes.ts`
- Modify: `src/controllers/syncUtilizadoresControllers/hotmart.controller.ts`

**Interfaces:**
- Consumes: `HotmartLegacyTransport.listUserLessons`.
- Produces: `calculateHotmartProgress(lessons, clock)` and `executeHotmartProgressSync(deps)`.
- Produces: `syncProgressOnly` HTTP handler.

- [x] Characterize zero lessons, completed/extra-module lessons, duplicate modules, invalid timestamps, missing users, partial lesson failure, persisted progress fields, and exact response counters.
- [x] Mutate completed-percentage calculation and verify RED.
- [x] Restore the mutation; extract the pure calculator first and orchestration second.
- [x] Rewire `/syncProgressOnly`, remove old helpers/block/imports, and retain current error contract.
- [x] Run focused suites, legacy-sync tests, lint, types, and diff check; verify GREEN.
- [x] Commit with `refactor(hotmart): extract progress sync`.

### Task 5: Extract diagnostics and Universal Sync adapters

**Files:**
- Create: `tests/controllers/hotmartDiagnostics.controller.test.ts`
- Create: `tests/controllers/hotmartUniversalSync.controller.test.ts`
- Create: `src/controllers/hotmart/hotmartDiagnostics.controller.ts`
- Create: `src/controllers/hotmart/hotmartUniversalSync.controller.ts`
- Modify: `src/routes/hotmart.routes.ts`
- Modify: `src/controllers/syncUtilizadoresControllers/hotmart.controller.ts`

**Interfaces:**
- Produces: `findHotmartUser`, `compareSyncMethods`.
- Produces: `syncHotmartUsersUniversal`, `syncProgressOnlyUniversal`.

- [x] Characterize lookup hit/miss, compare response, authenticated principal forwarding, progress/error callbacks, adapter fetch failure, and exact Universal Sync envelopes; prove `testDatabaseConnection` has no route or consumer before removing it.
- [x] Mutate actor forwarding and verify RED against the authenticated principal assertion.
- [x] Restore the mutation and move the handlers without modifying the Universal Sync engine or its dry-run semantics.
- [x] Rewire the five routes and remove their old definitions/imports.
- [x] Run focused suites plus all Universal Sync characterization, lint, types, and diff check; verify GREEN.
- [x] Commit with `refactor(hotmart): extract sync adapters`.

### Task 6: Delete the monolith and close the gate

**Files:**
- Create: `src/controllers/hotmart/index.ts`
- Modify: `src/routes/hotmart.routes.ts`
- Delete: `src/controllers/syncUtilizadoresControllers/hotmart.controller.ts`
- Modify: `tests/controllers/hotmart.controller.test.ts` or replace its imports with focused suites.
- Modify: `tests/tooling/productionBoundaryInventory.test.ts`
- Modify: `docs/HARDENING-WORKPLAN.md`

**Interfaces:**
- Produces: a stable barrel exporting exactly the ten handlers consumed by `hotmart.routes.ts`.

- [x] Add a topology test or inventory assertion proving every route handler comes from the new Hotmart modules and no production/test import references the old path.
- [x] Run the topology test and verify RED while the old controller/path still exists.
- [x] Add the barrel, rewire all remaining imports, delete the old controller, and update the ratcheted production-boundary inventory mechanically.
- [x] Verify `rg -n "syncUtilizadoresControllers/hotmart\.controller|hotmart\.controller" src tests` contains no stale old-path import and review every remaining textual hit.
- [x] Verify every new handwritten TypeScript file is at most 500 lines and no route declaration/method/path changed.
- [x] Run `npm run lint`, `npm run types:check`, `MONGOMS_RUNTIME_DOWNLOAD=false npm test`, `npm run build`, and `git diff --check`.
- [x] Verify `git diff -- package.json package-lock.json yarn.lock` is empty and the worktree contains only intended changes.
- [x] Update `docs/HARDENING-WORKPLAN.md` with measured before/after topology, tests, and remaining ARCH-02 targets.
- [x] Commit with `docs(hotmart): close controller split`, push all commits to `origin/remake`, and report exact hashes and gate counts.

## Self-Review

- Spec coverage: all ten mounted handlers, route preservation, offline containment, file-size ceiling, dead-code proof, and terminal deletion have explicit tasks.
- Placeholder scan: no deferred implementation placeholders remain; business behavior is preservation-only.
- Type consistency: Task 2 client feeds Tasks 3 and 4; Tasks 1, 3, 4, and 5 export handlers collected by Task 6.

