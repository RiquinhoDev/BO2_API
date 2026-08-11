# ARCH-03 Single Response Contract Design

## Goal

Close the response-contract pillar on `remake` without `/v1`, `/v2`, legacy aliases, permanent adapters, or regressions to the unowned Clareza HTML consumers. Before normalization, bring the missing Clareza stock comparator from `main` into `remake` using remake-quality architecture.

## Scope and authority

- All writes occur only on `remake`; `main` is read-only behavioral evidence.
- Existing `remake` implementations win over older `main` implementations.
- The only missing Clareza product identified by the branch comparison is the stock comparator: public query, search, partial/full refresh, snapshot storage, and scheduled refresh.
- The older monolithic `clarezaCarteiraService.ts` is not imported because `remake` already has the decomposed carteira implementation.
- No production API, MongoDB, Redis, deployment, or external HTML code is touched.

## Response taxonomy

The terminal repository has one policy, not one wrapper forced onto every HTTP representation.

### Application JSON

Every successful application API response uses:

```ts
interface SuccessResponse<T, M extends Record<string, unknown> | undefined = undefined> {
  success: true
  data: T
  meta?: M
}
```

Pagination, totals, filters, warnings, and other transport metadata belong in `meta`. Domain data belongs in `data`. Error responses use the existing central SEC-10 envelope.

### Public documents and protocol responses

- Clareza feeds consumed by external HTML/PHP remain byte/shape-compatible public JSON documents and are catalogued as `public-document`.
- Redirects remain redirects.
- Streams/downloads remain stream/file responses.
- Intentional empty success responses use `no-content`.

These are semantic HTTP representations, not legacy API versions.

### Forbidden terminal states

- No `/v1` or `/v2` response-version routes.
- No compatibility aliases or response adapters.
- No `domain-envelope`, `raw-json`, `501-only`, or `UNCLASSIFIED` catalog entries.
- No success payloads with fields split between top-level and `data`.
- No Front consumer performing multi-shape fallback parsing.

## Clareza comparator architecture

The comparator is ported by behavior, not copied from `main`.

- `comparador.types.ts`: closed DTOs for stock metrics, cache documents, search results, and refresh reports.
- `comparadorFmpClient.ts`: injected FMP transport using immutable runtime configuration, the shared throttle, bounded retries, and no ambient `process.env` reads.
- `comparadorStore.ts`: Redis cache plus Mongo snapshot persistence; retains five snapshots and exposes cache-first read.
- `comparador.service.ts`: pure search/symbol parsing plus orchestration with bounded concurrency and injected clock/client/store.
- `ClarezaComparadorData.ts`: strict snapshot schema with typed stock records.
- `clarezaController.ts`: two thin handlers preserving the PHP/HTML public document shapes and existing refresh authorization.
- `clareza.routes.ts`: `GET /comparador` and `POST /comparador/refresh`, both using the current error boundary conventions.
- `clareza.job.ts`: scheduled full refresh alongside the existing Clareza products; comparator failure is isolated and safely logged.

Query/read operations never call FMP. They read Redis, then Mongo. Refresh operations may call only the injected FMP client. Limits remain four comparison symbols and ten manually refreshed symbols.

## Migration architecture

Migration proceeds by cohesive route domain. Each domain is atomic across Back and the sibling Front when a known consumer exists:

1. Characterize current Back success/empty/error payloads and current Front parsing.
2. Prove RED for the desired canonical response.
3. Change Back to `successResponse(data, meta?)`.
4. Change every known Front consumer and schema in the same slice.
5. Remove the domain's transitional parser immediately.
6. Regenerate the reviewed response catalog and prove that only the intended identities changed family/shape.
7. Run focused Back+Front gates and commit one domain.

The migration starts with the 22 `raw-json` entries, then non-canonical `domain-envelope` domains with live Front consumers, then application routes without known Front consumers. Public Clareza documents are reclassified only after shape-equivalence tests. The final ratchet requires all mounted identities to be in the terminal taxonomy.

## Main-branch parity inventory

The port records a read-only parity inventory of Clareza routes and services from `origin/main` versus `remake`. Missing future functions are not silently imported during ARCH-03. If another main-only Clareza product is found, it must receive its own characterized port task before response normalization for that surface.

## Error and operational behavior

- SEC-10 remains the sole unexpected-error boundary.
- `IntegrationUnavailableError` remains 503.
- Partial refresh failures return aggregate counts without raw provider errors.
- Logs use the canonical redacting logger and safe metadata only.
- Existing authorization, CORS, rate limits, kill switches, and destructive validation remain unchanged.
- No migration changes write ordering, dry-run behavior, idempotency, or external side effects.

## Test strategy

### Comparator

- Contract tests copied from observable `main` behavior for search, symbols, empty cache, validation limits, and refresh results.
- Pure unit tests for normalization/search/selection.
- Adapter tests for FMP retry/rate limiting using fake HTTP only.
- MongoMemoryServer tests for Redis miss to Mongo fallback, snapshot retention, and partial refresh persistence.
- Router tests for public payload shape, authorization, 503, and central 500.
- Scheduled-job test proving comparator isolation and exact invocation.

### Response migration

- Back router-real tests for success, empty, pagination/meta, validation, and central errors.
- Front tests for loading, success, empty, error, export, and pagination where applicable.
- Cross-repo contract fixtures for each migrated consumer.
- Catalog mutation tests for new route, shape drift, family drift, unresolved Front call, and reintroduction of forbidden families.
- Public-document tests compare exact top-level shapes against the pre-migration behavior.

### Terminal gates

- Back lint-prune, lint, strict TypeScript, response checker, route catalog, full offline Jest, and build.
- Front lint, TypeScript, focused tests, full tests where available, and Vite build.
- Negative greps for versioned routes, legacy adapters, forbidden response families, stale imports, casts/suppressions, and direct production integration calls.
- `git diff --check`, lockfile proof, clean worktrees, and orphan-process audit.

## Definition of done

- Comparator behavior from `main` is present and tested on `remake` without importing the old architecture.
- External Clareza HTML feeds retain their public document contracts.
- Every application JSON success response uses `success/data/meta`.
- Every error uses the SEC-10 boundary.
- Catalog membership equals mounted route membership and contains zero forbidden families.
- Every normalized Front call has one exact parser and zero compatibility fallback.
- No versioned routes, aliases, permanent adapters, or dead legacy code remain.
- Back and Front terminal gates are green offline.
- Workplan marks ARCH-03 100% only after all criteria above are mechanically proven.
