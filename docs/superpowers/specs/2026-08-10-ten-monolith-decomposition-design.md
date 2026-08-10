# Ten-Monolith Decomposition Design

## Objective

Reduce the ten largest remaining handwritten TypeScript files above the approved 500-line ceiling without changing public contracts, business decisions, persistence semantics, external-write ordering, cache identity, or route ownership. Each original path remains a compatibility facade when it has consumers; every resulting production file must contain at most 500 physical lines.

## Scope

| Order | Current file | Baseline | Target ownership seams |
|---:|---|---:|---|
| 1 | `src/controllers/syncUtilizadoresControllers/curseduca.controller.ts` | 974 | dashboard, universal sync, products/users, utilities, deprecated/status |
| 2 | `src/services/guru/guruSync.service.ts` | 971 | transport pagination, contact/subscription reads, persistence, orchestration |
| 3 | `src/services/syncUtilizadoresServices/dualReadService.ts` | 764 | contracts/normalization, readers, composition, cache/public API |
| 4 | `src/services/renewal/renewalAcSync.service.ts` | 731 | pure planning, approval, execution, reversal, status/cron |
| 5 | `src/controllers/sync.controller.ts` | 713 | pipeline, Hotmart, CursEduca, deprecated Discord, history/status |
| 6 | `src/services/activeCampaign/tagOrchestrator.service.ts` | 707 | decision preparation, single-item orchestration, bulk coordination, statistics/cleanup |
| 7 | `src/services/renewal/discordRolesSync.service.ts` | 687 | pure role planning, approval/execution, messages/templates, status/cron |
| 8 | `src/services/syncUtilizadoresServices/hotmartServices/hotmart.helpers.ts` | 672 | authentication/transport, progress fetching, pure normalization/calculation |
| 9 | `src/services/tagMonitoring/weeklyTagMonitoring.service.ts` | 628 | snapshot orchestration, per-student capture, cleanup/statistics, priority queries |
| 10 | `src/services/clareza/clarezaRaioxService.ts` | 613 | universe/domain helpers, FMP company reader, refresh/cache, analysis/search/diagnostics |

The source-size debt baseline must fall from 26 to 16 after the complete batch.

## Architecture

### Stable public surfaces

Existing import paths, named exports, default exports, singleton identity and Express handlers remain stable. A facade may only re-export or compose focused owners; it may not duplicate implementation. Internal modules are grouped next to their owning facade so consumers do not acquire deep imports unless they already own that boundary.

### Extraction method

Each monolith follows the same sequence:

1. Prove the current public surface and an important behavioral seam with a topology or characterization test that fails when the future owner is absent or when a protected behavior is mutated.
2. Move one cohesive responsibility without rewriting its algorithm.
3. Preserve shared state in exactly one owner and inject/reference it from the other modules. No duplicate caches, clients, collectors or singleton instances.
4. Run focused tests, lint, strict TypeScript, source-size inventory, production-boundary inventory where controller line locations move, and `git diff --check`.
5. Commit one subject per original monolith.

No route deletion, response-envelope migration, schema change, database migration or feature-policy change belongs to this batch.

## Per-target design

### 1. CursEduca controller

Keep the original controller as a re-export facade. Extract dashboard queries, the universal-sync HTTP workflow, product/user read endpoints, utility mutations, and deprecated/status handlers. The asynchronous start/status state must have one owner so polling observes the same execution. Preserve deprecated 501 responses and the `syncCurseducaUsersUniversal` alias.

### 2. Guru Sync service

Retain the existing named/default exports. Separate the Guru HTTP pagination/read boundary, subscription/contact operations, Mongo persistence, and full-sync orchestration. Pagination termination, retry/error behavior, date mapping, product association and partial-failure counters remain unchanged. No real Guru call is permitted in tests.

### 3. Dual Read service

Move structural contracts and normalization away from persistence reads, then isolate composition from cache lifecycle. Warm-up, clear and read functions must share one cache instance and the same TTL. Ordering, deduplication, legacy fallback and public return shapes stay unchanged.

### 4. Renewal ActiveCampaign service

Separate pure plan generation from approval, external execution, reversal and status/cron coordination. All configuration reads continue through typed runtime configuration. The ActiveCampaign write boundary remains reachable only through the existing enabled gates, and effect ordering is unchanged. No new gate semantics or production-index assumptions are introduced.

### 5. Sync controller

Retain a facade with all mounted handlers. Extract pipeline, Hotmart, CursEduca, deprecated Discord, history/statistics and status handlers. Preserve callback behavior, progress responses, legacy Discord responses, query defaults, history limits and central error-boundary behavior.

### 6. Tag orchestrator

Retain the exported singleton as the only orchestrator instance. Extract pure preparation/decision helpers, per-UserProduct orchestration, multi-item coordination/statistics, and cleanup/batch operations. Preserve ActiveCampaign call ordering, engagement activity semantics, remove/add conflict behavior and partial failures.

### 7. Discord renewal service

Separate role-plan generation, approval/execution, message rendering/templates/sending, and status/cron coordination. Existing runtime kill switches and remote bot call order remain unchanged. Planning remains zero-write to Discord; execution remains the only remote-write boundary.

### 8. Hotmart helpers

Separate token/transport operations, paginated user/lesson/progress fetching, and pure progress/normalization utilities. Preserve pagination, throttling, timestamp conversion, Portuguese engagement normalization, validation and default export compatibility. Existing dynamic-data debt may be retained but must not grow or be hidden by new casts/suppressions.

### 9. Weekly tag monitoring

Retain one service singleton. Extract weekly snapshot coordination, per-student snapshot construction, retention/statistics, and priority-list queries. Preserve query bounds, priority classification, snapshot timestamps, cleanup semantics and partial-failure accounting. Characterization must be added because this file currently lacks direct behavioral tests.

### 10. Clareza Raio-X service

Separate pure universe/domain helpers, the FMP company reader, refresh/cache persistence, and read/search/diagnostic use cases. Preserve Redis to Mongo to FMP fallback order, ticker normalization, derived metrics and fail-closed runtime configuration. All FMP/Redis/Mongo boundaries are mocked or ephemeral; no real market-data call is allowed.

## Testing and safety gates

For every target:

- RED must prove the intended facade/owner boundary or a behavior that extraction could silently break.
- Focused GREEN includes existing relevant suites plus the new characterization.
- `npm run lint`, `npm run types:check`, source-size inventory and `git diff --check` must pass.
- Production-boundary inventory is updated only for mechanically relocated findings and must remain fail-closed.
- Existing ESLint suppressions may move and be pruned; counts may not grow. Newly exposed dead imports are removed, not suppressed.
- No `any`, assertion cast, non-null assertion, ignore directive or suppression is added to make the extraction compile.

After targets 1-5, run a checkpoint containing their focused suites, lint, TypeScript and both inventories. After targets 6-10, run the complete offline gate:

- `npm run lint`
- `npm run types:check`
- `MONGOMS_RUNTIME_DOWNLOAD=false NODE_ENV=test npm test`
- `npm run build`
- `git diff --check`
- lockfile diff must be empty

The occasional parallel Jest worker-shutdown warning is reported honestly and is never hidden with `--forceExit`.

## Stop conditions

Stop instead of guessing if extraction reveals different duplicated implementations, a missing/ineffective kill switch, a shared-state identity change, an external-write order change, an undocumented public consumer, a schema/index decision, or a failing behavioral suite whose correction would change business semantics. Bugs discovered during mechanical extraction receive a separate RED-first commit after explicit approval.

## Delivery

One lowercase Conventional Commit per monolith, followed by one documentation commit. Work stays on `remake`, is pushed only to `origin/remake`, and never touches `main`. The workplan records exact before/after line counts, tests and residual debt. Completion means all ten original files are at or below 500, the ratchet is 16, the full offline gate is green, and the branch is clean and synchronized.