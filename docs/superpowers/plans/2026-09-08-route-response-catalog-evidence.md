# Main parity route and response catalog evidence

Date: 2026-09-08

## Scope

This checkpoint reconciles the route and response catalogs after adding the Clareza, class, Discord renewal, and renewal parity surfaces. The Front repository was read only and was supplied explicitly through `RESPONSE_CONTRACT_FRONT_ROOT`.

The runtime contains 438 route identities: the previous 409 plus 29 new identities. The 29 comprise seven Clareza routes, two class routes, one Discord route, and nineteen renewal routes.

The renewal mounts preserve the canonical `main` public paths:

- `/api/renewal-hotmart-sales`
- `/api/renewal-ac-data`
- `/api/renewal-timeline`
- `/api/ac-tag-watch`
- `/api/products-sales-performance`
- two additional operations under `/api/renewal-ac`

The rejected aliases `/api/ac-renewal-data`, `/api/hotmart-sales`, and `/api/product-sales` are absent.

## RED and GREEN evidence

The production mount regression first returned 404 for an authenticated renewal parity request while the routers were not mounted. After adding the five canonical mounts to `src/routes/index.ts`, the same test passed for all nineteen route identities. Each route returns 401 without authentication and reaches a substituted inert handler after authentication; an unknown authenticated path remains 404. Controller handlers are substituted before the requests, so this test performs no provider or database work.

The route reconciler regression first selected a short suffix declaration for `/api/clareza/earnings/data`. A naive longest-suffix correction then selected an alias declaration for `/api/engagement/stats`. The final implementation infers the unique dominant mount prefix per route file before using line proximity, and the synthetic regression now covers both ambiguity classes.

The refund handler regression first proved that default dry-run wrote one `AcWriteLog`. The corrected handler performs zero local or provider writes in dry-run. Further tests prove that ownership loss blocks local and provider effects, provider failure rejects with its partial report, and a scan above 20,000 sale items fails before context loading or effects.

## Fresh validation

- Route catalog check: current, 438 runtime identities.
- Response contract check: current, 438 decisions, 209 Front calls, 185 consumers.
- Catalog and mount tests: 8 suites, 50 tests passed.
- Refund handler tests: 1 suite, 14 tests passed.
- Refund pipeline tests: 1 suite, 4 tests passed.
- TypeScript check: passed.
- ESLint for the refund handler and its direct test: passed with zero warnings.

The broader receipt integration run had one concurrent failure outside this ownership block: the ActiveCampaign execution ownership assertion did not observe a lost lease after an await. The refund and pipeline suites passed in that run; the execution-context owner was notified. This checkpoint does not claim that broader suite as green.

## Operational boundary

Validation was local and offline. It did not call providers, databases, deployment systems, or production. Live behavior and promotion remain outside this checkpoint.
