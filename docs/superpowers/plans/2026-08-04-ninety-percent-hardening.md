# Ninety Percent Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close six existing hardening boxes with current code evidence and offline TDD, moving the workplan from 88/104 (84.6%) to 94/104 (90.4%).

**Architecture:** Reconcile two stale evidence boxes, finish repository/test hygiene through machine-checked contracts, then replace the single-process limiter boundary with an injected Redis-backed store in production. Runtime configuration remains fail-fast, `createApp` stays side-effect free, tests use fakes and MongoMemoryServer only, and no external integration is contacted.

**Tech Stack:** Node.js, TypeScript strict mode, Express 5, Jest/ts-jest, Helmet, express-rate-limit, ioredis already installed, npm authoritative package manager.

## Global Constraints

- Work only on branch `remake`; baseline is `b9bb981`.
- No network, package installation, production MongoDB/Redis, ActiveCampaign, Discord, Guru, Hotmart, CursEduca, FMP, browser, or sibling Front mutation.
- Set `MONGOMS_RUNTIME_DOWNLOAD=false` for Jest; preserve dependency and MongoMemoryServer caches.
- Do not edit `package-lock.json` or change dependencies.
- Use real RED/GREEN for behavior changes; characterization/evidence tests require sensitivity or mutation proof.
- Use lowercase Conventional Commit subjects, one independently reviewable topic per commit.
- Do not push without explicit current authorization.
- Do not close OPS-01, SEC-10, roles, destructive-operation policy, pagination, idempotency, response envelopes, ESLint `any`, or ARCH-02.
- Final count must be exactly `checked=94 open=10 total=104 percent=90.4` without adding checklist boxes.

---

### Task 1: Reconcile controller and syncStats evidence

**Files:**
- Create: `tests/tooling/controllerClosureEvidence.test.ts`
- Modify: `docs/HARDENING-WORKPLAN.md`

**Interfaces:**
- Consumes: `tsconfig.json`, `package.json`, `src/routes/sync.routes.ts`, `src/routes/syncUtilizadoresRoutes/syncStats.routes.ts`, `src/controllers/syncUtilizadoresControllers/syncStats.controller.ts`.
- Produces: machine-checked evidence for the two stale workplan parent boxes; no runtime interface.

- [ ] **Step 1: Write the characterization contract**

Create a test that reads tracked source as text and asserts the stronger final TypeScript invariant plus the surviving sync surface:

```ts
expect(tsconfig.compilerOptions.strict).toBe(true)
expect(tsconfig.compilerOptions.noEmitOnError).toBe(true)
expect(packageJson.scripts['types:check']).toBe('tsc --noEmit --pretty false')
expect(packageJson.scripts).not.toHaveProperty('types:baseline:update')
expect(fs.existsSync('scripts/ts-debt-ratchet.mjs')).toBe(false)

expect(syncRoutes).toContain("router.get('/stats'")
expect(syncRoutes).toContain("router.get('/history'")
expect(syncStatsRoutes).not.toMatch(/router\.get\(['"]\/(stats|history)['"]/)
expect(syncStatsController).not.toMatch(/\b(getSyncStats|getSyncHistory)\b/)
for (const handler of ['getSyncById', 'getConflictById', 'resolveConflict', 'ignoreConflict']) {
  expect(syncStatsController).toMatch(
    new RegExp(`export const ${handler} = async \\(\\s*req: Request<\\{ id: string \\}>`),
  )
}
```

- [ ] **Step 2: Prove sensitivity, then run GREEN**

Temporarily expect one removed handler to exist, run:

```powershell
node_modules\.bin\jest.cmd --ci --runInBand tests/tooling/controllerClosureEvidence.test.ts
```

Require RED on that assertion, restore the correct negative assertion, rerun, and require one passing suite.

- [ ] **Step 3: Reconcile only the two existing boxes**

Change workplan lines 751 and 755 from `[ ]` to `[x]`. Under line 751 explain that repository-wide strict/noEmitOnError/zero-error gates supersede the removed baseline workflow. Under line 755 retain `fe8c02f` evidence and add the fresh tooling-test result. Do not edit any other checkbox.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
node_modules\.bin\jest.cmd --ci --runInBand tests/tooling/controllerClosureEvidence.test.ts tests/tooling/typescriptCompilerGate.test.ts tests/security/routeCatalog.test.ts
npm.cmd run types:check
git diff --check
```

Commit:

```text
docs: reconcile controller closure evidence
```

---

### Task 2: Complete documentation-root hygiene

**Files:**
- Move: `API_AUDIT.md` -> `docs/archive/API_AUDIT_2026-07-15.md`
- Move: `COMPLETE_SECURITY_AUDIT.md` -> `docs/archive/NATIVE_TAG_SECURITY_AUDIT_2026-01-23.md`
- Move: `NATIVE_TAG_PROTECTION_SUMMARY.md` -> `docs/reference/NATIVE_TAG_PROTECTION_SUMMARY.md`
- Move: `RENOVACAO_CONTEXTO_IA.md` -> `docs/reference/renewal/RENOVACAO_CONTEXTO_IA.md`
- Move: `RENOVACAO_DISCORD_CARGOS_PLAN.md` -> `docs/reference/renewal/RENOVACAO_DISCORD_CARGOS_PLAN.md`
- Move: `RENOVACAO_OGI_BO_PLAN.md` -> `docs/reference/renewal/RENOVACAO_OGI_BO_PLAN.md`
- Move: `URGENT_KEY_REPLACEMENT.md` -> `docs/active/URGENT_KEY_REPLACEMENT.md`
- Modify: `docs/README.md`
- Modify: internal Markdown links found by exact scan
- Create: `tests/tooling/repositoryHygiene.test.ts`

**Interfaces:**
- Consumes: the five-status-section contract in `docs/README.md` and current package metadata.
- Produces: a root-document allowlist of zero Markdown files and indexed Active/Reference/Archive destinations.

- [ ] **Step 1: Write the failing root-hygiene tests**

Add tests that enumerate `*.md` directly under repository root and require `[]`, verify all seven destination files, verify `docs/README.md` links each destination with one of `ACTIVE`, `REFERENCE`, or `ARCHIVE`, and assert:

```ts
expect(packageJson).toMatchObject({
  name: 'bo2-api',
  main: 'dist/index.js',
  private: true,
})
```

Run the test and require RED listing the seven current root files.

- [ ] **Step 2: Move without rewriting historical content**

Create `docs/active` and `docs/reference/renewal`, use `git mv` for all seven files, and add a short status banner only where classification is ambiguous:

```markdown
> **Status:** ARCHIVE snapshot; not current repository-wide security proof.
```

The urgent key rotation document stays ACTIVE. Renewal plans stay REFERENCE and retain their disabled/offline status.

- [ ] **Step 3: Repair and machine-check links**

Search all tracked Markdown for each old root path, repair relative links, update `docs/README.md`, then run a local link checker that resolves every relative `.md` target mentioned by changed files. No web-link validation is allowed.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
node_modules\.bin\jest.cmd --ci --runInBand tests/tooling/repositoryHygiene.test.ts
rg -n "API_AUDIT\.md|COMPLETE_SECURITY_AUDIT\.md|NATIVE_TAG_PROTECTION_SUMMARY\.md|RENOVACAO_(CONTEXTO_IA|DISCORD_CARGOS_PLAN|OGI_BO_PLAN)\.md|URGENT_KEY_REPLACEMENT\.md" --glob "*.md"
git diff --check
```

Review every remaining match: it must be a valid updated destination or historical prose, never a broken root link. Commit:

```text
docs: complete repository documentation index
```

---

### Task 3: Enforce tracked-artifact and compose hygiene

**Files:**
- Modify: `tests/tooling/repositoryHygiene.test.ts`
- Modify: `.gitignore` only if the RED test identifies an uncovered disposable output pattern
- Modify: `docker-compose.monitoring.yml` only if a fixed version or required credential expression is missing
- Delete locally, not from Git: `nul`, root `*.log`, `tmpclaude-*` after resolved-path checks
- Modify: `docs/HARDENING-WORKPLAN.md`

**Interfaces:**
- Consumes: `git ls-files`, `.gitignore`, active compose YAML.
- Produces: a machine-checked denylist for tracked outputs and floating/default deployment inputs.

- [ ] **Step 1: Extend the tooling test and prove RED sensitivity**

Add assertions that tracked paths contain none of:

```ts
const forbiddenTracked = [
  /^dist\//,
  /^logs\//,
  /^uploads\//,
  /(^|\/)coverage\//,
  /(^|\/).*\.log$/,
  /(^|\/)nul$/,
  /(^|\/)tmpclaude-/,
]
```

Parse compose image declarations and require either `@sha256:` or a non-`latest` tag. Require Grafana admin password to use `${GRAFANA_ADMIN_PASSWORD:?GRAFANA_ADMIN_PASSWORD is required}` and reject literal/default admin passwords. Prove sensitivity with a temporary `image: example/service:latest` fixture, require RED, then restore.

- [ ] **Step 2: Remove only verified ignored junk**

For `nul`, each root `*.log`, and each `tmpclaude-*`, resolve the absolute path, verify its parent equals the repository root and `git check-ignore` succeeds, then delete the exact literal path. Do not delete `dist/`, `logs/`, or `uploads/` recursively.

- [ ] **Step 3: Verify current compose inputs**

Require the existing Prometheus, Grafana, and node-exporter fixed versions to pass. If implementation differs from this plan, change only floating tags or literal/default credentials; do not contact a registry and do not invent digests.

- [ ] **Step 4: Close only the artifact box and commit**

Mark workplan line 1091 checked with the tooling-test evidence. Run:

```powershell
node_modules\.bin\jest.cmd --ci --runInBand tests/tooling/repositoryHygiene.test.ts tests/security/deploymentPerimeter.test.ts
git ls-files | Select-String -Pattern '(^|/)(dist|logs|uploads|coverage)/|\.log$|(^|/)nul$|(^|/)tmpclaude-'
git diff --check
```

The negative scan must print no tracked path. Commit:

```text
test: enforce repository artifact hygiene
```

---

### Task 4: Separate Jest projects while preserving the safe inventory

**Files:**
- Create: `scripts/test/jestProjects.cjs`
- Modify: `jest.config.js`
- Modify: `package.json`
- Create: `tests/tooling/jestProjects.test.ts`
- Modify: `docs/HARDENING-WORKPLAN.md`

**Interfaces:**
- Produces: `createJestProjects(rootDir): JestProject[]` and scripts `test`, `test:unit`, `test:integration`, `test:load`, `test:e2e`.
- Consumes: universal setup files `tests/setupEnv.ts` and `tests/setup.ts`.

- [ ] **Step 1: Capture the safe baseline inventory**

Run without executing load/E2E:

```powershell
$env:MONGOMS_RUNTIME_DOWNLOAD='false'
node_modules\.bin\jest.cmd --listTests --json
```

Save only the count and sorted relative paths in the ignored task report. The current configuration lists `tests/load/load.test.ts` even though its body is opt-in/skip; remove that one path when defining the executable-safe baseline. Confirm `tests/e2e/products-dashboard.spec.ts` and `tests/sprint1/architecture.test.ts` are already absent. The final unit+integration inventory preserves the pre-change safe inventory (current inventory minus exactly `tests/load/load.test.ts`) and adds only `tests/tooling/jestProjects.test.ts`, the new topology contract.

- [ ] **Step 2: Write the failing topology contract**

The test must require four display names, exact script registration, universal `setupFiles: ['<rootDir>/tests/setupEnv.ts']`, and one classification for every discovered test except the documented `sprint1` exclusion. It must reject overlap and require the default npm `test` script to select only unit and integration.

Use an explicit integration manifest containing the current MongoMemoryServer/database tests discovered by this command:

```powershell
rg -l "MongoMemoryServer|mongodb-memory-server|connectTestDatabase|testDatabase" tests --glob "*.test.ts" --glob "*.spec.ts"
```

The unit project includes remaining safe tests and ignores the explicit integration list plus `load`, `e2e`, and `sprint1`. The load and e2e projects match only their directories.

- [ ] **Step 3: Implement shared projects**

`scripts/test/jestProjects.cjs` exports shared ts-jest transform/setup and four project objects. `jest.config.js` consumes them and retains root-level coverage configuration. Set scripts exactly:

```json
{
  "test": "jest --selectProjects unit integration",
  "test:unit": "jest --selectProjects unit",
  "test:integration": "jest --selectProjects integration",
  "test:load": "jest --selectProjects load",
  "test:e2e": "jest --selectProjects e2e"
}
```

Do not run `test:load` or `test:e2e` in this block.

- [ ] **Step 4: Reconcile inventories and prove egress inheritance**

Run `jest --listTests --selectProjects unit integration --json`, sort relative paths, and require exact equality with the Step 1 executable-safe baseline plus only `tests/tooling/jestProjects.test.ts` (the old inventory minus `tests/load/load.test.ts`, plus the new topology contract). Add a topology assertion that every project uses `tests/setupEnv.ts`; retain the existing `f1OfflineGuard`/sentinel tests in the safe default.

- [ ] **Step 5: Verify, close TEST-01/02, and commit**

Run:

```powershell
$env:MONGOMS_RUNTIME_DOWNLOAD='false'
npm.cmd test -- --ci --runInBand tests/tooling/jestProjects.test.ts tests/security/f1OfflineGuard.test.ts tests/security/mongoMemoryOffline.test.ts
npm.cmd run types:check
git diff --check
```

Mark only workplan line 1130 checked with inventory counts and explicit load/E2E non-execution caveats. Commit:

```text
test: separate offline jest projects
```

---

### Task 5: Add the production distributed rate-limit store

**Files:**
- Create: `src/security/redisRateLimitStore.ts`
- Create: `tests/security/redisRateLimitStore.test.ts`
- Modify: `src/security/httpPerimeter.ts`
- Modify: `src/services/cache.service.ts`
- Modify: `src/config/appConfig.ts`
- Modify: `.env.example`
- Modify: `src/runtime/infrastructure.ts`
- Modify: `src/bootstrap.ts`
- Modify: `src/runtime/startJobs.ts`
- Modify: `src/runtime/shutdown.ts`
- Modify: `tests/bootstrap/config.test.ts`
- Modify: `tests/bootstrap/bootstrap.test.ts`
- Modify: `tests/bootstrap/authStartupWarning.test.ts`
- Modify: `tests/runtime/shutdown.test.ts`

**Interfaces:**
- Produces: `RateLimitStoreFactory = (policy: RateLimitPolicyName) => Store`.
- Produces: `createRedisRateLimitStoreFactory(commands, namespace): RateLimitStoreFactory`.
- Produces: `RedisRateLimitCommandPort` with `evalIncrement`, `decrement`, and `delete` methods.
- Changes: `Infrastructure.connectRedis(config): Promise<RateLimitStoreFactory | undefined>`.

- [ ] **Step 1: Write RED store-contract tests**

Use a fake command port, never ioredis/network, and require:

```ts
await store.increment('client')
// => { totalHits: 1, resetTime: deterministicDate }
```

Cover first-hit expiry, later increments preserving TTL, policy prefixes, `decrement`, `resetKey`, and rejected command propagation. Require compilation/test failure because the adapter and factory do not exist.

- [ ] **Step 2: Implement the atomic Redis adapter**

The real ioredis command port executes one Lua operation equivalent to:

```lua
local current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
return {current, ttl}
```

The store namespace is `bo2:<nodeEnv>:rate-limit:<policy>:`. Never use `KEYS`; reset deletes one exact key. Use express-rate-limit's exported `Store`/client-info types and satisfy its `init`, `increment`, `decrement`, and `resetKey` contract.

- [ ] **Step 3: Make cache connection typed and fail-fast**

Change `cacheService.connect()` to `connect(config: NonNullable<AppConfig['redis']>): Promise<void>`. Construct ioredis with `lazyConnect:true`, call/await `connect()`, remove the password-preview log, rethrow connection failure, expose only a bound `RedisRateLimitCommandPort`, and add `disconnect(): Promise<void>`.

Change `parseRedisConfig` so production without `REDIS_HOST` throws `CONFIG_INVALIDA: REDIS_HOST e obrigatoria em producao para rate limiting distribuido`; development/test may omit Redis.

Update `.env.example` to state that `REDIS_HOST` (plus any non-default port/username/password) is mandatory for production distributed limiting. Update every production config fixture, including `authStartupWarning.test.ts`, with fake Redis values except the explicit missing-Redis RED case.

- [ ] **Step 4: Wire the factory without polluting createApp**

`runtime/infrastructure.connectRedis` returns `undefined` without configured Redis in development/test; otherwise it awaits the typed cache connection and returns `createRedisRateLimitStoreFactory(...)`. `bootstrap` captures the factory and injects:

```ts
createHttpPerimeter: () => createHttpPerimeter({ storeFactory })
```

Production startup tests require the factory and fail before route registration/listen when Redis configuration is absent. Bootstrap tests inject a fake factory and do not open sockets.

- [ ] **Step 5: Close the Redis lifecycle**

Extend shutdown dependencies with `stopCache: () => Promise<void>`, make the signal handler await cache shutdown before `exit(0)`, and preserve scheduler-failure isolation. `startJobs` binds `cacheService.disconnect`. Tests require call order `stopSystemMonitor`, `stopScheduler`, `stopCache`, `exit`; cache rejection is logged and still exits.

- [ ] **Step 6: Run GREEN and commit**

Run:

```powershell
node_modules\.bin\jest.cmd --ci --runInBand tests/security/redisRateLimitStore.test.ts tests/security/httpPerimeter.test.ts tests/bootstrap/config.test.ts tests/bootstrap/bootstrap.test.ts tests/runtime/shutdown.test.ts
npm.cmd run types:check
npm.cmd run lint
git diff --check
```

Negative scans must find no `new MemoryStore()` inside `createLimiter`, no Redis password preview, and no zero-argument `cacheService.connect()`. Commit:

```text
security: add distributed rate-limit store
```

---

### Task 6: Centralize the 429 envelope and enable final CSP

**Files:**
- Modify: `src/security/httpPerimeter.ts`
- Modify: `tests/security/httpPerimeter.test.ts`
- Modify: `tests/security/defaultDenyAuth.test.ts` only for injected deterministic stores if required
- Modify: `tests/security/deploymentPerimeter.test.ts`

**Interfaces:**
- Changes: `onRateLimit(event)` receives `{ policy, correlationId }`.
- Produces: stable `RATE_LIMITED` JSON envelope and `X-Request-ID` response header.
- Produces: explicit Helmet CSP directives.

- [ ] **Step 1: Write RED HTTP assertions**

For a request carrying `X-Request-ID: limiter-request-123`, exceed a focused fake-store limit and require:

```ts
expect(response.status).toBe(429)
expect(response.headers['x-request-id']).toBe('limiter-request-123')
expect(response.body).toEqual({
  success: false,
  code: 'RATE_LIMITED',
  message: 'Demasiados pedidos',
  correlationId: 'limiter-request-123',
})
expect(onRateLimit).toHaveBeenCalledWith({
  policy: 'login',
  correlationId: 'limiter-request-123',
})
```

Require `Content-Security-Policy` to include `default-src 'none'` and `frame-ancestors 'none'`. Confirm RED because the current response lacks code/correlation and CSP is disabled.

- [ ] **Step 2: Implement the public boundary**

Read correlation only from `res.locals.correlationId`, set `X-Request-ID`, and return the exact envelope above. Do not include IP, headers, body, token, store errors, or stack in the observability event.

Enable Helmet CSP with explicit directives:

```ts
contentSecurityPolicy: {
  directives: {
    defaultSrc: ["'none'"],
    baseUri: ["'none'"],
    frameAncestors: ["'none'"],
    formAction: ["'none'"],
  },
}
```

Retain `crossOriginResourcePolicy: { policy: 'cross-origin' }` and verify preflight behavior remains unchanged.

- [ ] **Step 3: Verify behavior and commit**

Run:

```powershell
node_modules\.bin\jest.cmd --ci --runInBand tests/security/httpPerimeter.test.ts tests/security/defaultDenyAuth.test.ts tests/security/deploymentPerimeter.test.ts tests/security/cors.test.ts
npm.cmd run types:check
npm.cmd run lint
git diff --check
```

Commit:

```text
security: finalize rate-limit response and csp
```

---

### Task 7: Close evidence, review, and final offline gates

**Files:**
- Modify: `docs/HARDENING-WORKPLAN.md`
- Modify: `docs/superpowers/plans/2026-08-04-ninety-percent-hardening.md`

**Interfaces:**
- Consumes: approved commits and fresh final gate output.
- Produces: exact 94/10/104/90.4 workplan status with operational caveats.

- [ ] **Step 1: Close DOC-02 and SEC-08 only after proof**

Mark workplan line 1090 checked after root/link/package tests. Mark line 1101 checked after distributed-store, 429, CSP, startup, and shutdown tests. The other four target boxes must already have been checked by their owning tasks. Do not touch unrelated open boxes.

- [ ] **Step 2: Record exact evidence and caveats**

Document focused suite/test totals, the production requirement for Redis configuration, default safe Jest projects, opt-in load/E2E status, and the fact that no deployment, live Redis, external API, or sibling Front was exercised.

- [ ] **Step 3: Recount mechanically**

Use:

```powershell
$lines = Get-Content docs/HARDENING-WORKPLAN.md
$checked = @($lines | Where-Object { $_ -match '^\s*-\s+\[[xX]\]\s' }).Count
$open = @($lines | Where-Object { $_ -match '^\s*-\s+\[ \]\s' }).Count
"checked=$checked open=$open total=$($checked+$open) percent=$([math]::Round(100*$checked/($checked+$open),1))"
```

Require exactly `checked=94 open=10 total=104 percent=90.4`.

- [ ] **Step 4: Commit tracked closeout**

Commit:

```text
docs: close ninety-percent hardening block
```

- [ ] **Step 5: Run fresh final gates on the final tracked HEAD**

Run serially:

```powershell
npm.cmd run lint
npm.cmd run types:check
$env:MONGOMS_RUNTIME_DOWNLOAD='false'; npm.cmd test -- --ci --runInBand
npm.cmd run build
git diff --check b9bb981..HEAD
git status -sb
```

Require zero failures, a clean tracked worktree, and no push. Review all changed paths against this plan.

- [ ] **Step 6: Independent final review and Luna proof**

Request a whole-range review from `b9bb981..HEAD`, fix every Critical/Important finding, and re-review fixes. Before reporting completion, inspect each executor rollout and require `session_meta.payload.agent_role=executor_luna` plus every relevant `turn_context.payload.model=gpt-5.6-luna`.




