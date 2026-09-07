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
