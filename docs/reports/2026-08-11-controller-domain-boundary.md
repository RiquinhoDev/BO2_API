# Controller domain boundary closeout — 2026-08-11

## Outcome

ARCH-02 moved from 95% to 100% under the approved repository definition: no handwritten TypeScript source exceeds 500 physical lines, and non-HTTP support/service modules no longer live under `src/controllers`.

## Changes

- Moved 10 misplaced modules from `src/controllers` to canonical owners in `src/services` or `src/security`.
- Updated every production and test importer; no compatibility re-export or stale path remains.
- Replaced four explicit `any` mapping seams with the existing evaluation interfaces.
- Replaced the CursEduca support `console.log` with the canonical logger.
- Pruned four `no-explicit-any` and one `no-console` suppressions.
- Added a fail-closed controller-responsibility ratchet with a zero baseline and mutation coverage.

## TDD evidence

- RED: the new boundary test reported exactly 10 misplaced modules while its synthetic new-module mutation already passed.
- GREEN: the baseline is zero; only `clarezaController.ts` and `studentsController.ts` remain as explicitly classified legacy HTTP adapters, plus intentional `index.ts` barrels.
- Focused offline regression: 15 suites / 149 tests passed across controller ownership, central errors, ActiveCampaign, engagement, Guru analytics/snapshots, cron, CursEduca, tag evaluation, testimonials, routes, and response contracts.

## Constraints and caveats

- No route, response payload, database operation, external integration behavior, or write ordering was intentionally changed.
- No production API, MongoDB, Redis, deployment, or live environment was contacted.
- Sub-500 decomposition remains quality-driven: reaching this boundary does not prohibit future extractions when cohesion or testability justifies them.
- Windows sandbox ACL failures blocked `apply_patch` after the initial files. Movements used `git mv`; import-only edits used exact cardinality-checked UTF-8 no-BOM replacements and were followed immediately by TypeScript, lint, stale-path, and diff checks.

## Commits

- `009abf7` — `test(architecture): expose controller boundary debt`
- `6ecc855` — `refactor(architecture): enforce controller boundaries`

## Terminal verification

- `npm.cmd run lint:baseline:prune`: exit 0; suppression debt reduced by exactly five entries.
- `npm.cmd run lint`: exit 0.
- `npm.cmd run types:check`: exit 0.
- Focused ownership/domain regression: 15 suites / 149 tests passed.
- Full offline Jest (`MONGOMS_RUNTIME_DOWNLOAD=false`, `--runInBand`): 337/337 suites and 2094/2094 tests passed in 368.124 seconds.
- `npm.cmd run build`: exit 0.
- Response catalog: 439 decisions, 219 Front calls, 194 consumers; current.
- Final architecture ratchets: 3 suites / 12 tests passed; source-size debt 0 and controller-responsibility debt 0.
- `git diff --check`: clean; package and lockfile diff: empty.
