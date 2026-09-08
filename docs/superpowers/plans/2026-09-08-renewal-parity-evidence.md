# Renewal, sales and tag-watch parity evidence

Status: **EM CURSO**

Scope: Task 3 of `2026-09-08-main-parity.md`, destination `remake`; source `main@b4836ee9` read-only. No network, provider, production database, install, commit or push operations were used.

## Behavioural evidence

- RED — initial adapted main specifications: five suites failed because the renewal models and services did not exist.
- GREEN — expiration, purchase-date reconciliation, turma-tag sync, refund handling and pipeline: 5 suites, 103 tests passed.
- RED — historical Turma 1/2 offer fallback: TypeScript rejected the missing user-aware matcher argument (`TS2554`).
- GREEN — matcher regression: 1 suite, 2 tests passed.
- RED — five new routers were absent from the renewal route safety specification.
- GREEN — route mutation default-off specification: 1 suite, 5 tests passed.
- RED after moving source tests into Jest topology — purchase-date reconciliation: 18 failures with `RUNTIME_CONFIG_NOT_INITIALIZED`; the source test mutated `process.env` outside the typed composition root.
- GREEN after typed runtime fixture — purchase-date reconciliation: 1 suite, 22 tests passed.
- RED — receipt ownership was not visible to the ActiveCampaign transport after an await: 1 failed, 5 passed. GREEN — the renewal phase context now bridges `ActiveCampaignExecutionGuard`: 1 suite, 6 passed.
- RED — malformed provider payloads were interpreted as empty pages and a pipeline report with `success:false` was accepted: 2 suites failed. GREEN — strict Hotmart/AC page validation plus pipeline failure propagation: 2 suites, 7 passed; AC page helper: 1 suite, 2 passed.
- RED — typed AC renewal field overrides were frozen at module defaults. GREEN — per-run resolver consumes purchase/first-purchase/status/refund overrides and the configured expiry field: 1 suite, 1 passed.
- RED — tag-watch queue fetched only 200 documents before lot deduplication. GREEN — the finite 2,000-candidate compatibility window is restored: 1 suite, 1 passed.
- Focused AC mirror/pipeline/queue run: 6 suites, 20 tests passed.
- Renewal aggregate after hardening: 28 suites passed, 1 failed; 323 passed, 1 failed. The failure exposed cross-suite mock leakage that removed the real provider phase helper; the isolated affected suite passed 13/13 after the mock preserved actual exports. Repository-wide rerun is in progress and remains the completion gate.

## Safety adaptations

- Mutation routes use the global default-off sync switch. The three real dry-run previews bypass mutable receipts and writes; `dryRun:false` uses durable composite execution receipts.
- Manual email batches are validated, normalised, deduplicated and capped at 200.
- Tag-watch batch acceptance selects at most 201 stable IDs, refuses more than 200, then updates the selected IDs with an open-state CAS filter.
- Long-running route mutations are awaited and return the actual report. In-memory `inProgress` booleans and false completion responses were removed.
- Main-parity provider/local effect helpers propagate receipt ownership through `AsyncLocalStorage`, including ActiveCampaign transport retry checkpoints; provider reads have an aggregate 20,000-item cap.
- Hotmart and ActiveCampaign paginated reads reject missing arrays and pages larger than the requested size instead of treating an incomplete response as an empty page.
- Renewal pipeline reports with `success:false`, `errors` or `erros` block dependent timeline and provider-write stages.
- Runtime AC field configuration is resolved on every AC renewal-data run. The purchase-date read may use the business fallback 334; reconciliation still requires explicit configuration.
- Tag-watch queue reads a bounded 2,000-row candidate window before lot deduplication, preserving visibility after a large recent lot.
- Route reads have explicit limits and deterministic `_id` tie-break sorts.
- AC purchase date reconciliation requires explicit typed field ID 334. Other renewal business constants come from typed runtime config with parser defaults.

## Integration requirements

Parent-owned mounting/catalog/runtime work must register:

- `/api/renewal-ac-data`
- `/api/ac-tag-watch`
- `/api/renewal-hotmart-sales`
- `/api/products-sales-performance`
- `/api/renewal-timeline`
- existing `/api/renewal-ac` additions: `POST /turma-tags/sync`, `POST /refunds/handle`
- scheduler dispatch for `AcTagWatch` through `runWithMainParityPhaseHooks`.

## Pending verification

- Repository-wide Jest and catalog gates owned by the parent task are still running.
- `npm run types:check`, owned production/test lint, renewal source size check and `git diff --check` are green. All renewal service source files are at most 500 lines.
- Scalability read sites were cursor/batch reviewed by the dedicated owner; repository inventory regeneration remains a parent gate.
- Local/offline evidence does not prove provider or production-data compatibility.
