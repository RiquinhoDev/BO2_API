# Task 7 — RenewalOfferSync bounded manual-job safety

Date: 2026-09-07
Status: implementation and offline evidence complete; operational, provider, production, and deployment closure intentionally not claimed.

## Inherited state audit

The work was recovered from the existing uncommitted Task 7 state in both `remake` branches. The usable changes were inspected and continued; no reset, checkout, history rewrite, or unrelated revert was performed.

- Backend: `C:\Users\User\.codex\worktrees\d43b\BO2_API`, branch `remake`, inherited HEAD `f1f84908`.
- Front: `C:\Users\User\Documents\GitHub\Riquinho\api\Front\Front`, branch `remake`, inherited HEAD `93c9aba2`.
- Front-only unrelated dirt was preserved untouched: `.claude/settings.local.json` and `scripts/git-hooks/`.
- The inherited Task 7 diff did not carry reconstructable prior RED output. Prior RED claims below are therefore identified as inherited evidence where applicable; new mutation/reversion checks were run where practical.

## Implementation

### Backend

- Registered only the exact `RenewalOfferSync` job name and capability `renewal-offer-sync`; substring aliases remain unsupported.
- Added typed `RENEWAL_OFFER_MANUAL_EXECUTION_ENABLED`, defaulting to false. The flag gates manual mutation only; automatic scheduling does not consult it. A true flag with incomplete Hotmart credentials fails closed during configuration, and capability/guard checks also fail closed.
- Routed the renewal controller through the existing guarded named-job execution path. The old direct `syncRenewalOffers()` controller path is removed.
- Split provider pagination, bounded local planning, types, and result normalization into focused modules.
- Bounded Hotmart reads to page size 100, at most 200 pages, and at most 20,000 accepted sales. The implementation rejects malformed/partial/error envelopes, contradictory pagination, repeated cursors, continuation after the item/page budget, identity conflicts, and cap overflow before accumulation can exceed the bound.
- Bounded the local RenewalOffer snapshot with a physical `limit(20001)` sentinel, validates local identity uniqueness, reads buyer/enrollment context under the same limits, and builds deterministic create/update/reactivate/deactivate operations with a total effective-operation cap of 20,000.
- Asserts ownership before token/provider/local reads and before every mutation. Mutations use optimistic identity/state predicates and require acknowledged, exactly matched, exactly modified results. Dry-run returns a sanitized bounded plan and performs no mutation hook or write.
- Added canonical dispatcher normalization that exposes only generic stats, success/error state, and the safe bounded preview plan; provider payloads, IDs, offer codes, emails, tokens, and internal error details do not cross the result boundary.
- Kept `buildCheckoutLink` and existing renewal matching/read/manual CRUD behavior compatible.
- Updated only source-backed route/response/SCALE catalogs and corrected stale inherited contract/suppression expectations without weakening behavioral assertions.

### Front

- Generic Cron UI now has focused `RenewalOfferSync` capability coverage using backend policy data.
- The specialized Renewal Offers header displays backend-driven `Manual: ON/OFF`, the exact backend block reason, and distinct preview/live availability.
- Preview and live actions both call the canonical Cron trigger path with the selected `dryRun` value and a request ID. The page no longer calls the unguarded renewal sync endpoint.
- Preview rendering admits only bounded numeric plan counts and does not render provider identity fields.
- Existing layout and accessibility structure were preserved. `.claude/settings.local.json` and `scripts/git-hooks/` were not staged or changed by the Task 7 commits.

## Commits

Backend:

- `03c59acb feat(cron): bound renewal offer manual execution`

Front:

- `9792559 feat(renewal): gate offer sync by cron policy`

This report is committed separately after the implementation commits.

## TDD and mutation evidence

### Inherited evidence (not reconstructed)

The inherited Task 7 changes included focused tests for provider bounds, canonical dispatch, capability/guard behavior, controller routing, and Front policy behavior. The original Luna RED transcripts were unavailable, so they are not presented as freshly reproduced RED evidence.

### Fresh RED/GREEN or mutation/reversion evidence

The following behavior checks were exercised through real test mutations/reversions during recovery:

- Empty OGI enrollment context: the regression mutation admitted a renewal suggestion; the corrected implementation returned no suggestion for the empty active-enrollment set. Green coverage is in `tests/services/renewal/renewalSyncSafety.test.ts`.
- Suggestion ordering: the regression mutation produced ascending frequency ordering; the corrected implementation orders frequency descending with turma number as the stable tie-breaker.
- Ownership ordering: the regression mutation placed the provider-token call before the ownership hook; the corrected implementation calls ownership first and re-checks after token acquisition and before provider/local phases.
- Front preview sanitization: the regression mutation rendered invalid/over-cap values (`-1`, `50000`); the corrected implementation renders zero for invalid values and omits provider identity fields.
- Dispatcher normalization: the regression mutation accepted a malformed/successful plan; the corrected implementation marks it unsuccessful and emits the fixed generic error.
- Dry-run contract: the regression mutation allowed a dry-run without a valid bounded plan; the corrected implementation rejects the result and keeps live mutation hooks out of the dry-run path.

## Exact validation

### Backend

With `RESPONSE_CONTRACT_FRONT_ROOT=C:\Users\User\Documents\GitHub\Riquinho\api\Front\Front`:

- Full Jest gate: `457 passed, 457 total` suites; `3059 passed, 3059 total` tests; `0` snapshots; exit `0`.
- Focused Task 7 and touched-contract gate: `9` suites, `143` tests passed.
- `npm.cmd run build`: passed.
- `npm.cmd run types:check`: passed.
- `npm.cmd run lint`: passed.
- `npm.cmd run routes:catalog:check`: `409` runtime identities; passed.
- `npm.cmd run contracts:responses:check`: `409` decisions, `212` Front calls, `187` consumers; passed.
- `npm.cmd run scalability:reads:check`: SCALE-01 `40 complete / 0 pending`; SCALE-02 `11 complete / 0 pending`; SCALE-03 `24 complete / 0 pending`; `384` Mongoose list sites; passed.
- `git diff --check`: passed before commit; staged diff check also passed.

### Front

- Focused Renewal Offers/Cron gate: `4` suites, `19` tests passed.
- `npm.cmd run build`: passed.
- `npm.cmd run lint`: passed.
- Impeccable detector/context on touched production UI: detector returned `[]`.
- `git diff --check`: passed before commit; staged diff check also passed.

Touched hand-written source/test files in both repos are at most 500 physical lines. The generated backend catalog `src/contracts/response-contract-catalog.json` is intentionally larger (`4955` physical lines) and is excluded from the hand-written-file constraint.

## Self-review against the brief

- Exact job/capability identity: covered; aliases remain blocked.
- Manual flag default-off, strict typed parsing, credential fail-closed behavior, and automatic-path independence: covered by config/runtime/capability tests.
- Provider page/item bounds and strict pagination/identity handling: covered by provider tests and implementation inspection.
- Bounded local snapshot and effective operation plan: covered by planning tests and `limit(20001)` sentinel.
- Dry-run read-only and truthful bounded preview: covered by service/dispatcher/Front tests.
- Ownership before provider calls, local reads, and each mutation plus optimistic mutation predicates: covered by phase-hook tests and implementation inspection.
- Canonical result boundary: covered by dispatcher/controller tests and Front canonical trigger tests.
- Existing specialized control uses the same receipted/guarded backend path: covered by page/service tests.
- No external state was contacted during validation.

## Concerns and non-claims

- No Hotmart/provider call, network integration, real MongoDB/production DB, browser/live-user session, deployment, promotion, push, merge, rebase, or `main` mutation was performed. Operational closure is not claimed.
- Automatic scheduler execution was preserved and tested at the dispatcher boundary; no claim is made that a production scheduler has run this recovered code.
- Backend test output includes existing Mongoose reserved-path/duplicate-index warnings and expected child-process SCALE-03 ratchet diagnostics; all required gates exited green.
- Front build output retains existing baseline-browser-mapping/Browserslist, Tailwind ambiguous-class, and large-chunk warnings; build and lint still exited green.
- Response catalog validation requires the real Front root; the gate was run with that root explicitly configured.
- Front working tree still contains only the pre-existing unrelated `.claude/settings.local.json` modification and `scripts/git-hooks/` untracked directory after the Task 7 commit.

## Round 1/5 independent-review fixes — 2026-09-07

Review disposition: all five Important findings fixed. P3 items were not addressed.

### Finding 1 — provider completeness and page bounds

Root cause: the first implementation bounded total accumulation but accepted a nullable/malformed `page_info`, accepted pages larger than the requested 100 items, and filtered missing product identities away before validating them. That allowed an incomplete snapshot to reach stale-deactivation planning.

Fix:

- Require exactly one object pagination envelope (`page_info`, `pageInfo`, or `pagination`) with only known token/has-more keys and valid types.
- Reject page length over 100 before any accumulation or local read.
- Validate every item as an object with required product, offer, and transaction identity before product filtering.
- Reject contradictory identity aliases and malformed identity values.
- Keep rejection before local snapshot reads and before any mutation.

### Finding 2 — progress and sale identity

Root cause: provider pages were aggregated by offer code only; a repeated transaction appearing under a new cursor was counted again, while contradictory aliases silently preferred the first path.

Fix:

- Normalize stable transaction identity from supported Hotmart transaction aliases.
- Reject duplicate transaction identities across and within pages, including a new cursor.
- Keep distinct transactions for the same offer as separate sales and aggregate them into one offer snapshot.
- Preserve repeated/non-progress cursor rejection and reject continuation after the page/item budget.

### Finding 3 — optimistic overwrite protection

Root cause: update predicates omitted observed `offerName`; deactivation predicates omitted observed `periodStart`, and absent values were not represented explicitly.

Fix:

- Include every decision/write-relevant observed field: `offerName`, `isActive`, `source`, `isManuallyEdited`, `lastSeenAt`, and `periodStart`, alongside `_id` and `offerCode`.
- Represent missing values with `$exists: false` and explicit nulls with `$exists: true, $eq: null`.
- Added mutation regressions that return `matchedCount: 0` only when the observed name/period predicate is present; omission would incorrectly settle success.

### Finding 4 — Front ambiguous retry idempotency

Root cause: each click generated a fresh live request ID, including after a timeout where the backend may have accepted the request.

Fix:

- Retain the live request ID in a ref after ambiguous timeout/network errors (`ECONNABORTED`, `ETIMEDOUT`, `ERR_NETWORK`, or timeout/network messages without a response).
- Reuse it on retry.
- Clear it after a definitive response, a definitive execution failure, or a non-ambiguous error; a later explicit execution then gets a new ID.
- Preview requests remain independent and never reuse the live ID.

### Finding 5 — canonical dispatcher normalizer

Root cause: an absent raw report normalized to `success: true`, and counters/plan state were only partially validated. Anomalous plans and over-cap values could therefore appear successful.

Fix:

- Require an object envelope with explicit boolean `success`, required bounded counters (`total`, `inserted`, `updated`, `errors`, `skipped`), valid optional counters, and a bounded `unknownNames` array.
- Require a valid bounded plan for dry-run and reject plans on live results.
- Require canonical plan state (`anomaly: false`, `truncated: false`, exact 20,000 limit, all counters <= cap, operation sum equal to `totalOperations`, and zero remaining when not truncated).
- Invalid values normalize to a generic unsuccessful result with no provider/internal detail and bounded public stats.

### Fresh RED evidence

Before the fixes, the focused regressions were run and failed for the expected missing behavior:

- Backend provider/dispatcher command: `npm.cmd test -- --runInBand tests/services/renewal/renewalSyncSafety.test.ts tests/services/cron/schedulerRenewalOfferDispatcher.test.ts` — `7 failed, 15 passed`; failures covered page 101, malformed `page_info`, missing product identity, contradictory aliases, repeated transaction, absent envelope, and anomalous/over-cap normalization.
- Front retry command: `npm.cmd test -- --runInBand src/pages/gerirAlunos/renewalOffers/__tests__/RenewalOffersPage.test.tsx` — `1 failed, 8 passed`; the retry received a different request ID after a timeout.
- Optimistic predicate command: `npm.cmd test -- --runInBand tests/services/renewal/renewalSyncSafety.test.ts -t "optimistic update predicate|optimistic deactivation predicate"` — `2 failed`; both tests resolved success because the observed field was absent from the predicate.

### Fresh GREEN evidence and gates

- Provider safety GREEN: `npm.cmd test -- --runInBand tests/services/renewal/renewalSyncSafety.test.ts` — `1/1` suite, `20/20` tests passed.
- Dispatcher safety GREEN: `npm.cmd test -- --runInBand tests/services/cron/schedulerRenewalOfferDispatcher.test.ts` — `1/1` suite, `5/5` tests passed.
- Combined provider/dispatcher GREEN: `2/2` suites, `25/25` tests passed.
- Backend focused Task 7 gate: `8/8` suites, `126/126` tests passed.
- Front focused gate: `4/4` suites, `20/20` tests passed.
- Backend `npm.cmd run types:check`: exit `0`.
- Backend `npm.cmd run lint`: exit `0`.
- Backend `npm.cmd run build`: exit `0`.
- Front `npm.cmd run lint`: exit `0`.
- Front `npm.cmd run build`: exit `0`.
- Backend route catalog: `409` runtime identities; passed.
- Backend response catalog with the real Front root: `409` decisions, `212` Front calls, `187` consumers; passed.
- Backend SCALE inventory: SCALE-01 `40 complete / 0 pending`; SCALE-02 `11 complete / 0 pending`; SCALE-03 `24 complete / 0 pending`; `384` Mongoose list sites; passed.
- Backend and Front `git diff --check`: passed before commit. All touched hand-written files remain <=500 physical lines.

### Round 1 commits

- Backend: `93445408 fix(cron): harden renewal offer safety boundaries`
- Front: `5bb65f9 fix(renewal): reuse ambiguous manual request ids`

Round 1 remains offline-only. No provider/network/real DB/browser/live-user/deploy/push/merge/rebase/main operation was performed. Existing Mongoose, ts-jest, Front browser-data, Tailwind, and chunk-size warnings remain non-blocking and are not silently reclassified as operational evidence.

## Round 2/5 scoped re-review fixes — 2026-09-07

Review disposition: both remaining Important findings fixed. Scope stayed limited to Front pending-request identity and provider pagination alias reconciliation.

### Finding A — Front retry identity across pending outcomes

Root cause: the previous classifier retained a live request ID only for transport-like errors without a response. A `409 COMPOSITE_EXECUTION_IN_PROGRESS` or `504` response therefore cleared the ID; a later retry could create a second composite execution while the original was still pending.

Fix:

- Retain the live request ID for `409 COMPOSITE_EXECUTION_IN_PROGRESS` and `COMPOSITE_EXECUTION_INDETERMINATE` responses.
- Retain it for HTTP `504` gateway-timeout responses, including responses carrying a structured error payload.
- Keep the existing narrow transport timeout/network classification.
- Continue clearing only after a resolved definitive result, a resolved unsuccessful execution, or a non-ambiguous error such as a different 409 conflict. Preview IDs remain independent.

### Finding B — provider pagination aliases and contradictions

Root cause: the strict parser required one nested pagination container and ignored previously supported top-level `next_page_token`, `has_more`, and `hasMore` aliases. Contradictions between root and nested values could be missed.

Fix:

- Reconcile `page_info`, `pageInfo`, `pagination`, top-level `next_page_token`, top-level `nextPageToken`, `has_more`, and `hasMore`.
- Allow multiple aliases only when their normalized values agree; reject malformed values, null/non-null token conflicts, contradictory cursors, contradictory flags, and invalid containers.
- Preserve strict page-size/item/page-count caps, repeated cursor checks, identity checks, and the no-local-read/no-mutation rejection boundary.
- A top-level cursor is now followed; top-level `has_more`/`hasMore: true` without a cursor is rejected rather than treated as terminal.

### Fresh Round 2 RED evidence

- Front sequence regression command: `npm.cmd test -- --runInBand src/pages/gerirAlunos/renewalOffers/__tests__/RenewalOffersPage.test.tsx -t "retains one live request id"` — `1 failed, 9 skipped`; timeout → 409 in-progress → 504 produced `3` request IDs instead of `1`.
- Backend pagination regression command: `npm.cmd test -- --runInBand tests/services/renewal/renewalSyncSafety.test.ts -t "top-level|contradictory top-level"` — `3 failed, 2 passed`; top-level cursor was rejected, contradictory tokens were allowed into an undefined second response, and contradictory flags were accepted as success.

### Fresh Round 2 GREEN evidence

- Front full focused command: `npm.cmd test -- --runInBand src/features/cron/components/__tests__/CronJobList.test.tsx src/features/renewalOffers/components/__tests__/RenewalOffersHeader.test.tsx src/services/__tests__/renewalOffersCanonical.test.ts src/pages/gerirAlunos/renewalOffers/__tests__/RenewalOffersPage.test.tsx` — `4/4` suites, `21/21` tests passed.
- Front page command after fix: `1/1` suite, `10/10` tests passed, including timeout → 409 in-progress → 504 → replay/success → new execution.
- Backend provider/dispatcher focused command: `npm.cmd test -- --runInBand tests/services/renewal/renewalSyncSafety.test.ts tests/services/cron/schedulerRenewalOfferDispatcher.test.ts` — `2/2` suites, `30/30` tests passed.
- Backend type gate: `npm.cmd run types:check` exit `0`.
- Backend lint gate: `npm.cmd run lint` exit `0`.
- Front lint gate: `npm.cmd run lint` exit `0`.
- Backend and Front `git diff --check`: exit `0` before staging; staged diff checks also passed.
- All touched hand-written source/test files remain <=500 physical lines.
- No route/response/SCALE catalog source changed in Round 2; those catalogs remain covered by the previous green Round 1 gates and were not regenerated.

### Round 2 commits

- Backend: `c4791353 fix(cron): reconcile renewal offer pagination aliases`
- Front: `17c73f2 fix(renewal): retain pending execution identity`

Round 2 remains offline-only. No provider/network/real DB/browser/live-user/deploy/push/merge/rebase/main operation was performed. Existing unrelated Front `.claude/settings.local.json` and `scripts/git-hooks/` remain untouched.

## Round 3/5 full-suite compatibility fix — 2026-09-07

The full-suite review found one remaining failure in the legacy `schedulerJobDispatcher.test.ts` case `normalizes renewal offers`. The production normalizer was intentionally not relaxed: the test fixture still supplied the removed implicit `{ upserted, deactivated, unknownNames }` envelope.

Fix was limited to `tests/services/cron/schedulerJobDispatcher.test.ts`: the shared RenewalOffer runner fixture now supplies the explicit valid contract (`success`, `total`, `inserted`, `updated`, `errors`, `skipped`, plus the existing counters). The original expected canonical stats remain unchanged (`total: 3`, `updated: 2`, `skipped: 1`). No production behavior or unrelated test was changed.

### Round 3 evidence

- RED: `npm.cmd test -- --runInBand tests/services/cron/schedulerJobDispatcher.test.ts -t "normalizes renewal offers"` — `1 failed, 26 skipped`; hardened normalizer returned the fixed failure because the fixture lacked explicit envelope fields.
- GREEN: `npm.cmd test -- --runInBand tests/services/cron/schedulerJobDispatcher.test.ts tests/services/cron/schedulerRenewalOfferDispatcher.test.ts` — `2/2` suites, `32/32` tests passed.
- `npm.cmd run types:check` — exit `0`.
- `npm.cmd run lint` — exit `0`.
- `git diff --check` — exit `0`.
- Touched hand-written backend files remain <=500 physical lines.
- Front was not touched; existing Front dirt remains preserved.

### Round 3 commit

- Backend: `cd95b95e fix(cron): align renewal dispatcher fixture contract`
- Report: `df3745b3 docs(cron): record dispatcher fixture fix`.

### Parent final verification

- Full backend suite with cached MongoMemoryServer downloads disabled and the real Front root configured: `457/457` suites and `3074/3074` tests passed; exit `0`.
- Backend types, lint, build, route catalog, response-contract catalog and SCALE catalogs passed. Catalog evidence: `409` runtime route identities; `409` response decisions, `212` Front calls and `187` consumers; SCALE-01 `40/0`, SCALE-02 `11/0`, SCALE-03 `24/0`, `384` Mongoose list sites.
- Front focused Task 7 gate: `4/4` suites and `21/21` tests passed; type check, lint and build passed.
- Backend `git diff --check f1f84908..HEAD` and Front `git diff --check 93c9aba2..HEAD` passed.
- All Task 7 touched hand-written TypeScript/JavaScript files remain at or below 500 physical lines. Existing unrelated Front `.claude/settings.local.json` and `scripts/git-hooks/` remain untouched.
- Independent final Round 3 review approved the fixture-only change with zero new Critical/Important findings and confirmed zero production-source weakening.

Round 3 remains offline-only: no provider/network/real DB/push/merge/rebase/main mutation was performed.
