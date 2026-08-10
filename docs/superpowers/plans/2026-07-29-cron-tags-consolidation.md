# Cron Tags Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the lying duplicate `cron-tags` service with honest compatibility routes backed by the canonical scheduler and real execution data.

**Architecture:** Keep both deprecated route mounts, turn their execution aliases into non-writing `410 Gone` responses, and put the remaining use cases behind an injected compatibility service. A Mongoose adapter owns persistence, a scheduler port owns scheduling, the controller stays HTTP-only, and strict schemas protect every route.

**Tech Stack:** TypeScript 5.9 strict, Express 5, Mongoose 8, Jest 29, Supertest, node-schedule.

## Global Constraints

- Work only on branch `remake`; one coherent subject per commit.
- Run offline: no real Guru, Hotmart, ActiveCampaign, CursEduca, Discord, or production Mongo calls.
- Do not run `npm install` or modify either lockfile.
- Preserve all 18 deprecated mounts and their deprecation instrumentation.
- Keep `/api/cron/tag-rules-only` as the only manual write endpoint.
- Use real types or `unknown` plus narrowing; no new `any`, `as`, `!`, or `@ts-ignore` suppressions.
- Keep the route catalog and Front manifest generated from the real route surface.

---

### Task 1: Make execution aliases honest and non-writing

**Files:**
- Create: `tests/cron/cronTagsCompatibility.test.ts`
- Modify: `src/controllers/cron/cronManagement.controller.ts`

**Interfaces:**
- Consumes: `CronTagsExecuteInput` from `src/security/cronTagsDestructiveInput.ts`.
- Produces: `executeNow(input, res)` and `executeLegacy(input, res)` responding with status `410` and `{ success: false, error, replacement: "/api/cron/tag-rules-only" }`.

- [x] **Step 1: Write the failing route tests**

Mount the real `cronManagement.routes.ts` router under both prefixes. For each
of the four execution URLs, send a valid `{ userId: "admin-1" }` plus the
offline marker and assert:

```ts
expect(response.status).toBe(410)
expect(response.body).toEqual({
  success: false,
  error: expect.any(String),
  replacement: '/api/cron/tag-rules-only',
})
```

Mock only `executeTagRulesOnly`/`executeDailyPipeline` at the external-write
boundary and assert neither is called after the four requests.

- [x] **Step 2: Verify RED**

Run:

```powershell
npx.cmd jest --ci tests/cron/cronTagsCompatibility.test.ts
```

Expected: the current aliases return `200` with fabricated success instead of
`410`.

- [x] **Step 3: Implement the minimal 410 responses**

Replace both service calls with one private response helper:

```ts
private respondExecutionGone(res: Response): void {
  res.status(410).json({
    success: false,
    error: 'Endpoint descontinuado',
    replacement: '/api/cron/tag-rules-only',
  })
}
```

Keep both public method signatures because the validated route boundary still
passes `CronTagsExecuteInput`.

- [x] **Step 4: Verify GREEN and existing validation**

Run:

```powershell
npx.cmd jest --ci tests/cron/cronTagsCompatibility.test.ts tests/security/cronTagsDestructiveValidation.test.ts
```

Expected: all tests pass; strict DTO rejection remains intact.

---

### Task 2: Introduce clean ports and strict route boundaries

**Files:**
- Modify: `tests/cron/cronTagsCompatibility.test.ts`
- Create: `src/security/cronTagsInput.ts`
- Create: `src/services/cron/cronTagsCompatibility.types.ts`
- Create: `src/services/cron/cronTagsCompatibility.service.ts`
- Create: `src/services/cron/mongooseCronTags.repository.ts`
- Create: `tests/services/cron/cronTagsCompatibility.service.test.ts`
- Create: `src/utils/cronDescription.ts`
- Create: `tests/utils/cronDescription.test.ts`
- Modify: `src/services/cron/scheduler.ts`
- Modify: `src/controllers/cron/cronManagement.controller.ts`
- Modify: `src/routes/cron/cronManagement.routes.ts`

**Interfaces:**
- Produces: `cronToHumanReadable(expression: string): string`.
- Produces: `syncSchedulerService.isSchedulerActive(): boolean`, backed by the canonical registry.
- Produces: `CronTagsRepositoryPort` and `CronTagsSchedulerPort`.
- Produces: `CronTagsCompatibilityService`, constructed from those two ports.

- [x] **Step 1: Write failing config/history/statistics/status tests**

Unit-test the service with typed fakes of both ports. Route tests exercise the
real router/controller/service composition and mock only the two production
adapters. Cover:

```ts
// config update
expect(updateJob).toHaveBeenCalledWith(jobId, {
  cronExpression: '0 3 * * *',
  enabled: false,
})

// history
expect(CronExecution.find).toHaveBeenCalledWith({
  cronName: 'TAG_RULES_SYNC',
})
expect(response.body.history).toEqual(seedExecutions)

// statistics fixture
// success 1000ms, error 3000ms, running without duration
expect(response.body.statistics).toEqual({
  totalExecutions: 3,
  successRate: 50,
  avgDuration: 2000,
})

// status
expect(response.body.stats.schedulerActive).toBe(false)
```

Also assert history rejects a limit above `200`, uses
`{ startTime: -1, _id: -1 }`, and status sorts recent executions by the real
field `{ startTime: -1, _id: -1 }`.

- [x] **Step 2: Verify RED**

Run:

```powershell
npx.cmd jest --ci tests/cron/cronTagsCompatibility.test.ts
```

Expected: the ports/service/schemas do not exist and the old controller still
owns persistence and scheduling details.

- [x] **Step 3: Implement canonical config and reads**

Implement:

```ts
const TAG_RULES_JOB = 'TAG_RULES_SYNC'
const { limit } = paginate(req.query, { defaultLimit: 10, maxLimit: 200 })
```

- Read config with `CronJobConfig.findOne({ name: TAG_RULES_JOB })`.
- Update it through `syncSchedulerService.updateJob(config._id, {
  cronExpression, enabled: isActive })`.
- Read history through `CronExecution.find({ cronName: TAG_RULES_JOB })`,
  stable sort, clamp, and `lean()`.
- Compute statistics from the returned real execution documents in the date
  window; exclude `running` from the success-rate denominator and missing
  durations from the average.
- Add `isSchedulerActive()` to the canonical scheduler using
  `registry.getAll().size > 0`.
- Move the human-readable cron formatter to the pure utility.
- Replace touched `catch (error: any)` declarations with `unknown` and a
  shared safe error-message helper.

- [x] **Step 4: Test the pure cron formatter**

Write literal expectations for:

```ts
cronToHumanReadable('0 2 * * *') // Todos os dias às 02:00
cronToHumanReadable('*/15 * * * *') // A cada 15 minutos
cronToHumanReadable('invalid') // Expressão inválida
```

Run:

```powershell
npx.cmd jest --ci tests/cron/cronTagsCompatibility.test.ts tests/utils/cronDescription.test.ts
```

Expected: all tests pass.

---

### Task 3: Compose production adapters, remove duplication, and verify

**Files:**
- Delete: `src/services/cron/cronManagement.service.ts`
- Modify: `eslint-suppressions.json`
- Modify: `docs/HARDENING-WORKPLAN.md`

**Interfaces:**
- Consumes: the migrated controller from Tasks 1-2.
- Produces: no imports or runtime references to the duplicate service.

- [x] **Step 1: Prove the last consumer is gone**

Run:

```powershell
rg -n "services/cron/cronManagement\.service|cronManagementService" src tests
```

Expected before deletion: no controller import or call remains; only the
duplicate file's own exports may match.

- [x] **Step 2: Delete the duplicate and prune lint suppressions**

Delete the service, run:

```powershell
npm.cmd run lint:baseline:prune
npm.cmd run types:baseline:update
```

Record the exact `no-explicit-any` reduction in the commit body.

- [x] **Step 3: Repeat the negative search**

Run:

```powershell
rg -n "services/cron/cronManagement\.service|cronManagementService" src tests
```

Expected: zero matches. Search `executeIntelligentTagSync`,
`executeTagRulesSync`, and the hardcoded `total: 100` compatibility payload;
expected: zero matches in `src/`.

- [x] **Step 4: Run the sandbox gate**

Run:

```powershell
npm.cmd run lint
npm.cmd run types:check
npx.cmd jest --ci
npm.cmd run build
```

Expected: lint, ratchet, and build pass. Jest passes except only the already
documented reviewer-owned stale route-catalog failure if it is still present;
report its exact output without hiding it.

- [ ] **Step 5: Commit and push**

Stage only the consolidation files and use:

```text
refactor(cron): consolidate deprecated tag routes

- return 410 from non-writing execution aliases
- serve config and execution data from canonical sources
- remove the duplicate scheduler implementation
```

Push `remake`. If GitHub rejects the configured credential, preserve the local
commit and report the exact `403` plus ahead count.
