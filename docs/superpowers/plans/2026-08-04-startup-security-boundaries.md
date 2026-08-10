# Startup Security Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require dedicated JWT authorities, make production CORS explicitly fail-closed, and protect the mounted CursEduca debug endpoint.

**Architecture:** `loadConfig` remains the single startup boundary for the secrets and production CORS list. The central JWT module owns all JWT signing/verification keys; HTTP code receives the already-normalized CORS allowlist; the existing debug middleware protects the real route mount.

**Tech Stack:** TypeScript 5.9 strict, Express 5, jsonwebtoken 9, Jest 29, Supertest, existing bootstrap/config and offline egress guard.

## Global Constraints

- `JWT_SECRET`, `OLD_API_JWT_SECRET`, and `STUDENT_ACCESS_JWT_SECRET` are mandatory and at least 32 characters.
- Production `ALLOWED_ORIGINS` is mandatory and contains exactly the normalized configured HTTP(S) origins.
- Development/test defaults contain loopback origins only; no production domain is hard-coded in source.
- Requests without `Origin` remain allowed; browser origins without an injected allowlist are rejected.
- Do not modify the dirty sibling Front checkout or delete `/api/curseduca/debug` in this block.
- Do not install, use network, ActiveCampaign, CursEduca, Guru, external APIs, or real Mongo.
- Do not close the global OPS-01 configuration criterion.

---

### Task 1: Centralize dedicated JWT authorities

**Files:**
- Modify: `src/config/appConfig.ts`
- Modify: `src/security/jwt.ts`
- Modify: `src/services/studentOgiSummary.service.ts`
- Modify: `.env.example`
- Modify: `tests/bootstrap/config.test.ts`
- Modify: `tests/bootstrap/authStartupWarning.test.ts`
- Modify: `tests/bootstrap/bootstrap.test.ts`
- Modify: `tests/bootstrap/authConfig.test.ts`
- Modify: `tests/security/jwt.test.ts`
- Create: `tests/services/studentOgiSummaryJwt.test.ts`
- Modify: `tests/security/defaultDenyAuth.test.ts`
- Modify: `tests/security/observabilityBoundaries.test.ts`

**Interfaces:**
- `AppConfig.oldApiJwtSecret: string`
- `AppConfig.studentAccessJwtSecret: string`
- `JwtConfiguration` requires `jwtSecret`, `oldApiJwtSecret`, and `studentAccessJwtSecret`.
- Add `verifyStudentAccessToken<T extends JwtPayload = JwtPayload>(token: string): T`.

- [x] **Step 1: Write JWT/config RED tests**

Add literals for three independent secrets and assert:

```ts
expect(() => loadConfig({ ...validEnv, OLD_API_JWT_SECRET: undefined }))
  .toThrow('OLD_API_JWT_SECRET')
expect(() => loadConfig({ ...validEnv, STUDENT_ACCESS_JWT_SECRET: 'curto' }))
  .toThrow('STUDENT_ACCESS_JWT_SECRET deve ter pelo menos 32 caracteres')
```

In `jwt.test.ts`, configure all three keys, sign one token per authority, and assert an app token fails student verification while a student-key token succeeds. Assert old-API signing verifies only with `OLD_API_SECRET`.

Add a service-level assertion that `resolveStudentEmailFromToken` accepts a token signed with the configured student key and rejects a token signed with the app key. The expected email is the hand-written normalized literal `student@example.test`.

- [x] **Step 2: Verify RED**

Run:

```powershell
node_modules\.bin\jest.cmd --runInBand tests/bootstrap/config.test.ts tests/bootstrap/bootstrap.test.ts tests/security/jwt.test.ts
```

Expected: failures because the dedicated secrets are optional/fallback-based and student verification is not exported centrally.

- [x] **Step 3: Implement minimal central authority**

Make both dedicated secrets required through `parseStrongSecret(..., true)`, return them as non-optional `AppConfig` fields, require them in `JwtConfiguration`, remove `?? jwtSecret` from `signOldApiToken`, and add:

```ts
export function verifyStudentAccessToken<T extends JwtPayload = JwtPayload>(token: string): T {
  return jwt.verify(token, getConfiguration().studentAccessJwtSecret) as T
}
```

In `studentOgiSummary.service.ts`, remove the direct jsonwebtoken import and environment fallback; use the central verifier and preserve the existing missing-email error/normalization behavior.

Update every focused `configureJwt` and `loadConfig` fixture with explicit, distinct test-only keys. Mark both dedicated variables mandatory in `.env.example` without real values.

- [x] **Step 4: Verify GREEN**

Run:

```powershell
node_modules\.bin\jest.cmd --runInBand tests/bootstrap/config.test.ts tests/bootstrap/bootstrap.test.ts tests/bootstrap/authConfig.test.ts tests/bootstrap/authStartupWarning.test.ts tests/security/jwt.test.ts tests/security/defaultDenyAuth.test.ts tests/security/observabilityBoundaries.test.ts
npm.cmd run types:check
```

Expected: all focused suites pass and direct TypeScript emits zero diagnostics.

- [x] **Step 5: Negative scan and commit**

Require no `STUDENT_ACCESS_JWT_SECRET || JWT_SECRET`, no optional old-API secret, and no `jsonwebtoken` import in `studentOgiSummary.service.ts`. Commit:

```text
security: centralize dedicated jwt secrets
```

### Task 2: Make CORS fail-closed by environment

**Files:**
- Modify: `src/security/cors.ts`
- Modify: `src/config/appConfig.ts`
- Modify: `src/app.ts`
- Modify: `.env.example`
- Modify: `tests/security/cors.test.ts`
- Modify: `tests/bootstrap/config.test.ts`
- Modify: `tests/bootstrap/authStartupWarning.test.ts`
- Modify: `tests/security/httpPerimeter.test.ts` only if an existing CORS probe needs explicit origins.
- Modify: `tests/security/defaultDenyAuth.test.ts` only if its preflight fixture needs explicit origins.

**Interfaces:**
- `buildAllowedOrigins(value: string | undefined, nodeEnv: 'development' | 'test' | 'production'): string[]`
- `createApp` fallback allowlist is `[]`.

- [x] **Step 1: Write CORS RED tests**

Assert production missing/blank `ALLOWED_ORIGINS` throws, and:

```ts
expect(buildAllowedOrigins('https://EXAMPLE.com/app', 'production'))
  .toEqual(['https://example.com'])
expect(buildAllowedOrigins(undefined, 'test'))
  .toEqual(expect.arrayContaining(['http://localhost:3000', 'http://127.0.0.1:5173']))
```

Assert the production list excludes localhost and every formerly hard-coded production domain unless explicitly configured. Add a Supertest probe proving `createApp` without `allowedOrigins` rejects `Origin: https://browser.example`, while the same endpoint without `Origin` succeeds.

- [x] **Step 2: Verify RED**

Run:

```powershell
node_modules\.bin\jest.cmd --runInBand tests/security/cors.test.ts tests/bootstrap/config.test.ts tests/security/httpPerimeter.test.ts
```

Expected: production accepts missing configuration, merges implicit defaults, and `createApp` recreates them.

- [x] **Step 3: Implement environment-aware allowlists**

Keep only loopback constants in source. Normalize and deduplicate configured origins. Throw a configuration error that names `ALLOWED_ORIGINS` as mandatory in production when no configured origin exists. Production returns configured origins only; local environments merge loopback defaults.

Pass the validated `nodeEnv` into `buildAllowedOrigins` from `loadConfig`. Change `createApp` to use `[]` when no allowlist is injected. Update `.env.example` to say production origins are mandatory and implicit defaults are not preserved.

- [x] **Step 4: Verify GREEN and compatibility**

Run:

```powershell
node_modules\.bin\jest.cmd --runInBand tests/security/cors.test.ts tests/bootstrap/config.test.ts tests/security/httpPerimeter.test.ts tests/security/defaultDenyAuth.test.ts
npm.cmd run types:check
```

Expected: all focused suites pass, server-to-server/no-Origin requests remain accepted, and TypeScript has zero diagnostics.

- [x] **Step 5: Negative scan and commit**

Require no hard-coded production hostname in `src/security/cors.ts` and no zero-argument `buildAllowedOrigins()` call. Commit:

```text
security: fail closed production cors
```

Task 1/2 evidence: dedicated JWT authorities and fail-closed CORS are covered by the focused bootstrap/JWT/CORS suites recorded in the workplan (**5 suites / 27 tests**) and by the final offline gates at `bdb59b9` (**160 suites passed + 1 skipped; 814 tests passed + 2 skipped**). The two commits are `25f8882`/`6e328ab` and `6cc1ce8`; production provisioning remains outside code evidence.


### Task 3: Gate the real debug route and close evidence

**Files:**
- Modify: `src/routes/curseduca.routes.ts`
- Modify: `tests/security/curseducaDestructiveValidation.test.ts`
- Modify: `docs/HARDENING-WORKPLAN.md`
- Modify: `docs/superpowers/plans/2026-08-04-startup-security-boundaries.md`

**Interfaces:**
- Existing `localDebugOnly` protects `router.get('/debug', ...)`.
- Existing deprecated handler remains 501 only with local debug explicitly enabled.

- [x] **Step 1: Write the actual-mount RED test**

Use the existing mocked CursEduca controller boundary, call `configureDebugRoutes`, mount the real `curseducaRouter`, and assert:

```ts
configureDebugRoutes({ enableDebugRoutes: false })
await request(buildApp()).get('/api/curseduca/debug').expect(404)

configureDebugRoutes({ enableDebugRoutes: true })
await request(buildApp()).get('/api/curseduca/debug').expect(204)
```

The mocked handler remains the existing `noop`; the behavior under test is the real route/middleware composition.

- [x] **Step 2: Verify RED, implement, and verify GREEN**

Run the focused test, confirm disabled debug currently reaches 204, import `localDebugOnly`, add it before `debugCurseducaAPI`, then rerun:

```powershell
node_modules\.bin\jest.cmd --runInBand tests/security/curseducaDestructiveValidation.test.ts tests/security/debugRoutes.test.ts
```

Expected GREEN: both suites pass with no external calls.

RED: the new mounted probe failed with `expected 404 "Not Found", got 204 "No Content"` while debug was disabled.
GREEN: `MONGOMS_RUNTIME_DOWNLOAD=false` plus Jest `--ci --runInBand` passed **2 suites / 6 tests**, with no external calls.
The regression uses the repository's offline loopback query marker so Supertest remains inside the egress guard.

- [x] **Step 3: Close only the proven workplan slices**

Mark the JWT/debug/upload and CORS boxes checked. Record dedicated-secret separation, actual route gating, explicit production origins, and focused test evidence. Keep OPS-01 open and state that production deployment still requires secret/origin provisioning.

Recount and require:

```text
checked=88 open=16 total=104 percent=84.6
```

- [x] **Step 4: Commit tracked changes**

Commit tracked Task 3 files as:

```text
security: gate curseduca debug route
```

If documentation is kept separate after the runtime commit, use:

```text
docs: close startup security boundaries
```

Runtime commit: `2a3c8d1`; documentation commit: this commit.

- [x] **Step 5: Run final offline gates on final tracked HEAD and verify hygiene**

Run serially after the final tracked commit:

```powershell
npm.cmd run lint
npm.cmd run types:check
$env:MONGOMS_RUNTIME_DOWNLOAD='false'; npm.cmd test -- --ci --runInBand
npm.cmd run build
git diff --check
```

Expected: every command exits 0. Record exact suite/test totals in the ignored SDD report. Require a clean tracked worktree, no sibling Front modifications, no push, and no external-system access.

Evidence at HEAD `bdb59b9`: lint, strict TypeScript, Jest, build, and `git diff --check` all exited 0; Jest reported **160 suites passed + 1 skipped / 161 total** and **814 tests passed + 2 skipped / 816 total**. The tracked worktree remained clean and no external system was contacted.
