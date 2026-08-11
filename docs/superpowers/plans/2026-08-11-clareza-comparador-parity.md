# Clareza Comparator Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Clareza stock comparator behavior from `origin/main` to `remake` without copying the main branch's monolithic, ambient-config, explicit-any implementation.

**Architecture:** A typed comparator domain separates pure selection/search, injected FMP reads, Redis/Mongo storage, orchestration, HTTP adaptation, and scheduled execution. Public GET payloads remain compatible with the external HTML/PHP contract; unexpected errors use SEC-10.

**Tech Stack:** TypeScript, Express, Mongoose, Axios through an injected port, ioredis cache boundary, Jest, MongoMemoryServer.

## Global Constraints

- Modify only `remake`; `origin/main` is read-only behavioral evidence.
- Offline tests only; no real FMP, MongoDB, Redis, deployment, or external HTML access.
- No `any`, type assertions used to silence errors, non-null assertions, suppressions, ambient `process.env`, raw console logging, or compatibility façade.
- Preserve limits: four comparison symbols and ten manually refreshed symbols.
- Reads use Redis then Mongo and never call FMP; only refresh operations call the injected FMP client.
- Preserve current Clareza refresh authorization and central error handling.

---

### Task 1: Characterize the public comparator contract

**Files:**
- Create: `tests/services/clareza/comparadorPolicy.test.ts`
- Create: `tests/controllers/clarezaComparador.contract.test.ts`
- Create: `tests/fixtures/clareza/comparador-main-contract.json`

**Interfaces:**
- Consumes: observable query/response behavior from `origin/main:src/controllers/clarezaController.ts` and `origin/main:src/services/clareza/clarezaComparadorService.ts`.
- Produces: executable contract for `parseComparadorSymbols`, `searchComparadorStocks`, GET `/api/clareza/comparador`, and POST `/api/clareza/comparador/refresh`.

- [ ] Write fixtures containing one ordinary stock, one REIT, missing metrics, updated timestamp, and search aliases.
- [ ] Write RED tests for symbol normalization/dedup/order, maximum four comparison symbols, empty query, missing cached symbol, case-insensitive search, and maximum ten refresh symbols.
- [ ] Mount the real Clareza router with injected comparator seams and write RED tests for exact public GET shapes, 400 validation, refresh authorization, 503 unavailable, and central 500.
- [ ] Run `npx.cmd jest --ci --runInBand tests/services/clareza/comparadorPolicy.test.ts tests/controllers/clarezaComparador.contract.test.ts`; expected RED is missing comparator modules/routes.
- [ ] Commit `test(clareza): characterize comparator contract`.

### Task 2: Build typed comparator policy and DTOs

**Files:**
- Create: `src/services/clareza/comparador/comparador.types.ts`
- Create: `src/services/clareza/comparador/comparadorPolicy.ts`
- Modify: `tests/services/clareza/comparadorPolicy.test.ts`

**Interfaces:**
- Produces: `ComparadorStock`, `ComparadorSnapshot`, `ComparadorRefreshReport`, `parseComparadorSymbols(raw, limit)`, `selectComparadorStocks(snapshot, symbols)`, and `searchComparadorStocks(snapshot, query)`.

- [ ] Define closed DTOs for every field returned by the main comparator, using `number | null` for unavailable numeric metrics and no index signature wider than `unknown` at external decoding boundaries.
- [ ] Implement pure ticker normalization using `normalizeTicker`/`isValidTicker`; preserve order and reject empty or over-limit input with typed domain errors.
- [ ] Implement exact cached-symbol and search response shapes from the RED fixture.
- [ ] Run the policy suite; expected GREEN.
- [ ] Mutate dedup or the four-symbol limit, prove RED, restore, and commit `feat(clareza): add comparator policy`.

### Task 3: Add the FMP client and snapshot store

**Files:**
- Create: `src/services/clareza/comparador/comparadorFmpClient.ts`
- Create: `src/services/clareza/comparador/comparadorStore.ts`
- Create: `src/models/ClarezaComparadorData.ts`
- Create: `tests/services/clareza/comparadorFmpClient.test.ts`
- Create: `tests/services/clareza/comparadorStore.test.ts`
- Modify: `scripts/test/jestProjects.cjs`

**Interfaces:**
- Produces: `ComparadorFmpPort.fetchCompany(ticker): Promise<ComparadorStock | null>` and `ComparadorStorePort.read(): Promise<ComparadorSnapshot | null>`, `write(snapshot, errors): Promise<void>`.

- [ ] Write RED FMP adapter tests for immutable runtime-config lookup, shared throttle, retry only on 429, REIT classification, missing metrics as null, and no request when unconfigured.
- [ ] Implement the adapter with injected HTTP/getApiKey/throttle/sleep dependencies and safe response narrowing.
- [ ] Write RED MongoMemoryServer tests for Redis hit, Redis miss→latest Mongo snapshot, five-snapshot retention, Redis repopulation, and safe cache failure fallback.
- [ ] Implement a strict Mongoose schema and injected cache/model store without `Schema.Types.Mixed` escaping typed validation at the service boundary.
- [ ] Run both suites with `MONGOMS_RUNTIME_DOWNLOAD=false`; mutate retention `5→4`, prove RED, restore.
- [ ] Commit `feat(clareza): add comparator adapters`.

### Task 4: Implement comparator orchestration

**Files:**
- Create: `src/services/clareza/comparador/comparador.service.ts`
- Create: `src/services/clareza/comparador/comparador.runtime.ts`
- Create: `tests/services/clareza/comparador.service.test.ts`

**Interfaces:**
- Produces: `getComparadorSymbols`, `searchComparador`, `refreshComparadorSymbols`, and `refreshClarezaComparadorData` through runtime composition.

- [ ] Write RED tests for cache-only reads, bounded concurrency, injected clock, partial ticker failure counts, full universe refresh, partial refresh merging, and persistence after all tasks settle.
- [ ] Implement orchestration with an explicit worker pool and no sleeps outside the injected FMP adapter.
- [ ] Compose runtime dependencies from `getFmpApiKey`, `fmpThrottle`, `cacheService`, and `ClarezaComparadorData`.
- [ ] Prove reads call the FMP port zero times and partial refresh calls only requested symbols.
- [ ] Mutate persistence order or partial merge, prove RED, restore, and commit `feat(clareza): orchestrate comparator refresh`.

### Task 5: Wire HTTP routes and scheduled refresh

**Files:**
- Modify: `src/controllers/clarezaController.ts`
- Modify: `src/routes/clareza.routes.ts`
- Modify: `src/jobs/clareza.job.ts`
- Modify: `tests/controllers/clarezaComparador.contract.test.ts`
- Create: `tests/jobs/clarezaComparator.job.test.ts`
- Modify: `src/contracts/response-contract-catalog.json`

**Interfaces:**
- Consumes: comparator runtime functions from Task 4.
- Produces: GET `/api/clareza/comparador`, POST `/api/clareza/comparador/refresh`, and scheduled full refresh.

- [ ] Add thin async handlers preserving the public GET documents and returning the established refresh success shape.
- [ ] Protect refresh with `isClarezaRefreshAuthorized`; use `IntegrationUnavailableError` and `forwardApplicationError` consistently.
- [ ] Add both routes through `asyncRoute` without alias or version prefix.
- [ ] Add best-effort scheduled refresh after the existing Clareza products; safe logger metadata includes totals/errors only.
- [ ] Run router/job tests and all existing Clareza tests; mutate comparator job invocation, prove RED, restore.
- [ ] Regenerate route and response catalogs; verify only two new route identities and their reviewed shapes appear.
- [ ] Commit `feat(clareza): expose stock comparator`.

### Task 6: Comparator terminal gate and parity report

**Files:**
- Create: `docs/reports/2026-08-11-clareza-comparador-parity.md`
- Modify: `docs/HARDENING-WORKPLAN.md`

- [ ] Run lint-prune, lint, strict TypeScript, comparator/Clareza focused tests, route catalog, response checker, full offline Jest, and build.
- [ ] Run negative greps for `process.env`, `any`, casts, suppressions, raw console, direct live FMP calls in the comparator domain, and stale main-only import paths.
- [ ] Record exact main→remake parity, RED/GREEN mutations, counts, warnings, and offline limitations.
- [ ] Commit `docs(clareza): record comparator parity`.
