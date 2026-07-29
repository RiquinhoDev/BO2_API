# Users Simple Pagination Design

## Status

Approved in conversation on 2026-07-29. Implementation must remain atomic
across the `remake` branches of `BO2_API` and `Front`.

## Problem

`GET /api/users/listUsersSimple` has two implementations inside one 417-line
controller function:

- a paged aggregation branch;
- a "load all" branch that removes the MongoDB limit for large requests.

The Front still contains a legacy `getAllUsers()` request with
`limit: 10000`, but production code no longer consumes `loadAllUsers` or calls
`useUsers(..., true)`. Only the hook itself and its tests retain that path. The
live dashboard already uses ordinary server-side pagination.

Keeping the unlimited branch creates an avoidable memory, latency, and response
size risk. Silently clamping an unknown consumer without updating the Front
could also truncate data. This change therefore migrates both repositories as
one compatibility-safe block.

## Goals

- Make `listUsersSimple` bounded by the canonical absolute maximum of 200.
- Preserve the current user payload and legacy pagination fields.
- Add the canonical `pagination` metadata without removing legacy fields.
- Remove the dead Front `loadAll` capability and its `limit: 10000` request.
- Keep failures visible; never mistake an incomplete response for the full
  dataset.
- Reduce `users.controller.ts` through a vertical domain extraction.

## Non-goals

- No new export endpoint.
- No response-envelope migration beyond additive pagination metadata.
- No changes to `/api/users/v2`, `/api/users/infinite`, or other user listings.
- No network calls to real integrations and no production Mongo access.
- No deployment from one repository before the paired change is ready.

## Chosen Architecture

### Backend

Replace `listUsersSimple` with a thin controller backed by a focused listing
service and Mongoose repository.

The boundary accepts only:

- `page`: positive integer string, optional;
- `limit`: positive integer string, optional;
- `status`: `active` or `inactive`, optional.

The canonical `paginate()` helper applies:

- default page: 1;
- default limit: 50;
- absolute maximum limit: 200;
- well-formed values above the maximum: clamp to 200.

Malformed, zero, or negative `page`/`limit` values fail at the strict input
boundary instead of reaching the helper.

The repository uses one bounded strategy:

1. build the existing deleted/status filter;
2. query with an explicit projection;
3. sort by `{ _id: 1 }`;
4. apply `skip` and `limit`;
5. load class names only for class IDs present on that page;
6. count documents using the exact same filter.

The service maps segregated Hotmart/CursEduca/combined fields into the legacy
user shape in one pure function. It must retain all fields currently returned
by the endpoint, including progress, status, platform IDs, class name, terms,
and access flags.

The response preserves:

```ts
{
  users,
  count,
  page,
  limit,
  totalPages,
  pagination: {
    page,
    limit,
    total: count,
    pages: totalPages,
  },
}
```

`debug`, `loadedAll`, email-specific logging, and unlimited-query strategies
are removed because they are not public data contracts and have no live Front
consumer.

### Frontend

`useUsers` becomes paged-only:

- remove `getAllUsers`;
- remove the `loadAll` argument;
- remove `allQuery`, `allUsers`, and `loadAllUsers`;
- cap requested page size at 200;
- retain page navigation and React Query caching.

The response normalizer prefers `pagination`, then falls back to the legacy
fields:

```ts
pagination?.total ?? count
pagination?.page ?? page
pagination?.limit ?? limit
pagination?.pages ?? totalPages
```

If both pagination formats are absent, the request fails with a stable contract
error. It must not infer that the returned page is the complete dataset.
React Query keeps the previous successful data while the visible error path is
reported through the existing toast behavior.

## Compatibility and Rollout Safety

- Backend keeps every legacy pagination field used by current or older Front
  builds.
- Front accepts both the new additive metadata and the old fields.
- A request for `limit=10000` receives at most 200 records and truthful metadata.
- The production Front no longer makes that request after this pair lands.
- Both repositories remain on `remake`; neither side deploys independently.
- If a future product requirement needs all users, implement a dedicated
  cursor/streaming export rather than restoring an unbounded JSON response.

## Error Handling

- Validation errors use the shared input boundary and central error handler.
- Repository/service failures reach the central handler; no raw error detail is
  returned.
- Front contract-normalization failures are explicit and retain cached data.
- No fallback silently substitutes `users.length` for the dataset total.

## Tests

### Backend RED/GREEN

- default request uses page 1, limit 50;
- `limit=10000` is clamped to 200;
- stable `_id` ordering composes with consecutive pages without duplicates or
  losses;
- active/inactive filters preserve their current semantics;
- projection contains every current response field;
- class lookup is limited to IDs from the current page;
- response contains both legacy fields and canonical `pagination`;
- extra query fields, invalid status values, and malformed/non-positive
  pagination values fail at the boundary;
- no query can execute without `.limit()`.

Use fakes for service/controller tests and MongoMemory for the repository
contract. `MONGOMS_RUNTIME_DOWNLOAD=false`; zero external network.

### Front RED/GREEN

- the hook requests at most 200;
- normalizes canonical pagination;
- falls back to the complete legacy pagination fields;
- rejects a response with neither metadata format;
- keeps the previous successful React Query data after a later contract error;
- no production source contains `limit: 10000`, `getAllUsers`,
  `loadAllUsers`, or `useUsers(..., true)`.

Run the Front contract/unit gates already defined by that repository. Do not
stage or alter the pre-existing `scripts/git-hooks/pre-commit` change.

## Acceptance

### BO2_API `remake`

- `npm.cmd run lint`
- `npm.cmd run types:check`
- `npx.cmd jest --ci`
- `npm.cmd run build`
- route catalog remains 437/437 and its evidence points to the live route line

### Front `remake`

- focused hook/contract tests
- repository lint, typecheck, unit tests, build, and required Playwright gate
- one Playwright process at a time

### Negative Proof

```powershell
rg -n "limit.?[:=].?10000|getAllUsers|loadAllUsers" src
rg -n "actualLimit|isLoadAll|optimized_full_load|DEBUG joao" src/controllers
```

Both searches must return no live implementation references in their
respective repositories.
