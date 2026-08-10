# Cron Scheduler Dissolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the 1,354-line `src/services/cron/scheduler.ts` and preserve its complete public and runtime behavior behind focused modules no larger than 500 physical lines.

**Architecture:** Keep `CronManagementService` as a thin compatibility façade while extracting the in-memory registry, cron-expression calculations, mandatory-job provisioning, business dispatch, and execution lifecycle behind typed interfaces. The directory `scheduler/index.ts` becomes the stable public module, so current consumers do not change their import specifier.

**Tech Stack:** TypeScript 5.9, Node.js, Mongoose, node-schedule, Jest 29, ts-jest, MongoMemoryServer.

## Global Constraints

- Work only on `remake`; never commit or push to `main`.
- Remain offline; mock every adapter, job module, database model, scheduler transport, and notification.
- Preserve every public method, singleton export, job name, cron expression, timezone, default, protected-job rule, retry policy, persistence order, and callback order.
- Keep notification email/webhook delivery as a documented no-op; do not activate external work.
- Do not modify `package.json`, `package-lock.json`, or `yarn.lock`.
- No `any`, type-silencing casts, non-null assertions, TypeScript suppressions, or new ESLint suppressions.
- Keep every handwritten TypeScript file at or below 500 physical lines.
- Apply rule #9 before moving each block; remove only exports proven unconsumed.
- Use characterization-first RED/GREEN with a behavior mutation for each critical boundary.
- One lowercase Conventional Commit per independently reviewable task.

---

### Task 1: Characterize and extract the scheduler registry

**Files:**
- Create: `src/services/cron/scheduler/registry.ts`
- Create: `tests/services/cron/schedulerRegistry.test.ts`
- Modify: `src/services/cron/scheduler.ts`

**Interfaces:**
- Produces: `SchedulerRegistry` with `register(jobId: string, job: Job): void`, `unregister(jobId: string): void`, `get(jobId: string): Job | undefined`, `getAll(): ReadonlyMap<string, Job>`, and `clear(): void`.
- Consumes: only the structural `Job` contract from `node-schedule`.

- [ ] Write a failing suite importing `SchedulerRegistry` from the new path. Use fake jobs whose `cancel` functions are Jest spies.

```ts
const registry = new SchedulerRegistry()
registry.register('job-1', first)
registry.register('job-1', replacement)
expect(first.cancel).toHaveBeenCalledTimes(1)
expect(registry.get('job-1')).toBe(replacement)
```

- [ ] Run `npx jest --ci --runInBand tests/services/cron/schedulerRegistry.test.ts`; verify RED because the module does not exist.
- [ ] Move the registry unchanged, inject one registry instance into `CronManagementService`, and retain singleton behavior through default constructor dependencies.
- [ ] Mutate replacement cancellation out; verify the focused test fails, then restore it.
- [ ] Run the focused suite, lint, types, and `git diff --check`.
- [ ] Commit `refactor(cron): extract scheduler registry`.

### Task 2: Extract cron-expression calculations

**Files:**
- Create: `src/services/cron/scheduler/cronExpression.ts`
- Create: `tests/services/cron/cronExpression.test.ts`
- Modify: `src/services/cron/scheduler.ts`

**Interfaces:**
- Produces: `createCronExpressionService(scheduleTransport, clock)` returning `validate(expression): void`, `calculateNextRun(expression): Date`, and `getNextExecutions(expression, count?): Date[]`.
- The transport is structural: `scheduleJob(expression: string, callback: () => void): Job | null`.

- [ ] Characterize five/six fields, invalid field counts, null scheduling, next invocation, next-hour fallback, cancellation, and the existing one-result behavior of `getNextExecutions`.

```ts
expect(service.getNextExecutions('0 2 * * *', 5)).toEqual([nextInvocation])
expect(fakeJob.cancel).toHaveBeenCalledTimes(1)
```

- [ ] Run the new suite and verify module-existence RED.
- [ ] Implement the service with injected schedule transport and clock; delegate the façade methods without changing public output.
- [ ] Mutate `testJob.cancel()` out; verify RED, restore, and rerun GREEN.
- [ ] Run focused scheduler/controller/compatibility tests, lint, types, and diff check.
- [ ] Commit `refactor(cron): extract expression service`.

### Task 3: Characterize and extract job dispatch

**Files:**
- Create: `src/services/cron/scheduler/jobDispatcher.ts`
- Create: `tests/services/cron/schedulerJobDispatcher.test.ts`
- Modify: `src/services/cron/scheduler.ts`

**Interfaces:**
- Produces: `CronJobDispatcher.execute(job: ICronJobConfig): Promise<CronDispatchResult>`.
- Produces: `CronDispatchResult = { success: boolean; stats: ILastRunStats; errorMessage?: string }`.
- Consumes typed dependency functions for dedicated jobs, daily pipeline, renewal/achievement jobs, Hotmart/CursEduca adapters, and Universal Sync.

- [ ] Characterize exact dispatch for EvaluateRules, ResetCounters, RebuildDashboardStats, CronExecutionCleanup, WeeklyTagSnapshot, ClarezaRefresh, GuruTrialCheck, RenewalOfferSync, RenewalAcSync, DiscordRolesSync, DiscordScheduledMessages, and AchievementEvaluation.
- [ ] Characterize fallback Hotmart and CursEduca adapter options and Universal Sync payloads, all-sync aggregation, current Discord synthetic result, pipeline normalization, unknown-specific-job failure, and non-Error rejection normalization.

```ts
expect(executeUniversalSync).toHaveBeenCalledWith(expect.objectContaining({
  syncType: 'hotmart',
  jobId: job._id.toString(),
  triggeredBy: 'CRON',
  batchSize: 50,
}))
```

- [ ] Verify RED because `CronJobDispatcher` does not exist.
- [ ] Move dispatch and normalization without database writes, scheduling, notifications, or execution-history logic.
- [ ] Replace `let result: any` with a typed `UnknownJobResult` plus narrowing helpers; do not change falsy-default semantics.
- [ ] Mutate one job-name mapping and one Universal Sync actor field; verify both RED and restore.
- [ ] Run focused dispatch and existing Universal Sync characterization, lint, types, and diff check.
- [ ] Commit `refactor(cron): extract job dispatcher`.

### Task 4: Extract notification and execution lifecycle

**Files:**
- Create: `src/services/cron/scheduler/notificationPort.ts`
- Create: `src/services/cron/scheduler/jobExecution.ts`
- Create: `tests/services/cron/schedulerJobExecution.test.ts`
- Modify: `src/services/cron/scheduler.ts`

**Interfaces:**
- Produces: `CronNotificationPort.notify(job, success, stats, errorMessage?): Promise<void>`.
- Produces: `createLoggingCronNotification(logger)` preserving the current no-op behavior.
- Produces: `CronJobExecutor.execute(job, context): Promise<CronExecutionResult>` for manual and scheduled callers.
- Consumes dispatcher, execution-history repository, clock, notification port, and persisted job document operations.

- [ ] Characterize success, business failure, thrown Error, thrown non-Error, job counter updates, last-run fields, execution history, history failure isolation, notification decision/order, and current retry scheduling behavior.

```ts
expect(events).toEqual([
  'dispatch',
  'job-save',
  'history-create',
  'notify',
])
```

- [ ] Verify RED against the missing executor.
- [ ] Extract the common lifecycle used by manual and scheduled callbacks; preserve the current different public wrappers where they differ.
- [ ] Mutate `failedRuns` or history error persistence; verify RED and restore.
- [ ] Run focused tests plus `schedulerDashboardStats.test.ts`, lint, types, and diff check.
- [ ] Commit `refactor(cron): extract execution lifecycle`.

### Task 5: Extract mandatory-job provisioning and startup lifecycle

**Files:**
- Create: `src/services/cron/scheduler/jobProvisioning.ts`
- Create: `tests/services/cron/schedulerJobProvisioning.test.ts`
- Create: `tests/services/cron/schedulerLifecycle.test.ts`
- Modify: `src/services/cron/scheduler.ts`

**Interfaces:**
- Produces: `reconcileMandatoryJobs(repository, config): Promise<ICronJobConfig[]>` in the current fixed order.
- Reconciles RenewalOfferSync, AchievementEvaluation, RenewalAcSync, DiscordRolesSync, and DiscordScheduledMessages with their exact existing definitions.
- The façade retains `initializeScheduler()`, `stopScheduler()`, `isActive()`, and scheduling/rescheduling coordination.

- [ ] Characterize absent/existing mandatory jobs, exact create/update payloads, current runtime flags, initialization order, per-job schedule isolation, repeated initialization, stop cancellation, and active status.
- [ ] Verify RED against the missing provisioner/lifecycle boundary.
- [ ] Move the five ensure methods into one typed provisioner without combining materially different options.
- [ ] Mutate one cron expression and initialization order; verify RED and restore.
- [ ] Run focused lifecycle, runtime job tests, compatibility tests, lint, types, and diff check.
- [ ] Commit `refactor(cron): extract job provisioning`.

### Task 6: Finish the façade and delete the monolith

**Files:**
- Create: `src/services/cron/scheduler/CronManagementService.ts`
- Create: `src/services/cron/scheduler/index.ts`
- Create: `tests/tooling/cronSchedulerTopology.test.ts`
- Modify: scheduler consumers only if TypeScript resolution requires explicit directory paths
- Delete: `src/services/cron/scheduler.ts`
- Modify: `tests/tooling/sourceFileSizeInventory.test.ts`
- Modify: `eslint-suppressions.json`
- Modify: `docs/HARDENING-WORKPLAN.md`

**Interfaces:**
- `index.ts` exports `CronManagementService`, named `syncSchedulerService`, and the same singleton as default.
- `CronManagementService` preserves every current public method and delegates extracted responsibilities.

- [ ] Add a failing topology test asserting the old file is absent, the directory barrel exposes the exact public surface, all known consumers resolve, and all scheduler modules are at most 500 lines.
- [ ] Move the remaining CRUD/query/scheduling coordination into the façade, create the barrel, rewire only imports that cannot resolve the directory automatically, and delete the old file.
- [ ] Prove negative greps for the physical old file, stale file-qualified imports, duplicate scheduler registries, dead exports, `any`, suppressions, and notification network clients.
- [ ] Run `npm run lint:baseline:prune`; update source-size and other ratchets only from actual failure output, lowering ceilings when debt falls.
- [ ] Update the workplan with 1,354→0, final module line counts, tests, RED mutations, notification no-op follow-up, and remaining files above 500.
- [ ] Run `npm run lint`, `npm run types:check`, `MONGOMS_RUNTIME_DOWNLOAD=false npm test`, `npm run build`, `git diff --check`, lockfile diff, and clean-worktree verification.
- [ ] Commit `refactor(cron): dissolve scheduler monolith` and push only `origin/remake`.

## Self-review

- Spec coverage: registry, expressions, dispatch, execution, provisioning, lifecycle, CRUD façade, compatibility barrel, physical deletion, file-size cap, offline safety, and notification no-op are each owned by a task.
- Type consistency: all execution paths converge on `CronDispatchResult`; only the executor persists lifecycle state; only the façade owns public compatibility.
- Scope: no notification implementation, schedule-policy change, data migration, package change, or integration activation is included.
- Placeholder scan: every implementation step names exact files, interfaces, behaviors, commands, and mutations; no deferred implementation placeholder is present.
