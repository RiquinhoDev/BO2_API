# Security Route Authorization Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the fail-closed route-role foundation and exact OPS-02 route universe without changing productive handler semantics beyond the approved 403 authorization boundary.

**Architecture:** Keep `route-catalog.json` factual. Add a pure route-template matcher, a shared role checker, and a central authorization middleware mounted after default-deny authentication. In parallel, derive the exact authenticated write/destructive route universe into a typed OPS-02 inventory whose entries may remain `pending` in this foundation phase; Phase B will review and close those entries family-by-family.

**Tech Stack:** Node.js, Express, TypeScript strict mode, Jest/Supertest, existing route catalog, existing canonical logger/error boundary.

## Global Constraints

- Work only on `remake`; never touch `main`.
- Everything offline; no real provider or production Mongo call.
- `MODERATOR` is read-only; `ADMIN` can perform normal internal writes; `SUPER_ADMIN` owns provider/high-impact writes.
- Preserve existing 401/403 bodies, HTTP success payloads, write ordering, compensation, and error handling.
- No `as any`, lint disables, `ts-ignore`, suppressions, or weaker tests.
- `route-catalog.json` stays factual; role policy must not be added to it.
- Unknown/unmounted paths keep normal 404 behavior.
- A cataloged authenticated route with no valid role decision fails closed before the handler.

---

### Task 1: Pure route matcher and shared role checker

**Files:**
- Create: `src/security/routeCatalogMatcher.ts`
- Create: `src/security/roleAuthorization.ts`
- Modify: `src/middleware/auth.middleware.ts`
- Create: `tests/security/routeCatalogMatcher.test.ts`
- Create: `tests/security/roleAuthorizationPolicy.test.ts`

**Interfaces:**

```ts
export type CatalogAccess = 'public' | 'authenticated' | 'signature' | 'dead'
export interface CatalogRouteMatch {
  method: string
  path: string
  access: CatalogAccess
  writes: boolean
  destructive: boolean
}
export function matchCatalogRouteFrom(
  catalog: readonly CatalogRouteMatch[],
  method: string,
  pathname: string,
): CatalogRouteMatch | null
export function matchCatalogRoute(method: string, pathname: string): CatalogRouteMatch | null

export type AppRole = 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN'
export type AuthorizationTier = 'read' | 'internal-write' | 'super-admin'
export function allowedRolesForTier(tier: AuthorizationTier): readonly AppRole[]
export function isRoleAllowed(role: string, allowedRoles: readonly AppRole[]): boolean
```

- [ ] **Step 1: Add RED matcher tests**

```ts
expect(matchCatalogRoute('GET', '/api/users/507f1f77bcf86cd799439011')).toMatchObject({
  method: 'GET',
  path: '/api/users/:id',
  access: 'authenticated',
})
expect(matchCatalogRoute('get', '/api/users/507f1f77bcf86cd799439011/')).toMatchObject({
  path: '/api/users/:id',
})
expect(matchCatalogRoute('GET', '/api/does-not-exist')).toBeNull()
expect(() => matchCatalogRouteFrom([
  { method: 'GET', path: '/api/items/:id', access: 'authenticated', writes: false, destructive: false },
  { method: 'GET', path: '/api/items/:slug', access: 'authenticated', writes: false, destructive: false },
], 'GET', '/api/items/value')).toThrow(/ambiguous/i)
```

- [ ] **Step 2: Run RED**

```bash
npx.cmd jest --selectProjects unit --runInBand tests/security/routeCatalogMatcher.test.ts
```
Expected: module/function-not-found failure.

- [ ] **Step 3: Implement segment matcher**

```ts
function normalizePath(value: string): string {
  const path = value.split(/[?#]/, 1)[0]
  const normalized = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
  return normalized.toLowerCase()
}

function pathMatchesTemplate(template: string, pathname: string): boolean {
  const expected = normalizePath(template).split('/').filter(Boolean)
  const actual = normalizePath(pathname).split('/').filter(Boolean)
  if (expected.length !== actual.length) return false
  return expected.every((segment, index) => segment.startsWith(':') || segment === actual[index])
}
```

`matchCatalogRouteFrom` must filter by uppercase method + template match, return `null` for zero, the match for one, and throw `Ambiguous route catalog match: METHOD path` for more than one.

- [ ] **Step 4: Add RED role tests**

```ts
expect(allowedRolesForTier('read')).toEqual(['MODERATOR', 'ADMIN', 'SUPER_ADMIN'])
expect(allowedRolesForTier('internal-write')).toEqual(['ADMIN', 'SUPER_ADMIN'])
expect(allowedRolesForTier('super-admin')).toEqual(['SUPER_ADMIN'])
expect(isRoleAllowed('MODERATOR', allowedRolesForTier('internal-write'))).toBe(false)
expect(isRoleAllowed('ADMIN', allowedRolesForTier('internal-write'))).toBe(true)
expect(isRoleAllowed('SUPER_ADMIN', allowedRolesForTier('super-admin'))).toBe(true)
expect(isRoleAllowed('UNKNOWN', allowedRolesForTier('read'))).toBe(false)
```

- [ ] **Step 5: Implement role checker and reuse it from `authorize(...)`**

`authorize` keeps its current response bodies. Change its rest parameter to `AppRole[]` and delegate the membership check to `isRoleAllowed`.

- [ ] **Step 6: Add direct `authorize(...)` compatibility assertions in `roleAuthorizationPolicy.test.ts`**

Use mocked request/response/next to prove:
- no `req.user` -> 401 `{ success:false, message:'Não autenticado' }`;
- MODERATOR against `[ADMIN, SUPER_ADMIN]` -> 403 `{ success:false, message:'Sem permissões suficientes' }`;
- ADMIN against `[ADMIN, SUPER_ADMIN]` -> `next()` exactly once.

- [ ] **Step 7: Focused GREEN**

```bash
npx.cmd jest --selectProjects unit --runInBand \
tests/security/routeCatalogMatcher.test.ts \
tests/security/roleAuthorizationPolicy.test.ts
```
Expected: 2 suites GREEN.

- [ ] **Step 8: TypeScript checkpoint**

```bash
npm.cmd run types:check
```
Expected: exit 0.

- [ ] **Step 9: Commit**

Commit message: `feat(security): centralize route role semantics`.

---

### Task 2: Exact OPS-02 universe with pending-status ratchet

**Files:**
- Create: `src/contracts/ops02-policy-inventory.json`
- Create: `src/security/ops02Policy.ts`
- Create: `tests/security/ops02PolicyInventory.test.ts`
- Read: `src/security/route-catalog.json`

**Interfaces:**

```ts
export type Ops02Status = 'pending' | 'complete'
export type Ops02Scope = 'internal' | 'provider' | 'mixed'
export type Ops02Authorization = 'internal-write' | 'super-admin'
export interface Ops02InventoryEntry {
  method: string
  path: string
  status: Ops02Status
  scope?: Ops02Scope
  provider?: 'activecampaign' | 'guru' | 'discord' | 'hotmart' | 'curseduca'
  authorization?: Ops02Authorization
  reason: string
}
export function ops02RouteKey(method: string, path: string): string
export function validateOps02Inventory(
  inventory: readonly Ops02InventoryEntry[],
  catalog: readonly CatalogRouteMatch[],
): string[]
export function getOps02Entry(method: string, path: string): Ops02InventoryEntry | null
```

- [ ] **Step 1: Write RED coverage test against an empty fixture**

```ts
const errors = validateOps02Inventory([], routeCatalog)
expect(errors).toContain(expect.stringMatching(/missing OPS-02 decision/i))
```

The production assertion compares the sorted inventory keys to exactly the catalog routes where `access === 'authenticated' && (writes || destructive)`.

- [ ] **Step 2: Run RED**

```bash
npx.cmd jest --selectProjects unit --runInBand tests/security/ops02PolicyInventory.test.ts
```
Expected: module/function-not-found failure.

- [ ] **Step 3: Implement typed validator**

Validator rules for this foundation phase:
- exact membership: no missing, extra, or duplicate identities;
- every entry has a non-empty `reason`;
- `complete` requires `scope` and `authorization`;
- `provider|mixed` complete entries require `provider` and `authorization:'super-admin'`;
- `pending` is allowed temporarily and counted exactly.

- [ ] **Step 4: Populate the production inventory mechanically only for factual identity/status**

Create one entry for every current authenticated `writes:true || destructive:true` route, in sorted `METHOD path` order:

```json
{
  "method": "POST",
  "path": "/api/example",
  "status": "pending",
  "reason": "OPS-02 protection review pending"
}
```

Do not guess scope/provider/cap/idempotency in this task. Those are Phase B review decisions.

- [ ] **Step 5: Add production ratchet assertions**

```ts
expect(validateOps02Inventory(OPS02_POLICY, routeCatalog)).toEqual([])
expect(OPS02_POLICY.filter(entry => entry.status === 'pending')).toHaveLength(EXACT_PENDING_BASELINE)
```

Set `EXACT_PENDING_BASELINE` to the factual count produced by the inventory in this task. Also assert that changing one route identity or adding one new write route to a local catalog fixture makes validation fail.

- [ ] **Step 6: Focused GREEN + TypeScript**

```bash
npx.cmd jest --selectProjects unit --runInBand tests/security/ops02PolicyInventory.test.ts
npm.cmd run types:check
```

- [ ] **Step 7: Commit**

Commit message: `test(security): inventory ops02 route decisions`.

The commit is allowed to retain a non-zero `pending` baseline because it is an explicit ratchet, not a completion claim. Phase B must drive it to zero before Security & routes can be 100%.

---

### Task 3: Central role middleware with pending-safe deployment rule

**Files:**
- Create: `src/security/routeAuthorization.ts`
- Modify: `src/app.ts`
- Create: `tests/security/routeAuthorization.runtime.test.ts`
- Modify: `tests/bootstrap/createApp.test.ts`
- Re-run: `tests/security/defaultDenyAuth.test.ts`

**Interfaces:**

```ts
export interface RouteAuthorizationOptions {
  matchRoute?: typeof matchCatalogRoute
  getOps02Entry?: typeof getOps02Entry
  log?: AppLogger
}
export function resolveAuthorizationTier(
  route: CatalogRouteMatch,
  ops02: Ops02InventoryEntry | null,
): AuthorizationTier
export function createRouteAuthorization(options?: RouteAuthorizationOptions): RequestHandler
```

Foundation behavior:
- authenticated `writes:false && destructive:false` -> `read`;
- authenticated write/destructive with OPS-02 `complete` -> use its `authorization`;
- authenticated write/destructive with OPS-02 `pending` -> **fail closed with 503 `SECURITY_POLICY_PENDING` before handler**;
- authenticated write/destructive with no OPS-02 entry -> **fail closed with 500 `SECURITY_POLICY_MISSING` before handler**;
- public/signature/dead or no catalog match -> `next()`; this preserves existing auth authorities and 404 behavior.

The 503 pending behavior means this middleware must **not be enabled in `createApp` until Phase B reaches zero pending**. This task builds and tests it behind an explicit dependency flag only.

- [ ] **Step 1: Write runtime RED tests**

Use factory-injected matcher/OPS-02 lookup and a tiny Express app. Prove:
- MODERATOR read -> 200 and handler called;
- MODERATOR complete internal-write -> 403 and handler not called;
- ADMIN complete internal-write -> 200;
- ADMIN complete super-admin -> 403;
- SUPER_ADMIN complete super-admin -> 200;
- pending write -> 503 `{ success:false, code:'SECURITY_POLICY_PENDING', message:'Política de segurança ainda não concluída' }`, handler not called;
- missing write decision -> 500 `{ success:false, code:'SECURITY_POLICY_MISSING', message:'Política de segurança indisponível' }`, handler not called;
- unmatched path -> next and eventual 404.

- [ ] **Step 2: Run RED**

```bash
npx.cmd jest --selectProjects unit --runInBand tests/security/routeAuthorization.runtime.test.ts
```
Expected: module/function-not-found failure.

- [ ] **Step 3: Implement safe audit metadata**

For denied requests and allowed non-read writes log only:

```ts
{
  actorId: req.user.id,
  actorRole: req.user.role,
  method: req.method,
  route: match.path,
  tier,
  outcome,
  correlationId: String(res.locals.correlationId ?? '')
}
```

Never log body, email, token, query values, headers, provider payload, or raw error.

- [ ] **Step 4: Implement middleware responses exactly as tested**

Keep existing auth 401/403 bodies for role denial. Policy-pending/missing responses are new configuration-boundary responses and must never reach productive handlers.

- [ ] **Step 5: Add optional composition hook to `createApp` but keep production default disabled until Phase B**

Extend dependencies with:

```ts
routeAuthorizationEnforce?: boolean
createRouteAuthorization?: () => RequestHandler
```

Composition:

```ts
app.use(defaultDenyAuth)
if (_deps.routeAuthorizationEnforce) app.use(routeAuthorization)
app.use(express.json({ limit: '100kb' }))
_deps.registerRoutes(app)
```

Do not enable the flag from bootstrap in this foundation plan.

- [ ] **Step 6: Update `tests/bootstrap/createApp.test.ts`**

Prove an injected route-authorization handler:
- is not called when `routeAuthorizationEnforce:false`;
- is called after the injected authenticate handler when both auth and route authorization are enabled;
- executes before the registered productive route handler.

- [ ] **Step 7: Focused GREEN**

```bash
npx.cmd jest --selectProjects unit --runInBand \
tests/security/routeAuthorization.runtime.test.ts \
tests/bootstrap/createApp.test.ts \
tests/security/defaultDenyAuth.test.ts
```

- [ ] **Step 8: TypeScript checkpoint**

```bash
npm.cmd run types:check
```
Expected: exit 0.

- [ ] **Step 9: Commit**

Commit message: `feat(security): add fail-closed route authorization`.

---

### Task 4: Foundation closeout and Phase B handoff

**Files:**
- Modify: `docs/HARDENING-WORKPLAN.md` only to record factual foundation progress; do not mark Security & routes complete.
- Create: `docs/superpowers/plans/2026-08-13-security-ops02-hardening.md` after Task 2 provides the exact pending identities.

- [ ] **Step 1: Run foundation security gate**

```bash
MONGOMS_RUNTIME_DOWNLOAD=false npx.cmd jest --ci --runInBand --runTestsByPath \
tests/security/routeCatalogMatcher.test.ts \
tests/security/roleAuthorizationPolicy.test.ts \
tests/security/ops02PolicyInventory.test.ts \
tests/security/routeAuthorization.runtime.test.ts \
tests/security/defaultDenyAuth.test.ts \
tests/bootstrap/createApp.test.ts
```

- [ ] **Step 2: Run TypeScript and lint checkpoint**

```bash
npm.cmd run types:check
npm.cmd run lint
```

- [ ] **Step 3: Record exact foundation facts**

Document:
- authenticated route count covered by matcher/role derivation;
- exact write/destructive OPS-02 universe count;
- exact pending count;
- production role middleware remains disabled while pending > 0.

- [ ] **Step 4: Write Phase B plan from the actual pending inventory**

The Phase B plan must enumerate concrete route families and existing protection authorities found during review. It must not use placeholders such as “remaining routes”.

- [ ] **Step 5: Commit docs/handoff**

Commit message: `docs(security): record authorization foundation`.
