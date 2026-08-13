# OPS-02 Transversal Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every authenticated write/destructive route one exact OPS-02 decision, enforce the resulting authorization tier centrally, and close missing caps/idempotency/kill-switch/dry-run protections without changing success contracts or provider write ordering.

**Architecture:** Keep `src/security/route-catalog.json` factual. Derive the OPS-02 universe from `access === 'authenticated' && (writes || destructive)`, store operational decisions separately in `src/contracts/ops02-policy-inventory.json`, validate exact membership through `src/security/ops02Policy.ts`, and only then mount central authorization. Existing destructive/input helpers remain the single validation authorities.

**Tech Stack:** Node.js, Express, strict TypeScript, Jest/Supertest, JSON policy inventory, existing logger/correlation ID and provider boundaries.

## Global Constraints

- Work only on branch `remake`; never touch `main`.
- Offline only; never call real ActiveCampaign, Guru, Hotmart, CursEduca, Discord or production Mongo.
- Current catalog target is exactly 160 authenticated routes where `writes === true || destructive === true`; tests read the catalog directly.
- `MODERATOR` is read-only. Ordinary internal writes require `ADMIN | SUPER_ADMIN`. Provider/destructive/high-impact operations require `SUPER_ADMIN` unless an internal destructive operation is explicitly bounded and reversible.
- Preserve HTTP success payloads, write order, partial-failure semantics, compensation and current public error contracts.
- No `as any`, lint disables, `ts-ignore`, suppressions, weaker tests, duplicate validators, duplicate feature flags or new dependencies.
- Every bulk decision has a finite cap. Every provider/mixed write has an explicit provider plus kill-switch, idempotency/replay and dry-run/preview dispositions.
- Central authorization is not mounted until inventory validation is 160/160 GREEN.

---

## File Structure

- Create `src/contracts/ops02-policy-inventory.json` — one row per cataloged authenticated write/destructive route.
- Create `src/security/ops02Policy.ts` — typed JSON parsing, invariant validation and exact lookup.
- Create `tests/security/ops02PolicyInventory.test.ts` — exact-membership and mutation ratchet.
- Create `src/security/routeAuthorization.ts` — central role enforcement and safe audit.
- Create `tests/security/routeAuthorization.runtime.test.ts` — runtime role matrix.
- Modify `src/app.ts` — mount authorization after default-deny auth and before route handlers.
- Modify existing `src/security/*Input.ts` or provider/service code only when a reviewed row proves a missing guard.
- Modify `docs/HARDENING-WORKPLAN.md` only after evidence is GREEN.

---

### Task 1: OPS-02 schema and exact-membership ratchet

**Interfaces:**

```ts
export type Ops02Scope = 'internal' | 'provider' | 'mixed'
export type Ops02Authorization = 'internal-write' | 'super-admin'
export type Ops02Provider = 'activecampaign' | 'guru' | 'hotmart' | 'curseduca' | 'discord' | 'none'
export type GuardDisposition =
  | { kind: 'existing'; evidence: string }
  | { kind: 'added'; evidence: string }
  | { kind: 'not-applicable'; reason: string }
export type CapDisposition =
  | { kind: 'bounded'; max: number; evidence: string }
  | { kind: 'single-resource'; reason: string }

export interface Ops02Decision {
  method: string
  path: string
  scope: Ops02Scope
  provider: Ops02Provider
  authorization: Ops02Authorization
  destructive: boolean
  bulk: boolean
  cap: CapDisposition
  idempotency: GuardDisposition
  killSwitch: GuardDisposition
  dryRun: GuardDisposition
  reversibility: GuardDisposition
  evidence: string
}

export function validateOps02Policy(decisions: readonly Ops02Decision[]): void
export function getOps02Decision(method: string, path: string): Ops02Decision | null
export function isHighImpactDecision(decision: Ops02Decision): boolean
```

- [ ] **Step 1: RED exact membership**

```ts
const expected = routeCatalog
  .filter(route => route.access === 'authenticated' && (route.writes || route.destructive))
  .map(route => `${route.method} ${route.path}`)
  .sort()
const actual = ops02Inventory.map(row => `${row.method} ${row.path}`).sort()
expect(expected).toHaveLength(160)
expect(actual).toEqual(expected)
expect(new Set(actual).size).toBe(actual.length)
```

- [ ] **Step 2: RED mutations**

```ts
expect(() => validateOps02Policy(missingOne)).toThrow(/missing ops-02 decision/i)
expect(() => validateOps02Policy(duplicatedOne)).toThrow(/duplicate/i)
expect(() => validateOps02Policy(providerAsInternalWrite)).toThrow(/provider.*super-admin/i)
expect(() => validateOps02Policy(bulkWithoutFiniteCap)).toThrow(/bulk.*cap/i)
expect(() => validateOps02Policy(destructiveAdminNotReversible)).toThrow(/destructive/i)
```

- [ ] **Step 3: Prove RED**

```bash
npx.cmd jest --selectProjects unit --runInBand tests/security/ops02PolicyInventory.test.ts
```

- [ ] **Step 4: Implement JSON narrowing and invariants without casts.** Reject unknown enum strings, duplicate keys, missing/extra catalog identities, provider/mixed rows not `super-admin`, bulk rows without `cap.kind === 'bounded'`, and destructive `internal-write` rows whose reversibility is not explicit.

---

### Task 2: Internal CRUD/config families

**Families:** `classes`, `events`, `products`, `product-profiles`, `courses`, `course-lessons`, `tag-rules`, `tag-monitoring`, `testimonials`, `achievements`, `analytics`, `auth`, `clareza`, `dashboard`, `user-history`, `renewal`, `cron-tags`.

- [ ] **Step 1: Extract exact rows**

```bash
node -e "const r=require('./src/security/route-catalog.json'); const f=new Set(['classes','events','products','product-profiles','courses','course-lessons','tag-rules','tag-monitoring','testimonials','achievements','analytics','auth','clareza','dashboard','user-history','renewal','cron-tags']); console.log(r.filter(x=>x.access==='authenticated'&&(x.writes||x.destructive)&&f.has(x.path.split('/')[2])).map(x=>x.method+' '+x.path+' | d='+x.destructive).join('\n'))"
```

- [ ] **Step 2: Classify each extracted row.** Ordinary internal create/update/status writes -> `internal-write`; delete/permanent delete, auth unlock and security-sensitive config toggles -> `super-admin`. Single-resource CRUD gets `cap:{kind:'single-resource',reason:'single route identity; no caller-controlled batch'}`.

- [ ] **Step 3: Reuse live validators before adding guards.** Check `classesDestructiveInput.ts`, `eventsDestructiveInput.ts`, `productProfilesDestructiveInput.ts`, `tagMonitoringDestructiveInput.ts`, `testimonialsDestructiveInput.ts`, `cronTagsInput.ts`, plus the live auth/analytics input helpers. Do not repeat their parsing in controllers or policy code.

- [ ] **Step 4: Any source loop over caller-controlled collections becomes `bulk:true`; cite an existing finite bound or add one in the existing input authority under RED test first.**

- [ ] **Step 5: Checkpoint**

```bash
npx.cmd jest --selectProjects unit --runInBand tests/security/ops02PolicyInventory.test.ts
npm.cmd run types:check
```

---

### Task 3: Users, sync, cron and test-history families

**Families:** `users`, `sync`, `cron`, `test`.

- [ ] **Step 1: Extract exact rows**

```bash
node -e "const r=require('./src/security/route-catalog.json'); const f=new Set(['users','sync','cron','test']); console.log(r.filter(x=>x.access==='authenticated'&&(x.writes||x.destructive)&&f.has(x.path.split('/')[2])).map(x=>x.method+' '+x.path+' | d='+x.destructive).join('\n'))"
```

- [ ] **Step 2: Set every `destructive:true` row to `super-admin` unless a focused test proves it both finite and reversible.**

- [ ] **Step 3: Reuse `usersDestructiveInput.ts`, `syncDestructiveInput.ts`, `cronDestructiveInput.ts`, `testHistoryDestructiveInput.ts`.**

- [ ] **Step 4: Treat these named operations as bulk/high-impact:** `/api/users/bulkDelete`, `/bulkDeleteUnmatched`, `/bulkMerge`, `/api/sync/conflicts/auto-resolve`, `/bulk-resolve`, `/api/sync/curseduca/batch`, `/hotmart/batch`, `/execute-pipeline`, `/api/cron/tag-rules-only`. Each must have `bulk:true` and a finite cap before GREEN.

- [ ] **Step 5: Never replace ordered/partial writes with `Promise.all`; guards wrap the current ordering.**

- [ ] **Step 6: Checkpoint**

```bash
npx.cmd jest --selectProjects unit --runInBand tests/security/ops02PolicyInventory.test.ts tests/security/usersDestructiveValidation.test.ts tests/security/cronDestructiveValidation.test.ts
npm.cmd run types:check
```

Run the existing sync/test-history destructive suites too when those files are touched.

---

### Task 4: Provider/mixed families

**Families:** `activecampaign`, `ac`, `guru`, `discord-renewal`, `renewal-ac`, `hotmart`, `curseduca`; plus provider-touching rows in `classes`, `course-lessons`, `discovery`, `sync`, `users`.

- [ ] **Step 1: Extract primary provider-family rows**

```bash
node -e "const r=require('./src/security/route-catalog.json'); const f=new Set(['activecampaign','ac','guru','discord-renewal','renewal-ac','hotmart','curseduca']); console.log(r.filter(x=>x.access==='authenticated'&&(x.writes||x.destructive)&&f.has(x.path.split('/')[2])).map(x=>x.method+' '+x.path+' | d='+x.destructive).join('\n'))"
```

- [ ] **Step 2: Every external-provider mutation is `scope:'provider'|'mixed'` and `authorization:'super-admin'`.** This explicitly includes write-GETs `/api/curseduca/sync/universal`, `/api/curseduca/sync/universal/start`, `/api/guru/sync/all`, `/api/guru/sync/email/:email`, `/api/hotmart/sync/universal`.

- [ ] **Step 3: ActiveCampaign.** Reuse `activeCampaignDestructiveInput.ts`, the existing decision-engine dry-run and `AC_TAG_APPLY_ENABLED` where they govern the route. Product-tag apply/remove/sync and destructive test-cron remain SUPER_ADMIN. Do not create another AC flag.

- [ ] **Step 4: Guru.** Reuse `guruDestructiveInput.ts`. Snapshot delete, inactivation bulk/single, sync, provider reconciliation and webhook reprocess/migrate remain SUPER_ADMIN. Restore/revert stays SUPER_ADMIN because it mutates authoritative state.

- [ ] **Step 5: Discord/Renewal AC.** Reuse `discordRenewalDestructiveInput.ts` and `renewalAcDestructiveInput.ts`. Execute/send/test/scheduled-run and renewal execute/revert remain SUPER_ADMIN. Approval/plan rows may be `internal-write` only when the handler source contains no provider mutation in that request; otherwise keep SUPER_ADMIN.

- [ ] **Step 6: Hotmart/CursEduca/mixed sync.** Provider fetch + Mongo mutation with no provider write is `scope:'mixed'`; high-volume reconciliation remains SUPER_ADMIN. Record provider name and explicit reasons when kill-switch/dry-run are not applicable.

- [ ] **Step 7: Checkpoint**

```bash
npx.cmd jest --selectProjects unit --runInBand tests/security/ops02PolicyInventory.test.ts tests/security/activeCampaignDestructiveValidation.test.ts
npm.cmd run types:check
```

Run existing Guru/Discord/Renewal focused suites for every touched family; provider clients remain mocked.

---

### Task 5: Exact inventory close and mutation proof

- [ ] **Step 1:** `160/160`, zero duplicates, zero unknown identities, zero provider/mixed rows below SUPER_ADMIN, zero bulk rows without finite cap.
- [ ] **Step 2:** Mutate local test fixtures: remove one row, duplicate one row, downgrade one provider row, make one bulk cap non-finite, downgrade one destructive non-reversible row. Each mutation must fail for the intended invariant.
- [ ] **Step 3:** Restore and prove GREEN.

```bash
npx.cmd jest --selectProjects unit --runInBand tests/security/ops02PolicyInventory.test.ts
npm.cmd run types:check
```

- [ ] **Step 4: Commit**

```bash
git add src/contracts/ops02-policy-inventory.json src/security/ops02Policy.ts tests/security/ops02PolicyInventory.test.ts
git commit -m "feat(security): add exact ops02 policy inventory"
```

---

### Task 6: Central authorization + audit

**Interfaces:**

```ts
export function resolveAuthorizationTier(route: CatalogRouteMatch): AuthorizationTier
export function createRouteAuthorization(options?: RouteAuthorizationOptions): RequestHandler
```

- [ ] **Step 1: RED runtime matrix.** MODERATOR read=200; MODERATOR write=403; ADMIN internal write=200; ADMIN provider/high-impact=403; SUPER_ADMIN high-impact=200; denied calls never invoke handler/provider dependency; unmatched path still reaches 404.
- [ ] **Step 2: Resolve read routes to `read`; write/destructive routes must have an OPS-02 decision. Missing policy on a cataloged authenticated write fails closed before handler execution.**
- [ ] **Step 3: Audit only** actor ID, role, method, canonical route, tier, outcome and `res.locals.correlationId`; never body/token/email/query/header/provider payload/response/secret.
- [ ] **Step 4: Mount exactly here:**

```ts
app.use(defaultDenyAuth)
app.use(routeAuthorization)
app.use(express.json({ limit: '100kb' }))
_deps.registerRoutes(app)
```

- [ ] **Step 5: Checkpoint**

```bash
npx.cmd jest --selectProjects unit --runInBand tests/security/routeAuthorization.runtime.test.ts tests/security/ops02PolicyInventory.test.ts tests/security/defaultDenyAuth.test.ts
npm.cmd run types:check
```

---

### Task 7: Front gating + closeout

- [ ] **Step 1:** In `RiquinhoDev/Front` branch `remake`, create pure helpers `canRead`, `canWriteInternal`, `canExecuteHighImpact` from the existing `AuthContext.user.role`.
- [ ] **Step 2:** Search Front consumers of the 160 backend identities; read controls remain visible to MODERATOR, normal write controls require `canWriteInternal`, provider/destructive/high-impact controls require `canExecuteHighImpact`.
- [ ] **Step 3:** Run Front focused tests, type-check, lint and build; UI gating never substitutes backend enforcement.
- [ ] **Step 4:** Backend terminal gate: lint, `types:check`, offline full Jest, build, `git diff --check`, and negative escape scan.
- [ ] **Step 5:** Update `docs/HARDENING-WORKPLAN.md` only from evidence. Security & routes reaches 100% only after backend authorization + exact OPS-02 + Front gating are all GREEN; deployment/provisioning remains separate.
