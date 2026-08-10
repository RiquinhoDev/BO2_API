# Ten-Monolith Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the ten largest remaining handwritten TypeScript files to at most 500 physical lines while preserving every public contract and runtime effect.

**Architecture:** Keep each current import path as a compatibility facade and move cohesive responsibilities into sibling owner modules. Protect every move with a facade topology test plus existing behavioral characterization; retain exactly one owner for singleton/cache/stateful resources.

**Tech Stack:** Node.js, TypeScript strict, Express 5, Mongoose, Jest/ts-jest, MongoMemoryServer, ESLint 10 bulk suppressions.

## Global Constraints

- Work only on branch `remake`; never touch `main`.
- Offline only: `MONGOMS_RUNTIME_DOWNLOAD=false`; no real API, Mongo, Redis, Discord bot, scheduler or deploy.
- Every production TypeScript file must contain at most 500 physical lines.
- Preserve exports, response payloads/statuses, cache/singleton identity and external-write order.
- No new `any`, assertion casts, non-null assertions, ignore directives or suppression debt.
- One lowercase Conventional Commit per original monolith.
- Update `tests/tooling/sourceFileSizeBaseline.json` and mechanically relocate `productionBoundaryInventory` entries where necessary.

---

### Task 1: Split the CursEduca controller

**Files:**
- Modify: `src/controllers/syncUtilizadoresControllers/curseduca.controller.ts`
- Create: `src/controllers/syncUtilizadoresControllers/curseduca/dashboard.controller.ts`
- Create: `src/controllers/syncUtilizadoresControllers/curseduca/sync.controller.ts`
- Create: `src/controllers/syncUtilizadoresControllers/curseduca/products.controller.ts`
- Create: `src/controllers/syncUtilizadoresControllers/curseduca/users.controller.ts`
- Create: `src/controllers/syncUtilizadoresControllers/curseduca/legacy.controller.ts`
- Create: `src/controllers/syncUtilizadoresControllers/curseduca/support.ts`
- Test: `tests/controllers/curseducaControllerTopology.test.ts`

**Interfaces:**
- Consumes: existing models/services and the module-owned asynchronous sync state.
- Produces: the exact current named exports, including `syncCurseducaUsersUniversal === syncCurseducaUsers`.

- [ ] Write a topology test importing the facade and focused owners and asserting exact reference identity for every export:

```ts
expect(facade.syncCurseducaUsers).toBe(sync.syncCurseducaUsers)
expect(facade.syncCurseducaUsersUniversal).toBe(sync.syncCurseducaUsers)
expect(facade.getCurseducaSyncStatus).toBe(legacy.getCurseducaSyncStatus)
```

- [ ] Run the new test and verify RED because the focused modules do not exist.
- [ ] Move dashboard, sync, product, user/utility and legacy/status blocks without changing their bodies; place shared logger/state in `support.ts`.
- [ ] Replace the original file with re-exports and run topology, CursEduca destructive-validation and source-size tests GREEN.
- [ ] Run lint, TypeScript, inventories and diff checks; commit `refactor(curseduca): split sync controller`.

### Task 2: Split Guru synchronization

**Files:**
- Modify: `src/services/guru/guruSync.service.ts`
- Create: `src/services/guru/sync/contracts.ts`
- Create: `src/services/guru/sync/subscriptionReader.ts`
- Create: `src/services/guru/sync/contactReader.ts`
- Create: `src/services/guru/sync/subscriptionPersistence.ts`
- Create: `src/services/guru/sync/syncOrchestrator.ts`
- Test: `tests/services/guru/guruSyncTopology.test.ts`

**Interfaces:**
- Consumes: typed Guru runtime configuration, HTTP client and Mongo models.
- Produces: identical named exports and default-export object from `guruSync.service.ts`.

- [ ] Add a RED topology test that asserts named/default exports delegate to the focused owners.
- [ ] Move interfaces to `contracts.ts`, pagination/lookup to readers, database writes to persistence and full synchronization to orchestration.
- [ ] Preserve pagination termination, mapping, partial failures and write order; keep the facade export object unchanged.
- [ ] Run topology plus Guru enrollment/error-contract suites GREEN, then static gates and inventories.
- [ ] Commit `refactor(guru): split sync service`.

### Task 3: Split dual-read composition

**Files:**
- Modify: `src/services/syncUtilizadoresServices/dualReadService.ts`
- Create: `src/services/syncUtilizadoresServices/dualRead/contracts.ts`
- Create: `src/services/syncUtilizadoresServices/dualRead/readers.ts`
- Create: `src/services/syncUtilizadoresServices/dualRead/composer.ts`
- Create: `src/services/syncUtilizadoresServices/dualRead/cache.ts`
- Test: `tests/services/dualReadTopology.test.ts`

**Interfaces:**
- Consumes: existing User/UserProduct reads.
- Produces: unchanged unified-user contracts, warm-up, clear, statistics and default export, sharing one cache instance.

- [ ] Add RED assertions for facade delegation and cache identity across warm/read/clear calls.
- [ ] Move contracts/normalization, persistence readers, composition and cache lifecycle into focused owners.
- [ ] Preserve ordering, deduplication, TTL, legacy fallbacks and automatic warm-up behavior.
- [ ] Run `dualReadService.test.ts`, dashboard/hotmart legacy characterization and topology GREEN; run static gates.
- [ ] Commit `refactor(sync): split dual read service`.

### Task 4: Split Renewal ActiveCampaign planning and execution

**Files:**
- Modify: `src/services/renewal/renewalAcSync.service.ts`
- Create: `src/services/renewal/activeCampaign/contracts.ts`
- Create: `src/services/renewal/activeCampaign/planning.ts`
- Create: `src/services/renewal/activeCampaign/execution.ts`
- Create: `src/services/renewal/activeCampaign/reversal.ts`
- Create: `src/services/renewal/activeCampaign/status.ts`
- Test: `tests/services/renewalAcTopology.test.ts`

**Interfaces:**
- Consumes: typed renewal configuration, plan persistence and ActiveCampaign boundary.
- Produces: identical switches, constants, plan/approve/execute/revert/status/cron exports.

- [ ] Add a RED topology test and characterize that disabled write switches prevent the external boundary.
- [ ] Move pure planning, approval/execution, reversal and status/cron blocks to owners while retaining switch functions in one shared contract.
- [ ] Preserve plan freshness, approval semantics, external-call order, audit persistence and default export.
- [ ] Run renewal runtime/destructive suites and topology GREEN; run static gates.
- [ ] Commit `refactor(renewal): split activecampaign sync`.

### Task 5: Split the universal sync HTTP controller

**Files:**
- Modify: `src/controllers/sync.controller.ts`
- Create: `src/controllers/sync/pipeline.controller.ts`
- Create: `src/controllers/sync/hotmart.controller.ts`
- Create: `src/controllers/sync/curseduca.controller.ts`
- Create: `src/controllers/sync/discord.controller.ts`
- Create: `src/controllers/sync/history.controller.ts`
- Create: `src/controllers/sync/status.controller.ts`
- Test: `tests/controllers/syncControllerTopology.test.ts`

**Interfaces:**
- Consumes: universal sync and SyncHistory services.
- Produces: exact mounted handler references through the original facade.

- [ ] Add RED facade-reference assertions for every handler.
- [ ] Move platform handlers, deprecated Discord responses, history/statistics mutations and status into focused owners.
- [ ] Preserve callback/progress behavior, query defaults, response envelopes and central error flow.
- [ ] Run sync destructive-validation, relevant error-contract tests, topology and inventories GREEN.
- [ ] Commit `refactor(sync): split http controller`; run the five-target checkpoint.

### Task 6: Split the ActiveCampaign tag orchestrator

**Files:**
- Modify: `src/services/activeCampaign/tagOrchestrator.service.ts`
- Create: `src/services/activeCampaign/tagOrchestrator/contracts.ts`
- Create: `src/services/activeCampaign/tagOrchestrator/singleProduct.ts`
- Create: `src/services/activeCampaign/tagOrchestrator/bulk.ts`
- Create: `src/services/activeCampaign/tagOrchestrator/cleanup.ts`
- Test: `tests/services/tagOrchestratorTopology.test.ts`

**Interfaces:**
- Consumes: decision engine, ActiveCampaign facade and activity persistence.
- Produces: one `tagOrchestratorV2` singleton and unchanged default export.

- [ ] Add RED topology/singleton assertions and retain the existing activity-order characterization.
- [ ] Extract contracts, single-product execution, bulk/statistics and cleanup operations; make the facade class delegate without duplicating state.
- [ ] Preserve add/remove order, conflict handling, partial failure and rate limiting.
- [ ] Run topology and `tagOrchestratorActivity.test.ts` GREEN plus static gates.
- [ ] Commit `refactor(activecampaign): split tag orchestrator`.

### Task 7: Split Discord renewal roles and messages

**Files:**
- Modify: `src/services/renewal/discordRolesSync.service.ts`
- Create: `src/services/renewal/discord/contracts.ts`
- Create: `src/services/renewal/discord/planning.ts`
- Create: `src/services/renewal/discord/execution.ts`
- Create: `src/services/renewal/discord/messages.ts`
- Create: `src/services/renewal/discord/status.ts`
- Test: `tests/services/discordRolesSyncTopology.test.ts`

**Interfaces:**
- Consumes: renewal configuration, Discord bot boundary and change/template persistence.
- Produces: unchanged switches, constants, role-plan, execution, message and cron APIs.

- [ ] Add RED facade assertions and characterize that planning never calls the bot while disabled execution remains fail-closed.
- [ ] Move planning, approval/execution, messaging/templates and status/cron into focused owners.
- [ ] Preserve allowlists, rendering, bot-call order, audit writes and default export.
- [ ] Run renewal runtime and Discord destructive suites GREEN plus static gates.
- [ ] Commit `refactor(renewal): split discord role sync`.

### Task 8: Split Hotmart helpers

**Files:**
- Modify: `src/services/syncUtilizadoresServices/hotmartServices/hotmart.helpers.ts`
- Create: `src/services/syncUtilizadoresServices/hotmartServices/hotmart/contracts.ts`
- Create: `src/services/syncUtilizadoresServices/hotmartServices/hotmart/client.ts`
- Create: `src/services/syncUtilizadoresServices/hotmartServices/hotmart/fetchers.ts`
- Create: `src/services/syncUtilizadoresServices/hotmartServices/hotmart/progress.ts`
- Create: `src/services/syncUtilizadoresServices/hotmartServices/hotmart/normalization.ts`
- Test: `tests/services/hotmartHelpersTopology.test.ts`

**Interfaces:**
- Consumes: typed Hotmart runtime configuration and HTTP client.
- Produces: identical helper functions/interfaces and default export.

- [ ] Add RED facade assertions covering all helper exports.
- [ ] Move transport/token, paginated fetches, pure progress and normalization into focused modules.
- [ ] Preserve throttling, pagination, timestamp conversion, engagement mapping and validation.
- [ ] Run Hotmart runtime/legacy-sync suites and topology GREEN plus static gates.
- [ ] Commit `refactor(hotmart): split helper service`.

### Task 9: Split weekly tag monitoring

**Files:**
- Modify: `src/services/tagMonitoring/weeklyTagMonitoring.service.ts`
- Create: `src/services/tagMonitoring/weekly/contracts.ts`
- Create: `src/services/tagMonitoring/weekly/snapshot.ts`
- Create: `src/services/tagMonitoring/weekly/retention.ts`
- Create: `src/services/tagMonitoring/weekly/priority.ts`
- Test: `tests/services/weeklyTagMonitoring.test.ts`

**Interfaces:**
- Consumes: tag-monitoring persistence/read models.
- Produces: one default singleton with unchanged public methods.

- [ ] Add RED characterization for snapshot totals/partial failures, retention cutoff and bounded priority ordering.
- [ ] Move per-student snapshot logic, retention/statistics and priority queries to injected owners; retain orchestration/singleton in the facade.
- [ ] Preserve timestamps, classification, query bounds and partial-failure counters.
- [ ] Run focused MongoMemoryServer tests GREEN plus static gates.
- [ ] Commit `refactor(monitoring): split weekly tag service`.

### Task 10: Split Clareza Raio-X service

**Files:**
- Modify: `src/services/clareza/clarezaRaioxService.ts`
- Create: `src/services/clareza/raiox/contracts.ts`
- Create: `src/services/clareza/raiox/domain.ts`
- Create: `src/services/clareza/raiox/companyReader.ts`
- Create: `src/services/clareza/raiox/refresh.ts`
- Create: `src/services/clareza/raiox/queries.ts`
- Test: `tests/services/clareza/clarezaRaioxTopology.test.ts`

**Interfaces:**
- Consumes: FMP client, Redis cache and Mongo model.
- Produces: unchanged universe, refresh, analysis, JSON, search and diagnosis exports.

- [ ] Add RED facade assertions and characterize Redis to Mongo to FMP fallback order with injected/mocked boundaries.
- [ ] Move pure universe/domain logic, company reading, refresh persistence and query/diagnostic use cases to focused owners.
- [ ] Preserve ticker normalization, metrics, cache semantics and typed fail-fast configuration.
- [ ] Run market-data runtime and topology tests GREEN plus static gates.
- [ ] Commit `refactor(clareza): split raiox service`.

### Task 11: Close the batch

**Files:**
- Modify: `docs/HARDENING-WORKPLAN.md`
- Modify: `tests/tooling/sourceFileSizeBaseline.json`

- [ ] Confirm the source-size baseline contains exactly 16 entries and every new production file is at most 500 physical lines.
- [ ] Run the full offline gate:

```powershell
npm run lint
npm run types:check
$env:MONGOMS_RUNTIME_DOWNLOAD='false'; $env:NODE_ENV='test'; npm test
npm run build
git diff --check
git diff --exit-code -- package.json package-lock.json yarn.lock
```

- [ ] Record exact before/after lines, tests and offline boundaries in the workplan.
- [ ] Commit `docs(hardening): record ten monolith splits`.
- [ ] Push only `remake` to `origin/remake` and verify local HEAD equals the remote ref.