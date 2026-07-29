# Users Simple Pagination Implementation Plan

> Execute this plan on the existing `remake` branches of `BO2_API` and `Front`.
> The paired change is code-complete only when both repositories pass their
> gates. Never call real integrations or production Mongo.

**Goal:** Replace the unbounded `listUsersSimple` implementation with a bounded,
stable, testable vertical slice and migrate the Front to a truthful paged-only
contract.

**Architecture:** The API route validates a strict query and delegates to a thin
controller. A pure service owns the legacy response mapping and a Mongoose
repository owns filtering, projection, stable pagination, page-local class
lookup, and counting. The Front validates unknown HTTP data at the boundary,
accepts canonical or complete legacy pagination metadata, and keeps previous
React Query data when a later response violates the contract.

**Tech stack:** Express 5, TypeScript strict, Zod 3, Mongoose, Jest,
MongoMemoryServer; React 19, TanStack Query 5, Zod 3, Jest/Testing Library.

---

## Task 1: Prove the API boundary and mapping contract

**Files:**

- Create: `src/security/usersSimpleListInput.ts`
- Create: `src/services/users/usersSimpleList.service.ts`
- Test: `tests/security/usersSimpleListInput.test.ts`
- Test: `tests/services/users/usersSimpleList.service.test.ts`

### Step 1: Write failing boundary tests

Cover:

- empty input accepted;
- `page=2`, `limit=10000`, `status=active` reaches the handler;
- malformed, zero, negative, invalid status, and extra query keys return 400;
- the offline loopback marker is removed before strict parsing.

Run:

```powershell
npx.cmd jest --ci tests/security/usersSimpleListInput.test.ts
```

Expected: RED because the schema does not exist.

### Step 2: Implement the strict schema

Use `validatedSchema()` so strictness remains centralized. Accept only optional
positive integer strings for `page`/`limit` and `active|inactive` for `status`.
Do not clamp in Zod; the canonical `paginate()` helper owns the absolute cap.

### Step 3: Write failing pure mapping tests

Cover:

- combined data wins over platform/legacy fallbacks;
- Hotmart lesson progress is calculated when combined progress is absent;
- CursEduca uses canonical `progress.estimatedProgress`;
- legacy fields remain the final fallback;
- zero/false values are preserved;
- class name and every existing payload field remain present.

Run:

```powershell
npx.cmd jest --ci tests/services/users/usersSimpleList.service.test.ts
```

Expected: RED because the service does not exist.

### Step 4: Implement the pure service

Define narrow source/result types and a repository port. Keep the mapper pure.
The service calls `paginate(input)` with default 50 and max 200, delegates a
bounded query, and returns both legacy pagination fields and canonical
`pagination`.

### Step 5: Verify Task 1

```powershell
npx.cmd jest --ci tests/security/usersSimpleListInput.test.ts tests/services/users/usersSimpleList.service.test.ts
npm.cmd run types:check
```

Expected: GREEN.

## Task 2: Prove the bounded Mongoose repository

**Files:**

- Create: `src/services/users/mongooseUsersSimpleList.repository.ts`
- Test: `tests/services/users/mongooseUsersSimpleList.repository.test.ts`

### Step 1: Write failing MongoMemory contract tests

With `MONGOMS_RUNTIME_DOWNLOAD=false`, seed users/classes and prove:

- default page size never exceeds 50;
- a requested `limit=10000` is passed to the repository as 200;
- consecutive pages sorted by `{ _id: 1 }` have no duplicates or omissions;
- active/inactive filters retain existing `status`/`estado` semantics;
- soft-deleted users stay excluded;
- projection retains the complete legacy payload source and excludes an
  unrelated sentinel field;
- class lookup only requests class IDs on the current page;
- every user query includes a positive `.limit()`.

Run:

```powershell
$env:MONGOMS_RUNTIME_DOWNLOAD='false'
npx.cmd jest --ci tests/services/users/mongooseUsersSimpleList.repository.test.ts
```

Expected: RED because the repository does not exist.

### Step 2: Implement one bounded query strategy

Use explicit projection, `{ _id: 1 }`, `skip`, positive `limit`, `lean`, and
`maxTimeMS`. Count with the exact same filter. Resolve class names from the
current page only. Do not retain aggregation/load-all/debug branches.

### Step 3: Verify Task 2

Run the focused repository and service suites. Expected: GREEN with offline
Mongo only.

## Task 3: Wire the API vertical slice

**Files:**

- Create: `src/services/users/usersSimpleList.runtime.ts`
- Create: `src/controllers/usersSimpleList.controller.ts`
- Modify: `src/routes/users.routes.ts`
- Modify: `src/controllers/users.controller.ts`
- Modify only if route evidence moves: `src/security/route-catalog.json`
- Test: `tests/controllers/usersSimpleList.controller.test.ts`

### Step 1: Write failing controller tests

Use a fake service to prove:

- validated input reaches the service;
- response contains `users`, `count`, `page`, `limit`, `totalPages`, and
  `pagination`;
- errors call `next` and expose no raw detail.

Expected: RED before the controller/runtime exist.

### Step 2: Implement and wire

Create a thin controller and one runtime composition root. Replace the direct
route handler with `withValidatedInput(usersSimpleListInput, listUsersSimple)`.
Delete the old 417-line handler and only imports/types proven orphaned by `rg`.
Keep the route path unchanged.

### Step 3: Run focused API proof

```powershell
npx.cmd jest --ci tests/security/usersSimpleListInput.test.ts tests/services/users/usersSimpleList.service.test.ts tests/services/users/mongooseUsersSimpleList.repository.test.ts tests/controllers/usersSimpleList.controller.test.ts
npm.cmd run types:baseline:update
npm.cmd run lint:baseline:prune
npm.cmd run lint
npm.cmd run types:check
```

Expected: GREEN; type and lint baselines never rise.

## Task 4: Prove the Front contract normalizer

**Files (Front repository):**

- Create: `src/hooks/usersListContract.ts`
- Test: `src/hooks/__tests__/usersListContract.test.ts`

### Step 1: Write failing normalizer tests

Cover:

- canonical `pagination` is preferred;
- complete legacy `count/page/limit/totalPages` is accepted;
- malformed users or pagination metadata are rejected;
- missing pagination metadata throws a stable contract error;
- `users.length` is never inferred as total.

Run:

```powershell
yarn.cmd test --runInBand src/hooks/__tests__/usersListContract.test.ts
```

Expected: RED because the normalizer does not exist.

### Step 2: Implement boundary normalization

Use Zod against `unknown` HTTP data. Keep response objects passthrough-compatible
while validating the fields consumed by the hook. Return one normalized paged
result. No type assertion may substitute for runtime validation.

### Step 3: Verify Task 4

Run the focused normalizer suite. Expected: GREEN.

## Task 5: Migrate `useUsers` to paged-only

**Files (Front repository):**

- Modify: `src/hooks/useUsers.ts`
- Modify: `src/hooks/__tests__/userAndBusinessHooks.test.tsx`

### Step 1: Rewrite tests to RED

Prove:

- requests cap page size at 200;
- canonical and legacy responses both populate the hook;
- a later invalid response reports an error while retaining previous data via
  `placeholderData: keepPreviousData`;
- page navigation still uses zero-based UI to one-based API conversion;
- the hook no longer exposes `loadAllUsers` or `allUsers`.

Run the focused hook suite. Expected: RED against the old load-all hook.

### Step 2: Implement the paged-only hook

Remove `getAllUsers`, the `loadAll` parameter, `allQuery`, `allUsers`, and
`loadAllUsers`. Use the normalizer and cap requests at 200. Configure TanStack
Query to retain previous successful page data while a new request is pending or
fails contract validation.

### Step 3: Negative proof

```powershell
rg -n "limit.?[:=].?10000|getAllUsers|loadAllUsers|users-all|useUsers\\([^\\n]*true" src
```

Expected: no production implementation matches.

## Task 6: Full paired verification

### BO2_API

```powershell
rg -n "actualLimit|isLoadAll|optimized_full_load|DEBUG joao" src/controllers
npm.cmd run lint
npm.cmd run types:check
$env:MONGOMS_RUNTIME_DOWNLOAD='false'
npx.cmd jest --ci
npm.cmd run build
```

Expected: negative grep, lint 0, TypeScript 0/0, Jest green with only documented
skips, build 0, zero external network.

### Front

```powershell
yarn.cmd format:check
yarn.cmd lint
yarn.cmd test --runInBand
yarn.cmd build
yarn.cmd test:e2e
```

Run Playwright once, never in parallel. Expected: all gates green.

### Review

- inspect both diffs and `git diff --check`;
- confirm both branches are `remake`;
- confirm `scripts/git-hooks/pre-commit` remains staged and unchanged;
- confirm no lockfile or dependency changes;
- confirm no real API/production Mongo configuration was used.

## Task 7: Commit and publish the atomic pair

### BO2_API

Commit only the backend files with:

```text
refactor(users): bound simple listing
```

### Front

Commit only the Front files with:

```text
refactor(users): consume paged simple listing
```

Use explicit path-scoped commit arguments so the user's pre-staged
`scripts/git-hooks/pre-commit` is not included or unstaged. Push both existing
`remake` branches only after both full gates are green. Report both commit IDs
and remote verification together; neither side is independently deployable.
