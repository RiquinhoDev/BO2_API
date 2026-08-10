# Task 3 report - Notification errors

## Scope

- Migrated exactly nine notification handlers in `tagNotification.controller.ts`.
- Wrapped the eight ordinary mounted handlers with `asyncRoute` after `authenticate`.
- Kept `withValidatedInput(tagMonitoringDeleteInput, ...)` as the destructive route authority and threaded `next` through its callback without stacking another wrapper.
- Preserved success envelopes, query parsing/defaults, 400/404 bodies, static route precedence, authentication, validation, and service call order.
- Removed nine local 500 formatters and nine obsolete `no-explicit-any` suppressions; Tag Monitoring debt fell from 17 to 8.
- No Front, dependency, lockfile, network, database, integration, deployment, push, or unrelated changes.

## RED evidence

Before production edits:

`node .\node_modules\jest\bin\jest.js --ci --runInBand tests/controllers/tagMonitoringErrorContract.test.ts`

The notification family was genuinely RED: all nine 500 paths returned the legacy public `error` detail and omitted the stable code and correlation ID. The strict dismiss test initially used a non-ObjectId fixture and correctly stopped at validation with 400; replacing only the fixture with a valid ObjectId exercised the live controller path without changing validation.

## Implementation

Unknown notification failures now reach the final handler through these stable codes:

- `TAG_NOTIFICATION_LIST_FAILED`
- `TAG_NOTIFICATION_DETAIL_FAILED`
- `TAG_NOTIFICATION_DETAILS_FAILED`
- `TAG_NOTIFICATION_MARK_READ_FAILED`
- `TAG_NOTIFICATION_MARK_UNREAD_FAILED`
- `TAG_NOTIFICATION_DISMISS_FAILED`
- `TAG_NOTIFICATION_UNREAD_COUNT_FAILED`
- `TAG_NOTIFICATION_MARK_ALL_READ_FAILED`
- `TAG_NOTIFICATION_STATS_FAILED`

The existing read, unread, and dismiss not-found branches still return their original 404 payloads before unknown failures are forwarded.

## GREEN evidence

Focused notification contract selection:

`tagMonitoringErrorContract.test.ts: PASS, 38 passed, 1 untouched Task 4 critical sentinel skipped`

Companion suites:

`productionBoundaryInventory.test.ts: PASS, 4/4`
`tagMonitoringDestructiveValidation.test.ts: PASS, 8/8`
`tagMonitoring.routes.test.ts: PASS, 2/2`

Inventory now records exactly 8 remaining Tag Monitoring local 500 sites: zero monitoring, zero notification, eight critical-tag. Static precedence tests prove both `/notifications/stats` and `/notifications/unread/count` avoid the `/:id` handler.

## Static gates

`npm.cmd run lint:baseline:prune`: PASS
`npm.cmd run lint`: PASS
`npm.cmd run types:check`: PASS
`git diff --check`: PASS

Negative debt scan found zero local 500 formatters, `error.message`, controller `logger.error`, explicit `any`, casts, non-null assertions, ignores, or suppressions in the Task 3 controller/tests. Lockfiles are unchanged.

## Open wave state

Task 3 is implemented and awaits review. Task 4 still owns the eight critical-tag local 500 sites and the intentionally RED critical-family sentinel in the unfiltered shared contract suite.
