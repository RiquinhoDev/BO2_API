# Security Route Authorization and OPS-02 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the backend Security & routes workplan gaps with fail-closed role authorization and a transversal OPS-02 decision inventory, then pair the resulting capabilities with Front gating before claiming the macro pillar complete.

**Architecture:** Keep `route-catalog.json` factual. Derive role tiers centrally from authenticated route facts plus explicit OPS-02 high-impact decisions. Add one catalog-template matcher and one role checker shared by the existing `authorize(...)` middleware and the new central route authorization middleware. OPS-02 is an exact inventory of every `writes:true` or `destructive:true` route and is reviewed family-by-family without changing HTTP success contracts or write ordering.

**Tech Stack:** Node.js, Express, TypeScript strict mode, Jest/Supertest, JSON contract inventories, existing canonical logger/error boundary, React/Vite Front on `RiquinhoDev/Front` branch `remake` for paired UX gating.

## Global Constraints

- Work only on branch `remake`; never touch `main`.
- Everything remains offline. No real Mongo production target or provider call.
- Preserve runtime HTTP success contracts, write ordering, compensation, and current error handling unless the approved authorization policy intentionally changes access from allowed to `403`.
- `MODERATOR` is read-only.
- `ADMIN` can read and perform normal internal writes.
- `SUPER_ADMIN` can do everything `ADMIN` can do plus external-provider writes, destructive/high-impact operations, security-sensitive configuration, and account/role/permission administration.
- HTTP method alone never determines privilege; use factual `writes`/`destructive` metadata plus OPS-02 decisions.
- No `as any`, lint disables, `ts-ignore`, suppressions, or weaker tests as escape hatches.
- Reuse existing auth, logger, correlation ID, strict input validation, kill switches, dry-runs, idempotency mechanisms, and reviewer-owned catalogs.
- `route-catalog.json` remains factual and must not gain role policy fields.
- Unknown routes must retain normal 404 behavior; only cataloged authenticated routes without a valid authorization decision fail closed.
- Backend enforcement is authoritative; Front gating is UX only and cannot weaken backend enforcement.

---

## File Structure

### Backend policy and runtime

- Create `src/security/routeCatalogMatcher.ts` — pure method/path → canonical catalog route matcher.
- Create `src/security/roleAuthorization.ts` — shared role types/checker; `authorize(...)` delegates here.
- Create `src/security/ops02Policy.ts` — typed loader/validator for OPS-02 inventory and high-impact lookup.
- Create `src/contracts/ops02-policy-inventory.json` — exact decisions for all write/destructive route identities.
- Create `src/security/routeAuthorization.ts` — central Express middleware using matcher + role policy + safe audit metadata.
- Modify `src/middleware/auth.middleware.ts` — reuse the shared role checker in existing `authorize(...)`.
- Modify `src/app.ts` — mount central role authorization after default-deny authentication and before productive routes.

### Backend tests

- Create `tests/security/routeCatalogMatcher.test.ts`.
- Create `tests/security/roleAuthorizationPolicy.test.ts`.
- Create `tests/security/ops02PolicyInventory.test.ts`.
- Create `tests/security/routeAuthorization.runtime.test.ts`.
- Modify `tests/security/defaultDenyAuth.test.ts` only if composition-order assertions need the new layer represented; do not weaken existing default-deny cases.
- Reuse existing destructive-input/provider tests for focused family regressions.

### Front companion after backend policy stabilizes

- Create `RiquinhoDev/Front:src/features/auth/authorization.ts` — role/capability helpers matching the three backend tiers.
- Modify `RiquinhoDev/Front:src/contexts/AuthContext.tsx` only to expose typed role/capability helpers if needed; no login payload change.
- Add focused tests around capability decisions and representative high-impact controls before touching broad UI surfaces.
- Migrate destructive/provider controls family-by-family using the existing role from `AuthContext`.

---

### Task 1: Exact route matcher and shared role semantics

**Files:**
- Create: `src/security/routeCatalogMatcher.ts`
- Create: `src/security/roleAuthorization.ts`
- Modify: `src/middleware/auth.middleware.ts`
- Test: `tests/security/routeCatalogMatcher.test.ts`
- Test: `tests/security/roleAuthorizationPolicy.test.ts`

**Interfaces:**
- Consumes: `src/security/route-catalog.json`; existing Express `Request.user.role`.
- Produces:
  - `type AppRole = 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN'`
  - `type AuthorizationTier = 'read' | 'internal-write' | 'super-admin'`
  - `allowedRolesForTier(tier: AuthorizationTier): readonly AppRole[]`
  - `isRoleAllowed(role: string, allowedRoles: readonly AppRole[]): boolean`
  - `matchCatalogRoute(method: string, pathname: string): CatalogRouteMatch | null`

- [ ] **Step 1: Write matcher RED tests**

```ts
expect(matchCatalogRoute('GET', '/api/users/507f1f77bcf86cd799439011')).toMatchObject({
  method: 'GET',
  path: '/api/users/:id',
  access: 'authenticated',
})
expect(matchCatalogRoute('GET', '/api/does-not-exist')).toBeNull()
expect(() => matchCatalogRouteFrom([
  { method: 'GET', path: '/api/items/:id', access: 'authenticated' },
  { method: 'GET', path: '/api/items/:slug', access: 'authenticated' },
], 'GET', '/api/items/value')).toThrow(/ambiguous/i)
```

- [ ] **Step 2: Run matcher test and prove RED**

Run:
```bash
npx.cmd jest --selectProjects unit --runInBand tests/security/routeCatalogMatcher.test.ts
```
Expected: FAIL because matcher module/functions do not exist.

- [ ] **Step 3: Implement segment-based matching without external dependency**

```ts
export interface CatalogRouteMatch {
  method: string
  path: string
  access: 'public' | 'authenticated' | 'signature' | 'dead'
  writes: boolean
  destructive: boolean
}

function pathMatchesTemplate(template: string, pathname: string): boolean {
  const expected = normalizePath(template).split('/').filter(Boolean)
  const actual = normalizePath(pathname).split('/').filter(Boolean)
  if (expected.length !== actual.length) return false
  return expected.every((segment, index) => segment.startsWith(':') || segment === actual[index])
}
```

`matchCatalogRouteFrom()` filters by normalized method and path, returns `null` for zero matches, one match for exactly one, and throws on ambiguity. `matchCatalogRoute()` calls it with the canonical catalog.

- [ ] **Step 4: Add shared role semantics tests**

```ts
expect(allowedRolesForTier('read')).toEqual(['MODERATOR', 'ADMIN', 'SUPER_ADMIN'])
expect(allowedRolesForTier('internal-write')).toEqual(['ADMIN', 'SUPER_ADMIN'])
expect(allowedRolesForTier('super-admin')).toEqual(['SUPER_ADMIN'])
expect(isRoleAllowed('MODERATOR', allowedRolesForTier('internal-write'))).toBe(false)
expect(isRoleAllowed('SUPER_ADMIN', allowedRolesForTier('super-admin'))).toBe(true)
```

- [ ] **Step 5: Make existing `authorize(...)` delegate to the checker**

```ts
export const authorize = (...roles: AppRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Não autenticado' })
    if (!isRoleAllowed(req.user.role, roles)) {
      return res.status(403).json({ success: false, message: 'Sem permissões suficientes' })
    }
    next()
  }
}
```

Do not change the 401/403 bodies.

- [ ] **Step 6: Run focused tests**

```bash
npx.cmd jest --selectProjects unit --runInBand \
tests/security/routeCatalogMatcher.test.ts \
tests/security/roleAuthorizationPolicy.test.ts \
tests/middleware/auth.middleware.test.ts
```
If the auth middleware test path differs, run the existing test that covers `authorize` discovered in the repo; do not create a duplicate solely for the command.

- [ ] **Step 7: Run TypeScript checkpoint**

```bash
npm.cmd run types:check
```
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/security/routeCatalogMatcher.ts src/security/roleAuthorization.ts src/middleware/auth.middleware.ts tests/security/routeCatalogMatcher.test.ts tests/security/roleAuthorizationPolicy.test.ts
git commit -m "feat(security): centralize route role semantics"
```

---

### Task 2: OPS-02 exact inventory and fail-closed ratchet

**Files:**
- Create: `src/contracts/ops02-policy-inventory.json`
- Create: `src/security/ops02Policy.ts`
- Test: `tests/security/ops02PolicyInventory.test.ts`
- Read/reference: `src/security/route-catalog.json`
- Read/reference: existing destructive-input/provider kill-switch helpers in `src/security/` and provider services.

**Interfaces:**
- Consumes: every route where `writes === true || destructive === true`.
- Produces:
  - `type Ops02Scope = 'internal' | 'provider' | 'mixed'`
  - `type Ops02Authorization = 'internal-write' | 'super-admin'`
  - `interface Ops02Decision { method; path; scope; provider?; authorization; destructive; bulk; cap; idempotency; killSwitch; dryRun; reversibility; reason }`
  - `getOps02Decision(method: string, path: string): Ops02Decision | null`
  - `isHighImpactDecision(decision: Ops02Decision): boolean`

- [ ] **Step 1: Write exact-membership RED test**

```ts
const writeRoutes = routeCatalog
  .filter(route => route.access === 'authenticated' && (route.writes || route.destructive))
  .map(route => `${route.method} ${route.path}`)
  .sort()
const decisionKeys = OPS02_POLICY.map(decision => `${decision.method} ${decision.path}`).sort()
expect(decisionKeys).toEqual(writeRoutes)
```

Also assert uniqueness and forbid an entry whose route is not a write/destructive authenticated route.

- [ ] **Step 2: Prove RED with empty/minimal inventory in-memory fixture**

Run:
```bash
npx.cmd jest --selectProjects unit --runInBand tests/security/ops02PolicyInventory.test.ts
```
Expected: FAIL listing the current missing route identities.

- [ ] **Step 3: Populate factual decisions family-by-family, not mechanically**

For each current write/destructive route, record one decision. Apply these classification rules:

```ts
// provider or mixed provider write
scope: 'provider' | 'mixed'
authorization: 'super-admin'

// internal destructive defaults to super-admin unless explicitly bounded + reversible
scope: 'internal'
authorization: destructive && !provenReversible ? 'super-admin' : 'internal-write'

// ordinary internal write
scope: 'internal'
authorization: 'internal-write'
```

`cap`, `idempotency`, `killSwitch`, `dryRun`, and `reversibility` must each be an explicit decision string/object; do not use `TBD`, `unknown`, or an empty reason.

- [ ] **Step 4: Add structural fail-closed tests**

```ts
expect(providerDecision.provider).toBeTruthy()
expect(providerDecision.authorization).toBe('super-admin')
expect(bulkDecision.cap.kind).not.toBe('unbounded')
expect(destructiveInternal.authorization === 'super-admin' || destructiveInternal.reversibility.kind === 'reversible').toBe(true)
```

- [ ] **Step 5: Add mutation-style unit cases**

Create local mutated copies and prove each is rejected:
- remove one decision -> coverage error;
- downgrade provider `super-admin` -> error;
- remove provider name -> error;
- set bulk cap to unbounded -> error.

- [ ] **Step 6: Focused GREEN + TypeScript**

```bash
npx.cmd jest --selectProjects unit --runInBand tests/security/ops02PolicyInventory.test.ts
npm.cmd run types:check
```

- [ ] **Step 7: Commit**

```bash
git add src/contracts/ops02-policy-inventory.json src/security/ops02Policy.ts tests/security/ops02PolicyInventory.test.ts
git commit -m "feat(security): inventory ops02 write protections"
```

---

### Task 3: Central authorization middleware with safe audit

**Files:**
- Create: `src/security/routeAuthorization.ts`
- Modify: `src/app.ts`
- Test: `tests/security/routeAuthorization.runtime.test.ts`
- Test/possibly modify: `tests/security/defaultDenyAuth.test.ts`

**Interfaces:**
- Consumes: `matchCatalogRoute`, `getOps02Decision`, `allowedRolesForTier`, existing `logger`, `res.locals.correlationId`.
- Produces:
  - `createRouteAuthorization(options?): RequestHandler`
  - `resolveAuthorizationTier(route): AuthorizationTier`

- [ ] **Step 1: Write runtime RED tests using a tiny Express app**

Representative routes:
```ts
app.get('/api/example/:id', handler)
app.post('/api/internal-write', handler)
app.post('/api/provider-write', providerHandler)
```
Inject a small test catalog/policy through factory options so tests do not depend on unrelated production routes.

Prove:
- MODERATOR GET -> handler called, 200;
- MODERATOR internal POST -> 403, handler not called;
- ADMIN internal POST -> 200;
- ADMIN provider POST -> 403, provider dependency not called;
- SUPER_ADMIN provider POST -> 200 with provider dependency mocked;
- unknown path -> middleware calls `next()` and eventual 404 is preserved;
- cataloged authenticated route missing decision -> fail closed before handler.

- [ ] **Step 2: Prove RED**

```bash
npx.cmd jest --selectProjects unit --runInBand tests/security/routeAuthorization.runtime.test.ts
```
Expected: FAIL because middleware does not exist.

- [ ] **Step 3: Implement tier resolution**

```ts
export function resolveAuthorizationTier(route: CatalogRouteMatch): AuthorizationTier {
  if (!route.writes && !route.destructive) return 'read'
  const ops02 = getOps02Decision(route.method, route.path)
  if (!ops02) throw new Error(`Missing OPS-02 decision for ${route.method} ${route.path}`)
  return ops02.authorization
}
```

- [ ] **Step 4: Implement middleware fail-closed semantics**

```ts
const match = matchCatalogRoute(req.method, pathname)
if (!match) return next()
if (match.access !== 'authenticated') return next()
if (!req.user) return res.status(401).json({ success: false, message: 'Não autenticado' })
const tier = resolveAuthorizationTier(match)
if (!isRoleAllowed(req.user.role, allowedRolesForTier(tier))) {
  audit({ outcome: 'denied', tier, ...safeMetadata })
  return res.status(403).json({ success: false, message: 'Sem permissões suficientes' })
}
if (tier !== 'read') audit({ outcome: tier === 'super-admin' ? 'allowed-super-admin' : 'allowed-write', ...safeMetadata })
return next()
```

Use `req.originalUrl.split(/[?#]/, 1)[0]` for matching. Never log body, email, token, headers, query values, or provider response.

- [ ] **Step 5: Add audit redaction assertions**

```ts
expect(log.info).toHaveBeenCalledWith(
  'Autorização de rota',
  expect.objectContaining({
    actorId: 'admin-id',
    actorRole: 'ADMIN',
    method: 'POST',
    route: '/api/internal-write',
    tier: 'internal-write',
    outcome: 'allowed-write',
    correlationId: 'request-id',
  }),
)
expect(JSON.stringify(log.info.mock.calls)).not.toMatch(/alice@example|Bearer|secret|token/i)
```

- [ ] **Step 6: Mount in `createApp()` after default-deny auth**

Add injectable dependency for tests:
```ts
createRouteAuthorization?: () => RequestHandler
```
Composition order:
```ts
app.use(defaultDenyAuth)
app.use(routeAuthorization)
app.use(express.json({ limit: '100kb' }))
_deps.registerRoutes(app)
```
The middleware must not require parsed JSON.

- [ ] **Step 7: Run composition and auth tests**

```bash
npx.cmd jest --selectProjects unit --runInBand \
tests/security/routeAuthorization.runtime.test.ts \
tests/security/defaultDenyAuth.test.ts \
tests/app.test.ts
```
Use the actual existing app composition test filename if it differs.

- [ ] **Step 8: TypeScript checkpoint and commit**

```bash
npm.cmd run types:check
git add src/security/routeAuthorization.ts src/app.ts tests/security/routeAuthorization.runtime.test.ts tests/security/defaultDenyAuth.test.ts
git commit -m "feat(security): enforce route roles centrally"
```

---

### Task 4: OPS-02 provider/high-impact protections

**Files:**
- Modify: `src/contracts/ops02-policy-inventory.json`
- Modify only where inventory proves a missing mechanism: existing provider/security helper or service files identified by each decision.
- Test: existing provider/destructive suites plus new focused tests only where a mechanism is added.

**Interfaces:**
- Consumes: inventory entries with `scope:'provider'|'mixed'` or `authorization:'super-admin'`.
- Produces: every such decision backed by a concrete existing or newly added cap/replay/gate/preview mechanism.

- [ ] **Step 1: Group provider decisions by provider and existing authority**

Review ActiveCampaign, Guru, Discord, Hotmart, and CursEduca separately. For each entry, confirm the exact existing flag/helper before editing. Never invent a second flag if one already exists.

- [ ] **Step 2: For each provider family, write the missing-protection RED test before code**

Example for a missing kill switch:
```ts
expect(() => assertProviderWriteEnabled({ enabled: false })).toThrow(/disabled/i)
expect(mockProviderWrite).not.toHaveBeenCalled()
```

Example for a cap:
```ts
expect(parseBatchSize('201', 200)).toBe(200)
```

Use the feature's existing validation/gate helper where possible rather than introducing generic abstractions without a real second consumer.

- [ ] **Step 3: Implement the smallest missing protection and preserve ordering**

Do not parallelize provider writes or change compensation behavior in this task. Security caps/gates wrap the existing sequence.

- [ ] **Step 4: Run focused provider suite after each family**

Run the existing tests covering the touched provider plus `tests/security/ops02PolicyInventory.test.ts`.

- [ ] **Step 5: TypeScript checkpoint after each 15–25 route/protection wave**

```bash
npm.cmd run types:check
```

- [ ] **Step 6: Commit one provider family per coherent change**

Examples:
```bash
git commit -m "feat(security): harden activecampaign provider writes"
git commit -m "feat(security): harden guru provider writes"
git commit -m "feat(security): harden discord provider writes"
```

---

### Task 5: OPS-02 internal destructive and bulk protections

**Files:**
- Modify: `src/contracts/ops02-policy-inventory.json`
- Modify only the existing input/service helper of a route when the inventory proves a missing cap/replay/reversibility guard.
- Test: existing destructive-validation suites under `tests/security/` plus focused service/controller tests.

**Interfaces:**
- Consumes: internal OPS-02 decisions, especially `destructive:true` and `bulk:true`.
- Produces: explicit bounded/replay/reversibility evidence for every internal decision.

- [ ] **Step 1: Review internal decisions in route-family waves**

Recommended order: users/classes -> cron/sync history -> products/product profiles -> tag monitoring -> remaining internal writes.

- [ ] **Step 2: RED test missing caps or replay semantics before changes**

Bulk example:
```ts
expect(validateBulkInput({ ids: Array.from({ length: 201 }, (_, i) => String(i)) })).toEqual(
  expect.objectContaining({ ok: false }),
)
```

Reversible single-item example: test the existing soft-delete/revert behavior and record it as the explicit inventory proof rather than adding an unnecessary kill switch.

- [ ] **Step 3: Implement only missing protections**

Keep strict validation authorities in `src/security/*Input.ts` as the single source; do not duplicate schema checks in controllers.

- [ ] **Step 4: Focused tests + inventory ratchet + TypeScript per wave**

```bash
npx.cmd jest --selectProjects unit --runInBand tests/security/ops02PolicyInventory.test.ts <touched-focused-suites>
npm.cmd run types:check
```

- [ ] **Step 5: Commit by coherent route family**

```bash
git commit -m "feat(security): harden user destructive operations"
git commit -m "feat(security): harden class destructive operations"
```

---

### Task 6: Paired Front role gating on `RiquinhoDev/Front` remake

**Files:**
- Create: `src/features/auth/authorization.ts`
- Test: `src/features/auth/authorization.test.ts`
- Modify: `src/contexts/AuthContext.tsx` only if exposing helpers through context is simpler than importing pure helpers.
- Modify representative controls first, then all provider/high-impact/destructive controls found from the backend inventory's known Front consumers.

**Interfaces:**
- Consumes: existing `User.role` from `AuthContext` and the backend three-tier model.
- Produces:
  - `type AppRole = 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN'`
  - `canRead(role)`, `canWriteInternal(role)`, `canExecuteHighImpact(role)`

- [ ] **Step 1: RED capability helper tests**

```ts
expect(canRead('MODERATOR')).toBe(true)
expect(canWriteInternal('MODERATOR')).toBe(false)
expect(canWriteInternal('ADMIN')).toBe(true)
expect(canExecuteHighImpact('ADMIN')).toBe(false)
expect(canExecuteHighImpact('SUPER_ADMIN')).toBe(true)
```

- [ ] **Step 2: Implement pure helpers**

```ts
export const canRead = (role: AppRole) => true
export const canWriteInternal = (role: AppRole) => role === 'ADMIN' || role === 'SUPER_ADMIN'
export const canExecuteHighImpact = (role: AppRole) => role === 'SUPER_ADMIN'
```

- [ ] **Step 3: Type `AuthContext` role**

Change `role: string` to `role: AppRole` only after confirming dev-auth fixtures and auth response mocks use one of the three valid roles.

- [ ] **Step 4: Gate controls by backend tier**

For each Front consumer of a backend write/destructive route:
- read-only data remains visible to MODERATOR;
- normal write control hidden/disabled unless `canWriteInternal`;
- provider/high-impact control hidden/disabled unless `canExecuteHighImpact`.

Do not treat UI gating as backend security and do not change endpoint payloads.

- [ ] **Step 5: Focused Front tests, TypeScript, lint, build**

Run the repo's existing commands on branch `remake` and keep contract regeneration under the reviewer-owned process.

- [ ] **Step 6: Commit Front changes on Front `remake` only**

```bash
git commit -m "feat(auth): gate actions by admin role"
```

---

### Task 7: Security closeout and factual workplan update

**Files:**
- Modify: `docs/HARDENING-WORKPLAN.md`
- Test: all new security ratchets plus full repository gates.

**Interfaces:**
- Consumes: completed backend authorization + OPS-02 policy + Front gating evidence.
- Produces: factual Security & routes completion statement and updated macro table only after evidence is GREEN.

- [ ] **Step 1: Focused security gate**

```bash
MONGOMS_RUNTIME_DOWNLOAD=false npx.cmd jest --ci --runInBand --runTestsByPath \
tests/security/routeCatalogMatcher.test.ts \
tests/security/roleAuthorizationPolicy.test.ts \
tests/security/ops02PolicyInventory.test.ts \
tests/security/routeAuthorization.runtime.test.ts \
tests/security/defaultDenyAuth.test.ts
```

- [ ] **Step 2: Mutation proof**

Temporarily mutate in-memory test fixtures or a clean working-tree copy so that:
- one authenticated route loses role coverage;
- one provider write is downgraded to `internal-write`;
- one bulk cap becomes unbounded.

Each mutated test must fail for the intended reason; restore and rerun GREEN. Do not commit mutations.

- [ ] **Step 3: Standard backend gates**

```bash
npm.cmd run lint
npm.cmd run types:check
MONGOMS_RUNTIME_DOWNLOAD=false npx.cmd jest --ci --runInBand
npm.cmd run build
git diff --check
```

- [ ] **Step 4: Negative escape scan**

```bash
git grep -nE 'as[[:space:]]+any|eslint-disable|@ts-ignore|@ts-expect-error' -- src
```
Review every match; no new escape hatch may be introduced by this mission.

- [ ] **Step 5: Update workplan from evidence**

Mark role matrix and OPS-02 code-complete only when exact inventories are complete and gates are GREEN. Mark the macro Security & routes pillar 100% only after the paired Front gating evidence is also complete. Keep deployment/provisioning evidence explicitly separate.

- [ ] **Step 6: Commit closeout**

```bash
git add docs/HARDENING-WORKPLAN.md
git commit -m "docs(security): close route authorization and ops02"
```
