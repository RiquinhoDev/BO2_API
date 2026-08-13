# OPS-02 Transversal Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every authenticated write/destructive route one exact OPS-02 decision, enforce the resulting authorization tier centrally, and close missing caps/idempotency/kill-switch/dry-run protections without changing success contracts or provider write ordering.

**Architecture:** Keep `src/security/route-catalog.json` factual and derive the exact OPS-02 universe from `access === 'authenticated' && (writes || destructive)`. Store operational decisions separately in `src/contracts/ops02-policy-inventory.json`, validate them through one typed loader, and mount one central authorization middleware that uses the already-created route matcher and shared role checker. Existing strict input authorities such as `usersDestructiveInput.ts`, `guruDestructiveInput.ts`, `activeCampaignDestructiveInput.ts`, `discordRenewalDestructiveInput.ts`, `syncDestructiveInput.ts`, and peers remain the single validation source.

**Tech Stack:** Node.js, Express, strict TypeScript, Jest/Supertest, JSON policy inventory, existing logger/correlation ID, existing provider/input boundaries.

## Global Constraints

- Work only on branch `remake`; never touch `main`.
- Everything remains offline; never call real ActiveCampaign, Guru, Hotmart, CursEduca, Discord or production Mongo.
- Current factual universe is 160 authenticated routes where `writes === true || destructive === true`; tests must read the catalog directly so copied terminal output is never the authority.
- `MODERATOR` is read-only; ordinary internal writes require `ADMIN | SUPER_ADMIN`; provider, destructive and high-impact operations require `SUPER_ADMIN` unless an internal destructive operation is explicitly proven bounded and reversible.
- Preserve HTTP success payloads, write order, partial-failure semantics, compensation, and existing public error contracts.
- No `as any`, lint disables, `ts-ignore`, suppressions, weaker tests, duplicate validators, duplicate feature flags, or new dependencies.
- Every bulk decision has an explicit cap disposition. Every provider/mixed write has an explicit provider, kill-switch disposition, idempotency/replay disposition, and dry-run/preview disposition.
- `not-applicable` is allowed only with a concrete reason tied to route semantics, for example `single-resource update; no batch cardinality` or `read-through provider fetch only; no external mutation`.
- Central authorization may only be mounted after the exact inventory validates completely.

---

## File Structure

- Create `src/contracts/ops02-policy-inventory.json` — exact one-row-per-route operational decisions.
- Create `src/security/ops02Policy.ts` — typed parse/validation and exact route lookup.
- Create `tests/security/ops02PolicyInventory.test.ts` — exact-membership and mutation ratchet.
- Create `src/security/routeAuthorization.ts` — central tier resolution + safe audit log.
- Create `tests/security/routeAuthorization.runtime.test.ts` — MODERATOR/ADMIN/SUPER_ADMIN runtime matrix and handler-not-called proofs.
- Modify `src/app.ts` — mount role authorization after default-deny auth and before productive routes.
- Modify existing security/input/service files only when inventory review proves a missing protection.
- Modify `docs/HARDENING-WORKPLAN.md` only after focused and terminal evidence are GREEN.

---

### Task 1: Exact OPS-02 schema and membership ratchet

**Files:**
- Create: `src/contracts/ops02-policy-inventory.json`
- Create: `src/security/ops02Policy.ts`
- Create: `tests/security/ops02PolicyInventory.test.ts`

**Interfaces:**
- Produces `Ops02Decision`, `validateOps02Policy()`, `getOps02Decision(method, path)`, and `isHighImpactDecision()`.
- A decision contains: `method`, `path`, `scope`, `provider`, `authorization`, `destructive`, `bulk`, `cap`, `idempotency`, `killSwitch`, `dryRun`, `reversibility`, `evidence`.

- [ ] **Step 1: Write the exact-membership RED test**

```ts
const expected = routeCatalog
  .filter(route => route.access === 'authenticated' && (route.writes || route.destructive))
  .map(route => `${route.method} ${route.path}`)
  .sort()

const actual = ops02Inventory
  .map(decision => `${decision.method} ${decision.path}`)
  .sort()

expect(actual).toEqual(expected)
expect(new Set(actual).size).toBe(actual.length)
```

Also assert `expected.length === 160`; this intentionally fails if the reviewer changes the catalog and forces a factual inventory update.

- [ ] **Step 2: Add structural RED cases using local mutated fixtures**

```ts
expect(() => validateOps02Policy(withMissingDecision)).toThrow(/missing ops-02 decision/i)
expect(() => validateOps02Policy(withDuplicateDecision)).toThrow(/duplicate/i)
expect(() => validateOps02Policy(providerDowngradedToAdmin)).toThrow(/provider.*super-admin/i)
expect(() => validateOps02Policy(bulkWithoutBoundedCap)).toThrow(/bulk.*cap/i)
expect(() => validateOps02Policy(destructiveAdminWithoutReversibility)).toThrow(/destructive/i)
```

- [ ] **Step 3: Prove RED**

```bash
npx.cmd jest --selectProjects unit --runInBand tests/security/ops02PolicyInventory.test.ts
```

Expected: module/inventory missing or exact-membership failure.

- [ ] **Step 4: Implement the typed validator without casts**

Use string-narrowing functions for JSON fields, as already done in `routeCatalogMatcher.ts`. `validateOps02Policy()` must compare inventory keys against the catalog-derived set and reject unknown, missing or duplicate identities.

- [ ] **Step 5: Populate decisions in the family waves below; keep this test RED until all 160 rows are reviewed**

The inventory is not mounted into runtime while coverage is incomplete.

---

### Task 2: Internal CRUD and configuration families

**Families:** `classes`, `events`, `products`, `product-profiles`, `courses`, `course-lessons`, `tag-rules`, `tag-monitoring`, `testimonials`, `achievements`, `analytics`, `auth`, `clareza`, `dashboard`, `user-history`, `renewal`, `cron-tags`.

- [ ] **Step 1: Extract only these catalog decisions from source of truth**

```bash
node -e "const r=require('./src/security/route-catalog.json'); const f=new Set(['classes','events','products','product-profiles','courses','course-lessons','tag-rules','tag-monitoring','testimonials','achievements','analytics','auth','clareza','dashboard','user-history','renewal','cron-tags']); console.log(r.filter(x=>x.access==='authenticated'&&(x.writes||x.destructive)&&f.has(x.path.split('/')[2])).map(x=>x.method+' '+x.path+' | d='+x.destructive).join('\n'))"
```

- [ ] **Step 2: Apply tier rules**

Ordinary internal creates/updates/status/config changes -> `internal-write`; destructive deletes/permanent deletes and security-sensitive auth unlock/config toggles -> `super-admin`. `MODERATOR` never appears in a write decision.

- [ ] **Step 3: Reuse existing strict validators**

Confirm and cite existing authorities before adding any mechanism: `classesDestructiveInput.ts`, `eventsDestructiveInput.ts`, `productProfilesDestructiveInput.ts`, `tagMonitoringDestructiveInput.ts`, `testimonialsDestructiveInput.ts`, `cronTagsInput.ts`, and existing auth/analytics input helpers. Do not duplicate their parsing in the policy layer.

- [ ] **Step 4: Record cap/idempotency/dry-run/reversibility disposition per row**

Single-resource CRUD gets explicit `not-applicable` cap reason. Any route whose source iterates over a caller-controlled collection is `bulk:true` and must cite the existing numeric/array bound or remain RED until a bound is added.

- [ ] **Step 5: Run inventory test and TypeScript checkpoint**

```bash
npx.cmd jest --selectProjects unit --runInBand tests/security/ops02PolicyInventory.test.ts
npm.cmd run types:check
```

The inventory may still be RED only for families not yet populated; no structural error is allowed for completed families.

---

### Task 3: Users, sync and cron high-risk internal families

**Families:** `users`, `sync`, `cron`, `test`.

- [ ] **Step 1: Extract exact rows with the same catalog command restricted to these four prefixes.**
- [ ] **Step 2: Default all catalog `destructive:true` rows to `super-admin`.**
- [ ] **Step 3: Prove existing strict boundaries before edits:** `usersDestructiveInput.ts`, `syncDestructiveInput.ts`, `cronDestructiveInput.ts`, `testHistoryDestructiveInput.ts`.
- [ ] **Step 4: Treat `bulkDelete`, `bulkDeleteUnmatched`, `bulkMerge`, `auto-resolve`, `bulk-resolve`, batch sync and execute-pipeline as bulk/high-impact; every caller-controlled batch gets an explicit finite cap.**
- [ ] **Step 5: Preserve ordered/partial write semantics; security guards wrap existing flows and never convert them to `Promise.all`.**
- [ ] **Step 6: Run affected destructive-validation suites + OPS inventory + `types:check`.**

---

### Task 4: Provider and mixed families

**Families:** `activecampaign`, `ac`, `guru`, `discord-renewal`, `renewal-ac`, `hotmart`, `curseduca`, plus provider-touching routes in `classes`, `course-lessons`, `discovery`, `sync`, and `users`.

- [ ] **Step 1: Mark every route that mutates an external provider as `scope:'provider'|'mixed'` and `authorization:'super-admin'`.**

This includes the cataloged GET writes (`/api/curseduca/sync/universal`, `/start`, `/api/guru/sync/all`, `/api/guru/sync/email/:email`, `/api/hotmart/sync/universal`) despite their HTTP method.

- [ ] **Step 2: ActiveCampaign review**

Reuse `activeCampaignDestructiveInput.ts` and the existing dry-run decision engine/`AC_TAG_APPLY_ENABLED` authority where applicable. Product-tag apply/remove/sync and destructive cron execution remain SUPER_ADMIN. Do not create a second AC feature flag.

- [ ] **Step 3: Guru review**

Reuse `guruDestructiveInput.ts`; snapshots delete, inactivation bulk/single, provider sync and write/reprocess flows remain SUPER_ADMIN. Restore/revert operations may remain SUPER_ADMIN even though compensating because they mutate authoritative state.

- [ ] **Step 4: Discord/Renewal AC review**

Reuse `discordRenewalDestructiveInput.ts` and `renewalAcDestructiveInput.ts`. Execute/send/test/scheduled-run and renewal execute/revert are SUPER_ADMIN. Approval/planning routes that only persist internal approval state may be `internal-write` only if source proves no provider mutation occurs in that request.

- [ ] **Step 5: Hotmart/CursEduca and mixed sync review**

Any request that performs provider fetch + Mongo mutation but does not write the provider is `scope:'mixed'`; authorization remains SUPER_ADMIN when it is a bulk sync/high-impact reconciliation. Record provider name and why kill-switch/dry-run is or is not applicable.

- [ ] **Step 6: Run focused provider suites offline with all provider clients mocked + OPS inventory + `types:check`.**

---

### Task 5: Close exact inventory and mutation proof

- [ ] **Step 1: Exact membership must be 160/160, zero duplicates, zero unknown identities.**
- [ ] **Step 2: Mutation proof must fail for:** remove one row; duplicate one row; downgrade one provider write; make one bulk cap unbounded; downgrade destructive non-reversible route.
- [ ] **Step 3: Restore fixtures and prove GREEN.**

```bash
npx.cmd jest --selectProjects unit --runInBand tests/security/ops02PolicyInventory.test.ts
npm.cmd run types:check
```

- [ ] **Step 4: Commit policy + ratchet**

```bash
git add src/contracts/ops02-policy-inventory.json src/security/ops02Policy.ts tests/security/ops02PolicyInventory.test.ts
git commit -m "feat(security): add exact ops02 policy inventory"
```

---

### Task 6: Central route authorization and safe audit

**Files:** `src/security/routeAuthorization.ts`, `tests/security/routeAuthorization.runtime.test.ts`, `src/app.ts`.

- [ ] **Step 1: RED runtime matrix**

Prove MODERATOR read=200; MODERATOR internal write=403; ADMIN internal write=200; ADMIN provider/high-impact=403; SUPER_ADMIN high-impact=200; denied requests never invoke the route handler/provider dependency; unknown unmatched path still reaches normal 404.

- [ ] **Step 2: Implement tier resolution**

Read routes use `read`; write/destructive routes must resolve through `getOps02Decision()`. Missing policy on a cataloged authenticated write throws a centralized configuration error before the handler.

- [ ] **Step 3: Safe audit**

Log only actor ID, actor role, method, canonical route, tier, outcome and existing `res.locals.correlationId`. Never log request body, token, email, query value, headers, provider payload/response or secret.

- [ ] **Step 4: Mount after default-deny auth and before routes**

```ts
app.use(defaultDenyAuth)
app.use(routeAuthorization)
app.use(express.json({ limit: '100kb' }))
_deps.registerRoutes(app)
```

- [ ] **Step 5: Focused GREEN + TypeScript**

```bash
npx.cmd jest --selectProjects unit --runInBand tests/security/routeAuthorization.runtime.test.ts tests/security/ops02PolicyInventory.test.ts tests/security/defaultDenyAuth.test.ts
npm.cmd run types:check
```

---

### Task 7: Paired Front gating and security closeout

- [ ] **Step 1:** In `RiquinhoDev/Front` `remake`, add pure role helpers matching `read`, `internal-write`, `super-admin`; no login payload change.
- [ ] **Step 2:** Gate representative controls first, then every known Front consumer of a backend write/destructive route using backend inventory evidence.
- [ ] **Step 3:** Run Front focused tests/type/lint/build with no backend-security claims based solely on UI.
- [ ] **Step 4:** Run backend focused security gate, then lint, types, offline full Jest, build and `git diff --check`.
- [ ] **Step 5:** Update `docs/HARDENING-WORKPLAN.md` factually. Security & routes can reach 100% only after backend authorization + exact OPS-02 + Front gating are all evidenced GREEN; deployment/provisioning remains separate.
