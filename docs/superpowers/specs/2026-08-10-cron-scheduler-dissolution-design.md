# Cron Scheduler Dissolution Design

**Date:** 2026-08-10
**Branch:** `remake`
**Status:** approved design, pending implementation plan

## Objective

Physically remove `src/services/cron/scheduler.ts` (1,354 physical lines) and replace it with focused scheduler modules, each at or below 500 physical lines, while preserving every public method, persisted field, schedule, timezone, retry rule, execution order, response contract, and currently observable side effect.

This is an architecture-only change. It does not activate integrations, implement notification delivery, change cron expressions, alter job policy, or migrate persisted data.

## Non-negotiable invariants

- Work only on `remake`; never commit or push to `main`.
- Remain offline: no production MongoDB, Hotmart, CursEduca, ActiveCampaign, Discord, email, webhook, or other network integration.
- Preserve the existing public import surface from `services/cron/scheduler` through a directory `index.ts`.
- Preserve the `CronManagementService` class and default singleton used by runtime, controllers, routes, compatibility adapters, and tests.
- Preserve protected-job semantics, including `ClarezaRefresh`.
- Preserve all internal job names, cron expressions, timezones, enabled defaults, admin identity, sync configuration, retry policy, notification configuration, and update behavior.
- Preserve the order of database writes, schedule registration/cancellation, history persistence, job statistics, and notifications.
- Preserve the current notification behavior: logging/no-op only. Real email or webhook delivery is a separate feature and requires its own design.
- No `any`, type-silencing casts, non-null assertions, TypeScript suppressions, or new ESLint suppressions.
- Every handwritten TypeScript file must contain at most 500 physical lines.
- Apply rule #9 before moving a block. Remove code only after proving it has no runtime, route, test, dynamic-import, or side-effect consumer.
- Use characterization-first RED/GREEN. Every extracted boundary must be protected by a mutation that fails for the intended behavioral reason.

## Current consumers

The stable module path is consumed by:

- `src/runtime/startJobs.ts`
- `src/controllers/syncUtilizadoresControllers/cronManagement.controller.ts`
- `src/routes/cron/cronManagement.routes.ts`
- `src/services/cron/cronTagsCompatibility.service.ts` through an injected scheduler port
- `src/services/cron/canonicalCronTagsScheduler.adapter.ts`
- `tests/services/cron/schedulerDashboardStats.test.ts`

Consumers continue using `services/cron/scheduler`. Node/TypeScript directory resolution will select `scheduler/index.ts` after the old file is deleted.

## Considered approaches

### A. Vertical responsibility split — selected

Extract registry, cron-expression utilities, mandatory-job provisioning, dispatch, execution, and the public management façade. Each module owns a coherent behavior and communicates through typed interfaces.

Benefits: clear ownership, direct unit tests, no arbitrary line-based dependencies, physical removal of the monolith, and a stable public API. Risk is controlled by characterization before each move.

### B. Mechanical line-range split — rejected

Move contiguous methods into files while retaining their current coupling. This is faster initially but produces modules whose boundaries follow file position rather than behavior, leaving hidden dependencies and a distributed monolith.

### C. Scheduler rewrite — rejected

Replace the class with a new dependency-injected scheduling engine. This could yield a cleaner final abstraction but would change too many semantics at once: schedule timing, retry behavior, persistence order, default jobs, callback failure handling, and singleton lifecycle.

## Target topology

### `src/services/cron/scheduler/registry.ts`

Owns scheduled `node-schedule` jobs in memory.

- `SchedulerRegistry.register(jobId, job)` cancels an existing job before replacement.
- `unregister(jobId)` cancels and removes one job.
- `get(jobId)` reads one job.
- `getAll()` exposes the active registry for status methods without duplicating state.
- `clear()` cancels every job and empties the registry.

It does not know MongoDB, job configuration, business dispatch, or logging policy.

### `src/services/cron/scheduler/cronExpression.ts`

Owns cron syntax and next-run calculations.

- `validateCronExpression(expression)` preserves the current five/six-field validation and `node-schedule` validation behavior.
- `calculateNextRun(expression)` preserves the current temporary-job calculation and next-hour fallback.
- `getNextExecutions(expression, count)` preserves the current approximation and result cardinality.
- `describeCronExpression(expression)` is moved only if it currently belongs to the class; existing standalone utilities remain canonical and are not duplicated.

Temporary scheduled jobs must always be cancelled, including exceptional paths.

### `src/services/cron/scheduler/jobProvisioning.ts`

Owns reconciliation of required internal jobs:

- `RenewalOfferSync`
- `AchievementEvaluation`
- `RenewalAcSync`
- `DiscordRolesSync`
- `DiscordScheduledMessages`

For each job, it preserves create-versus-update behavior, exact configuration, cron expression, timezone, enabled state, and the existing runtime flags. It returns persisted job configurations; it does not directly own the in-memory registry.

### `src/services/cron/scheduler/jobDispatcher.ts`

Owns selection and execution of business work.

- Detects jobs with dedicated `.job.ts` implementations.
- Preserves the current dedicated-job invocation convention and result normalization.
- Preserves fallback dispatch for Hotmart, CursEduca, Discord, combined sync, and daily pipeline.
- Preserves Universal Sync options, adapter options, actor metadata, counters, warnings, errors, and success calculation.
- Does not schedule callbacks, update `CronJobConfig`, or persist `CronExecution` history.

Integrations remain injected or Jest-mocked in tests. No characterization may call a real adapter or integration.

### `src/services/cron/scheduler/jobExecution.ts`

Owns one execution lifecycle for both manual and scheduled calls.

- Creates the running state and timing context.
- Calls the dispatcher exactly once.
- Updates last-run state, counters, status, duration, and next run in the same order as today.
- Persists `CronExecution` success/failure history without allowing history failure to replace the primary result.
- Applies current retry and failure behavior.
- Invokes notification behavior after persistence in the existing order.
- Normalizes thrown `Error` and non-`Error` values without exposing new public details.

Notification delivery remains an injected no-op/logger implementation matching current behavior. The existing TODOs become an explicit `CronNotificationPort` boundary, not newly activated functionality.

### `src/services/cron/scheduler/CronManagementService.ts`

Remains the public façade and owns coordination only:

- create, update, delete, toggle, and query job configurations;
- scheduling/rescheduling persisted configurations;
- manual execution delegation;
- initialization and shutdown;
- public status and next-execution methods.

It composes the registry, expression utilities, provisioner, dispatcher, executor, repositories/models, and scheduler transport. It must remain below 500 lines and avoid reimplementing extracted behavior.

### `src/services/cron/scheduler/index.ts`

Exports:

- `CronManagementService`
- the singleton `syncSchedulerService`
- the singleton as the default export

No other internal scheduler module is part of the public application surface unless a test imports a pure utility directly.

## Data and control flow

### Startup

1. `startJobs` calls `syncSchedulerService.initializeScheduler()`.
2. The service clears the in-memory registry.
3. Provisioning reconciles the five required internal jobs in the current order.
4. Active jobs are loaded from MongoDB.
5. Each active job is scheduled with its persisted timezone and cron expression.
6. A scheduled callback delegates to the common execution lifecycle.

### Manual execution

1. The façade resolves the job and rejects missing/disabled conditions exactly as today.
2. The common executor records start state.
3. The dispatcher selects dedicated or fallback business logic.
4. The executor persists job statistics and execution history.
5. Notification no-op/logging runs in the existing position.
6. The façade returns the unchanged `CronExecutionResult`.

### Update/toggle/delete

MongoDB remains the source of configuration truth. Registry changes happen only after the same successful persistence points as in the current implementation. Protected-job restrictions remain in the façade and are characterized before extraction.

## Error handling

- Configuration and cron validation failures remain synchronous at the current public boundary.
- Business-dispatch failures remain execution failures and continue updating the same counters/history.
- History persistence failure remains non-fatal to the primary job result.
- Schedule registration failure must not leave an untracked live job.
- Shutdown remains idempotent: every registered job is cancelled and the registry is empty.
- Real notification delivery is deliberately absent; no exception or retry semantics are invented.

## Characterization and RED/GREEN strategy

### Registry and cron expressions

- replacement cancels the old job once;
- unregister and clear cancel the correct jobs;
- valid/invalid expressions preserve results;
- temporary jobs are cancelled;
- next-run fallback and `getNextExecutions` preserve current output.

### CRUD and protected jobs

- create defaults and scheduling order;
- update nested merges and rescheduling;
- delete cancellation and persistence order;
- toggle enable/disable behavior;
- protected jobs reject forbidden changes;
- query filters and sort behavior remain unchanged.

### Provisioning and startup

- required jobs are created when absent;
- existing required jobs are updated only where current code updates them;
- active jobs schedule once;
- per-job scheduling failures remain isolated according to current behavior;
- repeated initialization does not duplicate live registry jobs;
- shutdown cancels all jobs.

### Dispatch and execution

- each dedicated job name selects the exact implementation;
- Hotmart/CursEduca/all fallback adapter options and Universal Sync inputs remain exact;
- unknown or unsupported sync types preserve current behavior;
- manual and scheduled paths share equivalent persistence;
- success, partial failure, thrown `Error`, and thrown non-`Error` values preserve counters/history;
- history failure remains non-fatal;
- notification port receives the same success/failure decision but performs no external work.

Mutations target observable invariants such as actor metadata, job selection, counter increments, persisted status, cancellation, and callback order. A module-existence compile failure alone is not sufficient for the critical execution paths.

## Stop conditions

Stop and request a business decision if investigation shows any of the following:

- a TODO/no-op is expected to perform a real external action;
- two duplicate job definitions have materially different cron expressions or options;
- a currently unreachable branch has a plausible external consumer or dynamic loader;
- extraction would change retry count, schedule timezone, enabled default, protected-job policy, or persistence order;
- a test requires a real integration or production database to establish equivalence;
- a public method is used dynamically and cannot be preserved through the directory barrel.

## Acceptance

- `src/services/cron/scheduler.ts` does not exist.
- All consumers resolve through `src/services/cron/scheduler/index.ts` without route or public API changes.
- Every new handwritten TypeScript file is at most 500 physical lines.
- Negative greps find no stale file-qualified scheduler imports or dead exports outside topology assertions/history.
- No new lint suppressions, `any`, type-silencing casts, non-null assertions, or ambient configuration reads.
- Focused characterization suites pass with documented RED mutations.
- `npm run lint`, `npm run types:check`, complete Jest with `MONGOMS_RUNTIME_DOWNLOAD=false`, `npm run build`, and `git diff --check` pass.
- `package.json`, `package-lock.json`, and `yarn.lock` remain unchanged.
- Workplan records before/after line counts, topology, debt reduction, tests, and the notification follow-up.
- Commit subjects are lowercase Conventional Commits; only `origin/remake` is pushed.
