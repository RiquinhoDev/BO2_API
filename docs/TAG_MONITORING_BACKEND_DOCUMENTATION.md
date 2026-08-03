# Tag monitoring backend - code reference

> Status (2026-08-03): this stable path is a concise, non-executable reference to the live tag-monitoring code. It is not an operational runbook.

## Status

The runtime remains the authority. This page records verified source paths, request/auth contract pointers, and the scheduled job without reproducing operational recipes. Confirm the source before making any change.

## Verified runtime map

- Models and persistence contracts:
  - [CriticalTag.ts](../src/models/tagMonitoring/CriticalTag.ts) - active tag names and priority.
  - [WeeklyNativeTagSnapshot.ts](../src/models/tagMonitoring/WeeklyNativeTagSnapshot.ts) - weekly native-tag snapshots and comparison.
  - [TagChangeNotification.ts](../src/models/tagMonitoring/TagChangeNotification.ts) and [TagChangeDetail.ts](../src/models/tagMonitoring/TagChangeDetail.ts) - grouped changes and affected-student details.
  - [WeeklyTagMonitoringConfig.ts](../src/models/tagMonitoring/WeeklyTagMonitoringConfig.ts) - singleton scope and enabled state.
- Services:
  - [weeklyTagMonitoring.service.ts](../src/services/tagMonitoring/weeklyTagMonitoring.service.ts) - snapshot flow, comparison, cleanup, statistics, and priority queries.
  - [criticalTagManagement.service.ts](../src/services/tagMonitoring/criticalTagManagement.service.ts) - critical-tag lifecycle and priority lookup.
  - [tagNotification.service.ts](../src/services/tagMonitoring/tagNotification.service.ts) - notification grouping, details, filters, and read state.
- Controllers:
  - [tagMonitoring.controller.ts](../src/controllers/tagMonitoring/tagMonitoring.controller.ts) - snapshots, statistics, scope, and priority queries.
  - [criticalTag.controller.ts](../src/controllers/tagMonitoring/criticalTag.controller.ts) - critical-tag requests.
  - [tagNotification.controller.ts](../src/controllers/tagMonitoring/tagNotification.controller.ts) - notification requests.
- Router and job:
  - [tagMonitoring.routes.ts](../src/routes/tagMonitoring.routes.ts) - authenticated route contract.
  - [weeklyTagSnapshot.job.ts](../src/jobs/weeklyTagSnapshot.job.ts) - job implementation and manual-run adapter; scheduler dispatch target.
  - [scheduler.ts](../src/services/cron/scheduler.ts) - dispatch branch for named CronJobConfig jobs.

## Request/auth contract pointers

[routes/index.ts](../src/routes/index.ts) mounts the router at `/tag-monitoring`; with the API prefix, clients address `/api/tag-monitoring/*`. Every route in [tagMonitoring.routes.ts](../src/routes/tagMonitoring.routes.ts) includes the `authenticate` middleware.

The route families are:

- Critical tags: list, create, soft remove, permanent remove, toggle, priority, available tags, and statistics.
- Notifications: list, statistics, detail, detail items, read/unread, remove, unread count, and mark-all-read.
- Snapshots: list, per-email history, comparison, and manual execution.
- Monitoring: students-by-priority, global/weekly statistics, scope read/update, and enabled toggle.

The two destructive request paths use `withValidatedInput(tagMonitoringDeleteInput, ...)`; inspect the router and security helper before changing their contract. Controllers define query, path, and body parsing.

## Scheduled job

[weeklyTagSnapshot.job.ts](../src/jobs/weeklyTagSnapshot.job.ts) declares `JOB_NAME = 'WeeklyTagSnapshot'` and an informational `CRON_SCHEDULE = '0 2 * * 0'` constant. The source does not consume that constant to provision a scheduler record. Its exported `run` entry point calls `weeklyTagMonitoringService.performWeeklySnapshot()` and adapts the result to the scheduler shape.

[scheduler.ts](../src/services/cron/scheduler.ts) dispatches a pre-existing CronJobConfig whose name contains `WeeklyTagSnapshot` through the job module. Whether a matching record exists, is enabled, has the expected expression/timezone, or is registered at runtime is unverified here.

## Offline verification

- Verify the paths and contracts above by source inspection.
- Use the repository's offline lint, type, test, and build gates with the egress guard enabled.
- Treat failures, stale links, and contract drift as documentation blockers; do not infer runtime health from this page.

## Operator safety boundary

This reference contains no executable examples. Do not use it to perform direct database writes, call external providers, create data outside tests, deploy, or mutate production. Any operational action requires a separately approved, current procedure and explicit environment checks.

## Maintenance rule

Keep this filename as the stable reference path. Update it only when the linked runtime paths or contracts change, and include the source file that proves each change. Keep operational procedures out of this code reference.
