# Production Configuration and Error Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close OPS-01 and SEC-10 by making startup configuration typed and conditionally fail-fast, then routing every internal HTTP failure through one redacted correlation-aware error boundary.

**Architecture:** `loadConfig(env)` becomes the sole application environment parser and initializes an immutable typed runtime provider before infrastructure starts. Runtime modules consume focused typed sections or the provider; optional integrations are explicit configured/unconfigured states and enabled features require complete credentials. HTTP controllers/routes preserve success and deliberate 4xx behavior while replacing local 500 bodies with `next(error)`/`HttpError`, enforced by repository-wide tooling gates.

**Tech Stack:** Node.js, TypeScript strict mode, Express 5, Jest/ts-jest, Supertest, existing Winston logger, npm.

## Global Constraints

- Work only on branch `remake`; implementation baseline is `91f50c6` after the approved design spec.
- No network, package installation, production MongoDB/Redis, ActiveCampaign, Discord, FMP, Hotmart, Guru, CursEduca, Slack, browser, or sibling Front mutation.
- Set `MONGOMS_RUNTIME_DOWNLOAD=false` for Jest and preserve dependency/MongoMemoryServer caches.
- Do not edit `package-lock.json`, add dependencies, or weaken the egress guard.
- Use real RED/GREEN or mutation evidence before production changes.
- Preserve every success response and intentional 4xx status/body.
- Every unknown 5xx response is exactly `{ success:false, code:'INTERNAL_ERROR', message:'Erro interno do servidor', correlationId }` plus `X-Request-ID`.
- Optional disabled integrations remain inert; enabled features fail startup if their required configuration is absent or invalid.
- Secrets, upstream bodies, request bodies, headers, query values, tokens, emails, stack traces, and raw `error.message` never enter public responses or configuration errors.
- Each task uses lowercase Conventional Commits and receives independent SPEC and QUALITY review.
- Do not close ARCH-03, roles, destructive-operation policy, pagination, TOOL-02, or ARCH-02.
- Final workplan count must be exactly `checked=96 open=8 total=104 percent=92.3` without adding checklist boxes.
- Do not push without explicit current authorization.

---

### Task 1: Establish typed configuration primitives and regression inventory

**Files:**
- Create: `src/config/runtimeConfig.ts`
- Create: `src/config/configTypes.ts`
- Create: `tests/bootstrap/runtimeConfig.test.ts`
- Create: `tests/tooling/productionBoundaryInventory.test.ts`
- Modify: `src/config/appConfig.ts`
- Modify: `tests/bootstrap/config.test.ts`

**Interfaces:**
- Produces `IntegrationConfig<T> = { configured:false } | { configured:true; value:Readonly<T> }`.
- Produces focused `CoreConfig`, `ObservabilityConfig`, `IntegrationConfigs`, `RenewalConfig`, and composed `AppConfig`.
- Produces `initializeRuntimeConfig(config): void`, `getRuntimeConfig(): Readonly<AppConfig>`, and `resetRuntimeConfigForTests(): void`.
- Produces an exact baseline inventory for direct `process.env` reads and HTTP-layer local 500 responses; later tasks reduce both to their approved final sets.

- [ ] **Step 1: Write RED runtime-provider tests**

Require use-before-init failure, frozen returned sections, identical idempotent initialization, rejection of incompatible reinitialization, and explicit test reset:

```ts
expect(() => getRuntimeConfig()).toThrow('RUNTIME_CONFIG_NOT_INITIALIZED')
initializeRuntimeConfig(config)
expect(getRuntimeConfig()).toBe(config)
expect(Object.isFrozen(getRuntimeConfig())).toBe(true)
expect(() => initializeRuntimeConfig(otherConfig)).toThrow('RUNTIME_CONFIG_ALREADY_INITIALIZED')
```

- [ ] **Step 2: Write RED parser-matrix tests**

Extend `config.test.ts` with table-driven boolean, integer, URL, credential-group, and optional-integration cases. Disabled features accept absent credentials; explicitly present malformed values always fail. Error assertions name variables but never include their values.

- [ ] **Step 3: Capture and prove inventory sensitivity**

The tooling test reads tracked `src/**/*.ts` and reports `path:line` entries for:

```ts
const rawEnvironmentRead = /\bprocess\.env(?:\.|\[)/
const localFiveHundred = /\.status\(\s*500\s*\)/
const publicErrorDetail = /\.json\([^\n]*(?:error\.message|details\s*:)/
```

Store the current exact path sets in the test as migration baselines. Temporarily add `process.env.UNSAFE_TEST` and a `res.status(500)` fixture under `src/`, require RED, remove it, and rerun the characterization GREEN.

- [ ] **Step 4: Implement types, provider, and parser helpers**

Implement recursive freezing without serializing configuration and keep raw parsing inside `src/config/`. Export strict helpers for boolean, bounded integer, optional URL, required URL, strong secret, and configured credential groups. No service/controller migration occurs in this task.

- [ ] **Step 5: Verify and commit**

```powershell
node_modules\.bin\jest.cmd --ci --runInBand tests/bootstrap/runtimeConfig.test.ts tests/bootstrap/config.test.ts tests/tooling/productionBoundaryInventory.test.ts
npm.cmd run types:check
git diff --check
```

Commit: `config: establish typed runtime boundary`

---

### Task 2: Initialize configuration before runtime and centralize integration-unavailable errors

**Files:**
- Create: `src/errors/integrationUnavailableError.ts`
- Modify: `src/bootstrap.ts`
- Modify: `src/security/errorHandling.ts`
- Modify: `src/utils/logger.ts`
- Modify: `tests/bootstrap/bootstrap.test.ts`
- Modify: `tests/security/errorHandling.test.ts`
- Modify: `tests/security/logger.test.ts`

**Interfaces:**
- Produces `IntegrationUnavailableError(integration: IntegrationName, cause?:unknown)`.
- Produces central classification `503 / INTEGRATION_UNAVAILABLE / Serviço temporariamente indisponível`.
- Changes bootstrap order to `loadConfig -> initializeRuntimeConfig -> configureLogger -> JWT/debug -> infrastructure`.
- Produces `configureLogger(config: ObservabilityConfig): void`; logger no longer reads `process.env`.

- [ ] **Step 1: Write RED bootstrap-order tests**

Use injected spies to prove invalid configuration loads no infrastructure, runtime configuration exists before model/route/job loading, and logger configuration receives no secrets.

- [ ] **Step 2: Write RED 503 boundary tests**

Inject `IntegrationUnavailableError('activeCampaign', new Error('token=secret'))` and require the exact 503 envelope/header while the redacted log contains useful integration classification but no secret.

- [ ] **Step 3: Implement initialization and classification**

Initialize once after parsing and before `configureJwt`. Keep `headersSent` behavior. The public message is fixed and never contains the integration identifier or cause.

- [ ] **Step 4: Remove logger environment reads**

Make pre-bootstrap defaults safe and local; `configureLogger` applies typed level/directory/metrics behavior after config validation. Do not open or rotate external transports in tests.

- [ ] **Step 5: Verify and commit**

```powershell
node_modules\.bin\jest.cmd --ci --runInBand tests/bootstrap/bootstrap.test.ts tests/security/errorHandling.test.ts tests/security/logger.test.ts
npm.cmd run types:check
npm.cmd run lint
git diff --check
```

Commit: `config: initialize production runtime settings`

---

### Task 3: Migrate core and observability environment consumers

**Files:**
- Modify: `src/security/validatedInput.ts`
- Modify: `src/services/systemMonitor.service.ts`
- Modify: `src/services/syncUtilizadoresServices/syncReports.service.ts`
- Modify: `src/services/syncUtilizadoresServices/universalSyncService.ts`
- Modify: `src/controllers/studentsController.ts`
- Modify: `src/controllers/tagEvaluation.controller.ts`
- Modify: `src/controllers/testimonials.controller.ts`
- Modify: `src/controllers/users.controller.ts`
- Modify: affected focused tests under `tests/security`, `tests/controllers`, and `tests/services`
- Modify: `tests/tooling/productionBoundaryInventory.test.ts`

**Interfaces:**
- Consumes `getRuntimeConfig().core` and `.observability`.
- Removes `NODE_ENV`, `LOG_LEVEL`, `LOG_METRICS`, `npm_package_version`, and equivalent direct reads from these runtime files.

- [ ] **Step 1: Write RED consumer tests**

Initialize explicit test configs and prove each consumer uses typed values. Mutation proof changes one consumer back to `process.env.NODE_ENV`; inventory gate must fail.

- [ ] **Step 2: Migrate consumers without changing behavior**

Use injected config in factories where already available; otherwise read the initialized provider at call time, never import time. Preserve exact test/development branches and logging levels.

- [ ] **Step 3: Reduce the inventory baseline exactly**

Remove only migrated entries; any new path fails the gate.

- [ ] **Step 4: Verify and commit**

```powershell
$env:MONGOMS_RUNTIME_DOWNLOAD='false'
npm.cmd test -- --ci --runInBand tests/tooling/productionBoundaryInventory.test.ts tests/security/validatedInput.test.ts tests/security/logger.test.ts tests/controllers/usersV2Legacy.characterization.test.ts
npm.cmd run types:check
npm.cmd run lint
git diff --check
```

Commit: `config: migrate core runtime consumers`

---

### Task 4: Migrate request-driven integration configuration

**Files:**
- Modify: `src/config/activecampaign.config.ts`
- Modify: `src/services/activeCampaign/activeCampaignService.ts`
- Modify: `src/services/clareza/clarezaCarteiraService.ts`
- Modify: `src/services/clareza/clarezaEarningsService.ts`
- Modify: `src/services/clareza/clarezaFmpService.ts`
- Modify: `src/services/clareza/clarezaRaioxService.ts`
- Modify: `src/services/clareza/clarezaTop10Service.ts`
- Modify: `src/services/courseLessonCatalog.service.ts`
- Modify: `src/services/guru/guru.constants.ts`
- Modify: `src/services/guru/guruSync.service.ts`
- Modify: `src/services/notification.service.ts`
- Modify: `src/services/studentOgiSummary.service.ts`
- Modify: `src/services/syncUtilizadoresServices/curseducaServices/curseduca.adapter.ts`
- Modify: `src/services/syncUtilizadoresServices/hotmartServices/hotmart.helpers.ts`
- Modify: `src/services/syncUtilizadoresServices/hotmartServices/hotmartLessonsService.ts`
- Modify: `src/controllers/clarezaController.ts`
- Modify: `src/controllers/classes.controller.ts`
- Modify: `src/controllers/guru.sso.controller.ts`
- Modify: `src/controllers/guru.webhook.controller.ts`
- Modify: `src/controllers/syncUtilizadoresControllers/curseduca.controller.ts`
- Modify: `src/controllers/syncUtilizadoresControllers/hotmart.controller.ts`
- Modify: relevant integration/service/controller tests
- Modify: `tests/tooling/productionBoundaryInventory.test.ts`

**Interfaces:**
- Consumes `AppConfig.integrations` configured/unconfigured states.
- Unconfigured request-driven integrations throw `IntegrationUnavailableError` before any Axios/fetch/SDK call.

- [ ] **Step 1: Write RED configured/unconfigured tests per integration family**

Use fake adapters and egress sentinel assertions. For ActiveCampaign, FMP, Hotmart, CursEduca, Guru, Slack, and student summary, prove unconfigured calls produce the typed error and zero adapter calls; configured calls receive typed values.

- [ ] **Step 2: Migrate one family at a time**

Remove import-time constants and raw environment reads. Preserve public method signatures where possible; introduce small factories only where required for injection. Never add default production endpoints or credentials.

- [ ] **Step 3: Delete superseded ActiveCampaign configuration authority**

Delete `src/config/activecampaign.config.ts` only after `rg` proves zero importers. If it still owns a unique public type, move that type to `configTypes.ts` first.

- [ ] **Step 4: Prove no egress and update inventory**

Run focused integration tests with fake ports and the offline sentinel. Remove exact migrated paths from the tooling baseline.

- [ ] **Step 5: Verify and commit**

```powershell
$env:MONGOMS_RUNTIME_DOWNLOAD='false'
npm.cmd test -- --ci --runInBand tests/security/f1OfflineGuard.test.ts tests/security/guruDebug.test.ts tests/services/clareza tests/services/guru tests/controllers
npm.cmd run types:check
npm.cmd run lint
git diff --check
```

Commit: `config: type request integration settings`

---

### Task 5: Migrate renewal and background-job configuration

**Files:**
- Modify: `src/services/renewal/discordRolesSync.service.ts`
- Modify: `src/services/renewal/discordScheduledMessages.service.ts`
- Modify: `src/services/renewal/hotmartRefunds.service.ts`
- Modify: `src/services/renewal/renewalAcSync.service.ts`
- Modify: `src/services/renewal/renewalSync.service.ts`
- Modify: `src/runtime/startJobs.ts`
- Modify: `.env.example`
- Modify: `tests/bootstrap/config.test.ts`
- Modify: `tests/runtime/jobRuntime.test.ts`
- Modify: renewal/Discord security and service tests
- Modify: `tests/tooling/productionBoundaryInventory.test.ts`

**Interfaces:**
- Consumes typed `RenewalConfig` plus configured integration states.
- Enabled-feature matrix is explicit and startup-validated.
- Disabled features schedule no external work and require no integration credential.

- [ ] **Step 1: Write RED production configuration matrix**

Cover each flag independently and in combinations: sync, write dates, write tags, refund processing, auto-execute, Discord role sync, Discord auto-execute, messages, and scheduled messages. Require bounded integer IDs/caps and valid URLs.

- [ ] **Step 2: Prove disabled features are inert**

With all feature flags false and credentials absent, start jobs with fake dependencies and require zero integration calls. With a feature true and its required group missing, require `loadConfig` failure before job loading.

- [ ] **Step 3: Migrate renewal services**

Replace flag functions and numeric/default parsing with typed config reads. Remove hard-coded production Discord URL/channel fallbacks; defaults may exist only as explicit validated values in `.env.example`, never as runtime activation.

- [ ] **Step 4: Verify and commit**

```powershell
$env:MONGOMS_RUNTIME_DOWNLOAD='false'
npm.cmd test -- --ci --runInBand tests/bootstrap/config.test.ts tests/runtime/jobRuntime.test.ts tests/security/renewalAcDestructiveValidation.test.ts tests/security/discordRenewalDestructiveValidation.test.ts
npm.cmd run types:check
npm.cmd run lint
git diff --check
```

Commit: `config: validate enabled renewal features`

---

### Task 6: Enforce the central 5xx contract and migrate small HTTP surfaces

**Files:**
- Modify: `tests/tooling/productionBoundaryInventory.test.ts`
- Modify: `tests/security/errorHandling.test.ts`
- Modify: `src/middleware/auth.middleware.ts`
- Modify: `src/routes/ACroutes/activecampaign.routes.ts`
- Modify: `src/routes/users.routes.ts`
- Modify: `src/routes/dashboardRoutes.ts`
- Modify: `src/routes/validationLogs.routes.ts`
- Modify: `src/routes/achievements.routes.ts`
- Modify: `src/routes/events.routes.ts`
- Modify: focused route/controller tests

**Interfaces:**
- Produces final negative-gate rules for `.status(500)`, public `error.message`, and `details:` in 5xx JSON.
- Every migrated handler accepts `next: NextFunction` and delegates unknown failures with `next(error)`.

- [ ] **Step 1: Write RED negative and representative HTTP tests**

Add temporary local-500 and public-detail fixtures, require the tooling gate to fail, then remove fixtures. For events and achievements, inject failures and require the exact central envelope/header with no `details`.

- [ ] **Step 2: Apply the canonical migration pattern**

```ts
export async function handler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.run()
    res.json(result)
  } catch (error) {
    next(error)
  }
}
```

Remove duplicate logging from migrated catches; the central handler is the single error log authority. Preserve deliberate 4xx branches.

- [ ] **Step 3: Verify and commit**

```powershell
npm.cmd test -- --ci --runInBand tests/security/errorHandling.test.ts tests/security/eventsDestructiveValidation.test.ts tests/security/activeCampaignDestructiveValidation.test.ts tests/tooling/productionBoundaryInventory.test.ts
npm.cmd run types:check
npm.cmd run lint
git diff --check
```

Commit: `security: centralize small route failures`

---

### Task 7: Migrate Guru, product, course, dashboard, and analytics 5xx paths

**Files:**
- Modify: `src/controllers/guru.analytics.controller.ts`
- Modify: `src/controllers/guru.inactivation.controller.ts`
- Modify: `src/controllers/guru.snapshot.controller.ts`
- Modify: `src/controllers/guru.webhook.controller.ts`
- Modify: `src/controllers/guru.sso.controller.ts`
- Modify: `src/controllers/guru.sync.controller.ts`
- Modify: `src/controllers/guru.trials.controller.ts`
- Modify: `src/controllers/guruSubscriptionList.controller.ts`
- Modify: `src/controllers/guruWebhookList.controller.ts`
- Modify: `src/controllers/products/productProfile.controller.ts`
- Modify: `src/controllers/products/product.controller.ts`
- Modify: `src/controllers/products/productSalesStats.controller.ts`
- Modify: `src/controllers/products/products.controller.ts`
- Modify: `src/controllers/course.controller.ts`
- Modify: `src/controllers/courseLessons.controller.ts`
- Modify: `src/controllers/lessons.controller.ts`
- Modify: `src/controllers/dashboard.controller.ts`
- Modify: `src/controllers/dashboardQuick.controller.ts`
- Modify: `src/controllers/businessAnalytics.controller.ts`
- Modify: `src/controllers/cohortAnalytics.controller.ts`
- Modify: `src/controllers/metrics.controller.ts`
- Modify: `src/controllers/discovery.controller.ts`
- Modify: `src/controllers/engagement.controller.ts`
- Modify: relevant focused tests
- Modify: `tests/tooling/productionBoundaryInventory.test.ts`

**Interfaces:**
- Consumes the central handler contract from Task 6.
- Removes every local 500 branch from these domains without changing success/4xx behavior.

- [ ] **Step 1: Add one injected-failure RED test per domain**

Require central envelope, correlation header, and redacted logging for Guru, products, course, dashboard, and analytics representatives.

- [ ] **Step 2: Migrate all inventoried paths in the owned files**

Use `next(error)` for unknown errors and explicit `HttpError` only for stable known public failures. Do not retain `console.error`/logger calls in the same catch.

- [ ] **Step 3: Require zero owned-domain scan results**

Run the tooling test and a scoped `rg`; update the migration inventory by exact paths.

- [ ] **Step 4: Verify and commit**

```powershell
$env:MONGOMS_RUNTIME_DOWNLOAD='false'
npm.cmd test -- --ci --runInBand tests/controllers tests/security/guruDestructiveValidation.test.ts tests/security/productProfilesDestructiveValidation.test.ts
npm.cmd run types:check
npm.cmd run lint
git diff --check
```

Commit: `security: centralize domain controller failures`

---

### Task 8: Migrate sync, monitoring, renewal, and ActiveCampaign/tag 5xx paths

**Files:**
- Modify: `src/controllers/sync.controller.ts`
- Modify: `src/controllers/syncUtilizadoresControllers/hotmart.controller.ts`
- Modify: `src/controllers/syncUtilizadoresControllers/cronManagement.controller.ts`
- Modify: `src/controllers/syncUtilizadoresControllers/syncStats.controller.ts`
- Modify: `src/controllers/syncUtilizadoresControllers/curseduca.controller.ts`
- Modify: `src/controllers/syncUtilizadoresControllers/syncReports.controller.ts`
- Modify: `src/controllers/tagMonitoring/tagMonitoring.controller.ts`
- Modify: `src/controllers/tagMonitoring/tagNotification.controller.ts`
- Modify: `src/controllers/tagMonitoring/criticalTag.controller.ts`
- Modify: `src/controllers/renewal.controller.ts`
- Modify: `src/controllers/acTags/activecampaign.controller.ts`
- Modify: `src/controllers/acTags/tagRule.controller.ts`
- Modify: `src/controllers/acTags/acReader.controller.ts`
- Modify: `src/controllers/acTags/tagRuleEstimate.controller.ts`
- Modify: `src/controllers/webhooks.controller.ts`
- Modify: relevant focused tests
- Modify: `tests/tooling/productionBoundaryInventory.test.ts`

**Interfaces:**
- Removes every local 500 branch from sync/monitoring/renewal/AC domains.
- Preserves destructive-validation and dry-run/kill-switch 4xx contracts.

- [ ] **Step 1: Write RED failure-envelope tests**

Cover one read and one destructive path per domain with fake services. Require no external adapter call beyond the injected fake and exact central envelopes.

- [ ] **Step 2: Migrate the owned controllers**

Add `NextFunction` parameters and delegate unknown failures. Retain stable validation/auth errors. Remove duplicated raw error bodies and duplicate catch logging.

- [ ] **Step 3: Run destructive-policy regression suites**

All existing ActiveCampaign, sync, cron, renewal, and tag-monitoring input/security tests must remain green.

- [ ] **Step 4: Verify and commit**

```powershell
$env:MONGOMS_RUNTIME_DOWNLOAD='false'
npm.cmd test -- --ci --runInBand tests/security/activeCampaignDestructiveValidation.test.ts tests/security/cronDestructiveValidation.test.ts tests/security/renewalAcDestructiveValidation.test.ts tests/security/syncDestructiveValidation.test.ts tests/security/tagMonitoringDestructiveValidation.test.ts
npm.cmd run types:check
npm.cmd run lint
git diff --check
```

Commit: `security: centralize integration controller failures`

---

### Task 9: Migrate the large users, classes, testimonials, and Clareza 5xx surfaces

**Files:**
- Modify: `src/controllers/users.controller.ts`
- Modify: `src/controllers/classes.controller.ts`
- Modify: `src/controllers/testimonials.controller.ts`
- Modify: `src/controllers/clarezaController.ts`
- Modify: `src/controllers/auth.controller.ts`
- Modify: `src/controllers/populateHistory.controller.ts`
- Modify: `src/controllers/userHistory.controller.ts`
- Modify: `src/controllers/testHistory.controller.ts`
- Modify: `src/controllers/studentsController.ts`
- Modify: `src/controllers/studentHistory.controller.ts`
- Modify: `src/controllers/tagEvaluation.controller.ts`
- Modify: `src/controllers/usersReviewLists.controller.ts`
- Modify: `src/controllers/health.controller.ts`
- Modify: relevant characterization/input/security tests
- Modify: `tests/tooling/productionBoundaryInventory.test.ts`

**Interfaces:**
- Reduces the repository HTTP-layer local-500 and public-detail inventories to exactly zero.
- Does not split large controllers or close ARCH-02 in this task.

- [ ] **Step 1: Write characterization RED/GREEN coverage before mechanical edits**

For each large controller, cover representative success, deliberate 4xx, and thrown dependency failure. Record exact existing success/4xx bodies and require them unchanged after migration.

- [ ] **Step 2: Migrate in file-local batches**

Change only error forwarding and required `NextFunction` signatures. After each file, run its focused tests and the scoped scan before continuing.

- [ ] **Step 3: Prove mutation sensitivity and global zero**

Temporarily restore one `res.status(500).json({ details: error.message })`, require the tooling test to fail with its path/line, restore central forwarding, and require:

```text
local_http_500=0
public_error_detail=0
```

- [ ] **Step 4: Verify and commit**

```powershell
$env:MONGOMS_RUNTIME_DOWNLOAD='false'
npm.cmd test -- --ci --runInBand tests/controllers tests/security/usersDestructiveValidation.test.ts tests/security/classesDestructiveValidation.test.ts tests/security/testimonialsDestructiveValidation.test.ts tests/tooling/productionBoundaryInventory.test.ts
npm.cmd run types:check
npm.cmd run lint
git diff --check
```

Commit: `security: remove remaining local 500 responses`

---

### Task 10: Remove dead boundaries, close evidence, and run final gates

**Files:**
- Delete: superseded config modules/helpers proven to have zero importers
- Modify: `docs/HARDENING-WORKPLAN.md`
- Modify: `docs/superpowers/plans/2026-08-04-production-config-error-boundary.md`
- Modify: `.env.example` for the final typed configuration contract only

**Interfaces:**
- Produces exact `checked=96 open=8 total=104 percent=92.3`.
- Produces production preflight evidence without deployment or live integration contact.

- [ ] **Step 1: Run dead-code and negative scans**

Require zero orphaned config authorities, zero undocumented raw runtime environment readers, zero local HTTP 500 responses, zero public error-detail bodies, zero broken scripts/imports, and no tracked artifacts.

- [ ] **Step 2: Run production-shaped offline validation**

Use fake non-production credentials and enabled/disabled feature matrices. Parse only; do not connect to Mongo, Redis, or integrations. Record exact commands and exits.

- [ ] **Step 3: Close exactly OPS-01 and SEC-10**

Update only those two existing workplan checkboxes with code/evidence completion and explicit operational caveats. Recount mechanically and require exactly 96/8/104/92.3.

- [ ] **Step 4: Commit tracked closeout**

Commit: `docs: close production boundary block`

- [ ] **Step 5: Run final gates serially on final tracked HEAD**

```powershell
npm.cmd run lint
npm.cmd run types:check
$env:MONGOMS_RUNTIME_DOWNLOAD='false'; npm.cmd test -- --ci --runInBand
npm.cmd run build
$env:RUN_LOAD_TESTS='true'; npm.cmd run test:load -- --ci --runInBand
npm.cmd run test:e2e -- --ci --runInBand
git diff --check 91f50c6..HEAD
git status -sb
```

- [ ] **Step 6: Independent whole-range review and structured Luna proof**

Fix every Critical/Important finding in one final wave and re-review it. Inspect every executor rollout and require `session_meta.payload.agent_role=executor_luna` plus every relevant `turn_context.payload.model=gpt-5.6-luna`. Delete only this plan's ignored SDD workspace after final approval.
