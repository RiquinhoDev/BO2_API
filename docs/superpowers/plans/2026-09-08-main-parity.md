# API main-to-remake migration implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for bounded implementation and independent review. Do not create commits or modify main.

**Goal:** Preserve the functional changes in main b4836ee9 in remake, without losing remake 0704745b safety, contracts or architecture.

**Architecture:** Incremental migration into the existing service/runtime/repository boundaries. Main supplies business behaviour, not blanket permission to overwrite hardened files. Provider writes remain disabled by default and use the existing validation, execution ownership and durable receipt boundaries.

**Tech Stack:** TypeScript, Express, Mongoose, Jest; existing offline dependencies only.

**Spec:** The independently verified API comparison in this task, accepted by the user's request to apply all remaining API parts in remake. Scope excludes Front implementation and live operations.

## Global constraints

- Destination: C:/Users/User/.codex/worktrees/d43b/BO2_API, branch remake. Source main is read-only.
- No push, deployment, provider calls, production database, dependency installation, cache deletion or weakened tests.
- Tests use synthetic fixtures and installed egress guard. New code needs failing behavioural evidence before implementation and passing evidence afterward.
- Do not restore legacy endpoints which remake deliberately retired without preserving the canonical endpoint and an explicit compatibility contract.
- Do not infer operational readiness from local test success. Dev validation remains pending.
- Parent owns shared route registration, security/response/scalability catalogs, test topology and final evidence. Workers must report integration requirements.

## Task 1: Correct cross-cutting regressions

Files: src/services/users/studentSearch.transform.ts, src/utils/logger.ts, src/config/appConfig.ts, src/services/syncUtilizadoresServices/hotmartServices/hotmart/transport.ts; corresponding existing tests.

- [x] Add regression assertions for a plain-object TESTIMONIALS field and absent className, retaining Map compatibility where typed callers supply Maps. Run the targeted student-search tests and record the two failures.
- [x] Implement safe field access and optional className lookup; run targeted tests.
- [x] Assert production console logging and remove colorize, retaining redaction and silent tests; run configuration/logger tests.
- [x] Assert bounded retries on specified transient network codes/5xx in addition to 429, retaining execution ownership checks on each retry and refusal to retry invalid 4xx; run transport tests.

## Task 2: Reconcile class and inactivation behaviour

Files: src/services/classes/{classInactivation.service,mongooseClassInactivation.writer,mongooseClassDirectory.reader,classInactivation.runtime}.ts, src/controllers/classes/classInactivation.controller.ts, src/routes/classes.routes.ts, src/models/Class.ts, src/services/syncUtilizadoresServices/universalSync/builders/hotmartMutationPlan.ts; related tests.

- [x] Write regression cases for enrolled-class counts, resolved names, real inactivation lists, pagination, deletion of history only, reversal respecting previous state and OGI-only platform scope.
- [x] Port main behaviour through existing ports, fix its remaining unfiltered UserProduct mutation, and preserve canonical model registration.
- [x] Validate requests and cap reads/mutations. Run class and universal-sync suites; do not treat schema names alone as data compatibility proof.

## Task 3: Renewal, sales and tag-watch parity

Files owned by implementer: new models/services/routes from main for HotmartSaleHistory, ACRenewalData, ACStudentTag, StudentRenewalTimeline, TurmaTagMap, ProductSalesMonthlyStats, renewal event states; src/services/renewal business modules; src/services/products/productSalesPerformance.service.ts; renewal-only controllers/routes/tests.

- [x] Use main tests as business specifications; adapt node:test cases to the project's Jest offline topology or write equivalent Jest tests before adding implementation. Record RED evidence for missing capabilities.
- [x] Port read models, Hotmart/AC readers, cycle/timeline generation, mandatory tags, reporting, fixed turma 1/2 offers with historical fallback, 730-day lookback, expiration/purchase-date reconciliation and refund rules.
- [x] Retain remake execution preflight/ownership/receipts and read caps. Route writes require validated inputs, authorization metadata and default-off switches. No provider contact in tests.
- [x] Add bounded adapters for pipeline and AcTagWatch; report exact registration requirements to parent rather than editing shared catalogs/runtime dispatcher.
- [x] Run targeted renewal/sales tests and type check. Report unresolved contract/operational differences explicitly.

## Task 4: Clareza canonical core

Files: src/services/clareza/core, universe and operations modules, core models/controllers, src/routes/clareza.routes.ts, src/jobs/clareza.job.ts, related tests; shared config/cache/runtime changes coordinated by parent.

- [x] Add regression contracts for radar, portfolio search/analysis, suggestions/admin and operations before importing missing modules.
- [x] Port main core, published generations, companion reads, bounded database timeouts, Redis read cache and warmup. Preserve runtime integration guards and operational kill switches.
- [x] Preserve compatibility deliberately: /data and existing consumers must retain documented responses; migrate obsolete internal models only with evidence of no remaining use. Keep provider writes off by default.
- [x] Run core/compatibility/offline safety tests; document data preparation needed in dev.

## Task 5: Integrate and independently verify

- [x] Register new routers/jobs/models; compare concrete mounted endpoints against source main. The initial gap is 29 source endpoints, not 29 automatically approved legacy aliases.
- [x] Add authorization/OPS-02 decisions, input guards, response metadata and reviewed scalability contracts for each new surface. Existing catalog omits 22 of those source endpoints; copying that omission is prohibited.
- [x] Independently review each block for correctness, contract preservation, concurrency, query bounds and default-off provider writes.
- [x] Run types, lint, full offline unit/integration tests, build, route catalog, response contracts with the real Front root, scalability checks and git diff --check. Fix failures without relaxing ratchets.
- [x] Record fresh evidence and remaining dev validation in this plan. Archive only once code/evidence scope is actually complete.

## Execution evidence

Implementation and offline evidence: complete, archived in `TASKS_DONE.md`. Development validation: PENDENTE. Baseline source main b4836ee9; destination remake 0704745b. Both worktrees were clean before implementation.

Ruling: existing migration sequence and architecture were proposed in the previous reply and the user requested their application; no repeated design approval is required.

Ruling: no commits during the initial implementation/review pass, preventing mixed ownership from being staged accidentally. Main remains untouched throughout.

### Independent review findings resolved during implementation

- The five new router mounts initially used inferred prefixes. They now use the exact source prefixes and have a production-mount authentication regression test, including the 404 negative control.
- Inactivation-list creation returned a synthetic identifier without persistence. Creation now persists the canonical document; listing and status validation use its real identifiers and six enum values. The change includes failing-before/passing-after database tests.
- Timeline generation published a partial cohort after an individual failure, did not check execution ownership and submitted unbounded unordered writes. Four behavioural failures were reproduced. Generation now validates the complete selected cohort, caps it at 20,000 documents, batches lookups and ordered writes in groups of 200 and checks ownership before effects. The two targeted suites passed 12 tests after the changes.
- Product performance could publish totals after incomplete Hotmart/Guru reads. Provider completeness and ownership regressions now prevent that publication; all-years reads stream beyond one batch and validate their finite year horizon. The targeted suite passed 11 tests.
- New report adapters ignored Portuguese `erros` arrays and `success: false`. Three behavioural failures were reproduced and corrected so that partial provider results cannot complete durable receipts.
- Main-parity execution ownership is propagated into the existing ActiveCampaign transport guard, including checks after asynchronous waits and before retries.
- The daily renewal chain was initially only imported as a service. The production daily entry point now awaits the guarded follow-up after success, and the scheduler refuses a separate timer for `RenewalPipeline`.
- Manual and scheduled Discord sends share the deterministic rule/month execution key. Only confirmed nonexistent-account errors receive terminal handling; other provider errors remain failures.
- The canonical Clareza cron path now obtains its own durable receipt when no execution context exists; HTTP and cron share the canonical-core identity. Legacy refresh endpoints cannot write concurrently through the old path while canonical mode is active.

### Validation snapshots before final gates

These are checkpoints, not the final closure assertion:

- Initial full discovery: unit 477/491 suites and 3281/3324 tests passed; failures identified contract counts, configuration fixtures, CORS expectations, read inventories and source-size work still in progress. Integration 64 suites/412 tests passed at that earlier checkpoint.
- Independently verified later: mounted renewal endpoints resolve after authentication; route and response catalogs contain 438 decisions, preserving the 209 Front calls and 185 consumers tracked by the existing contract inventory.
- OPS-02 covers 172 authenticated write/destructive routes. Its existing debt ratchet remains 1 provider/bulk item, 0 mixed and 0 internal; no new hardening debt was accepted. Source-size and OPS targeted gates passed 3 suites/49 tests.
- Full TypeScript and source lint checks passed during the final review. They must be repeated after the final code freeze along with complete offline suites and generated inventories.

### Agent execution evidence

The coordinator independently read the session metadata and `turn_context.payload.model`/`effort` for the three workers: `gpt-5.6-sol`, `medium`. Session IDs: renewal `01a08287-d752-7213-b771-1e37c5d0597b`, Clareza `01a08287-fdba-75e3-ac29-e68f115619a4`, classes `01a0828b-1f54-7021-a6ec-bf8c52afb9e8`. Worker reports were followed by coordinator code review and fresh targeted gates.

### Operational boundary

Development validation remains pending. Follow [the dev validation checklist](2026-09-08-main-parity-dev-validation.md), especially response envelopes, request/proxy timeouts, isolated indexes and data, provider failure/replay cases, and the Front consumers. No provider call, deployment, push or commit is part of this pass.

### Final coordinator validation — 2026-09-08

The complete suites were repeated after implementation stopped and generated route/response/scalability evidence was reconciled. Earlier stale-catalog failures are retained above as historical checkpoints; they are not the final result.

| Gate | Final result |
| --- | --- |
| Complete offline unit project, run in band | PASS: 505 suites, 3,399 tests; 422.188 seconds |
| Complete offline integration project, run in band | PASS: 64 suites, 413 tests; 131.034 seconds |
| TypeScript compilation/build | PASS, exit 0 |
| ESLint on all `src`, zero warnings allowed | PASS, exit 0 |
| Runtime route reconciliation | PASS: 438 route identities |
| Response contract check with the real Front root | PASS: 438 decisions, 209 Front calls, 185 consumers |
| Scalability inventory and mutation regressions | PASS: SCALE-01 40/0, SCALE-02 11/0, SCALE-03 24/0; main parity 55 complete, 0 pending, 4 explicit Array.find exclusions |
| Mongoose AST inventory | 442 list sites; SHA-256 `013710d9fd626a310cd028b89bdc9dea2ac4c8fe10eb41e3cd97bcce8d22c12f` |
| OPS-02 hardening debt | Existing single provider/bulk item retained; no new debt |
| Whitespace check | PASS |
| Source main preservation | HEAD `b4836ee9a9e852f60ebeae7edc267ff118f9c394`; empty porcelain status |
| Destination branch | `remake`, HEAD `0704745bc03dfcf61ef5999fe7e260274c80bc72`; implementation intentionally uncommitted |

Additional review fixes included a post-provider Discord ownership fence, rejection of incomplete canonical Clareza results before a successful receipt, paired provider-start/success accounting for each refund removal, actual effect hooks in expiration/purchase-date reconciliation, and a single unique `userId` index in the new AC renewal mirror. These changes are covered by the final complete unit run.

The new Guru sales synchronization now requires explicit product identifiers for its environment before any provider work. Provider and local-operation switches remain opt-in. No frontend implementation, live/provider validation, deployment, branch promotion, commit or push was performed.

Worker evidence: [renewals](2026-09-08-renewal-parity-evidence.md), [classes and bounded reads](2026-09-08-class-parity-evidence.md), [Clareza execution](2026-09-08-clareza-execution-evidence.md), [routes and response contracts](2026-09-08-route-response-catalog-evidence.md).
