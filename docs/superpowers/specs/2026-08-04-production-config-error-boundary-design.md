# Production Configuration and Error Boundary Design

**Date:** 2026-08-04

**Branch:** `remake`

**Baseline:** `3145ee0`

**Target workplan boxes:** OPS-01 and SEC-10

**Expected progress:** 94/104 (90.4%) to 96/104 (92.3%)

## Problem

The application already has a typed core `AppConfig` and a central Express error handler, but neither boundary is repository-wide:

- 39 runtime source files still read `process.env` directly.
- 345 HTTP-layer branches still construct status-500 responses locally.
- Some status-500 responses expose `error.message` or a `details` field.
- Optional integrations can be absent, malformed, or partially configured until the first request or background job exercises them.
- Existing tests prove the central primitives, but do not prevent new direct environment reads or ad hoc 500 responses elsewhere.

This creates late production failures, inconsistent client contracts, and possible disclosure of internal error details.

## Goals

1. Make application configuration typed, validated, immutable, and initialized before infrastructure, routes, jobs, or listeners start.
2. Fail startup for invalid core configuration and for an enabled feature whose required integration configuration is missing or malformed.
3. Allow disabled or request-driven optional integrations to remain unconfigured without contacting them or blocking startup.
4. Replace every HTTP-layer ad hoc 500 response with the central error boundary.
5. Preserve all success and existing 4xx contracts.
6. Guarantee by machine-checked gates that direct runtime environment reads, local 500 envelopes, and public `error.message` leakage cannot return.
7. Remove superseded configuration modules, helpers, branches, and tests once their callers have migrated.

## Non-goals

- No deployment, staging mutation, production database, live Redis, browser, sibling Front mutation, or external API call.
- No normalization of successful responses or deliberate 4xx responses.
- No ARCH-03 repository-wide response-envelope migration beyond central 5xx errors.
- No new integration, credential, feature flag, dependency, or package-manager change.
- No role-matrix, destructive-operation policy, pagination, or large-controller decomposition work.

## Design Principles

- Parse raw strings once; consume typed values everywhere else.
- A disabled feature must be inert and must not require unrelated credentials.
- An enabled feature must never start in a partially configured state.
- A request-driven but unconfigured integration fails through a stable central `503 INTEGRATION_UNAVAILABLE` response, not through a raw SDK/HTTP exception.
- Unknown internal errors always use a generic public message; diagnostic detail exists only in the redacted logger event.
- Migration is incremental and reviewable, but OPS-01 and SEC-10 remain open until their final repository-wide gates reach zero.

## Architecture

### 1. Configuration authority

`src/config/` is the only runtime boundary allowed to inspect `process.env`.

The existing `loadConfig(env)` remains the application entrypoint and expands `AppConfig` into focused immutable sections:

- `core`: node environment, Mongo, port, JWT authorities, webhook secret, CORS, authentication and debug-route policy.
- `redis`: optional outside production; mandatory in production for distributed rate limiting.
- `observability`: log level, metrics flag, and log directory.
- `integrations`: typed states for ActiveCampaign, FMP, Hotmart, CursEduca, Guru, Discord bot, Slack, and student-summary access.
- `renewal`: typed feature flags, caps, field IDs, product IDs, channel configuration, and auto-execution/write switches.

Every optional integration is represented explicitly as either:

```ts
type IntegrationConfig<T> =
  | { configured: false }
  | { configured: true; value: Readonly<T> }
```

Feature configuration is validated in two layers:

1. Syntax and range validation always applies when a variable is present.
2. Completeness validation applies when the related feature is enabled.

Examples:

- `RENEWAL_AC_SYNC_ENABLED=true` requires the ActiveCampaign authority and valid renewal IDs/caps.
- `DISCORD_ROLES_SYNC_ENABLED=true`, auto-execute, or message scheduling requires the Discord bot URL and shared-secret policy required by that mode.
- FMP, Guru, Hotmart, CursEduca, and Slack may remain unconfigured when no startup job is enabled for them. A request that needs an unconfigured integration receives `IntegrationUnavailableError`.

No default production host, channel ID, credential, product ID, or secret may silently activate an integration. Numeric fields reject `NaN`, fractions where integers are required, negatives, zero where invalid, and values over their explicit cap.

### 2. Runtime configuration access

Bootstrap validates configuration before loading infrastructure. It initializes a small typed runtime-config provider exactly once. Runtime modules receive a focused configuration object through an existing factory/dependency boundary where practical; legacy singleton services use the initialized typed provider during migration.

The provider:

- throws before initialization;
- rejects a second initialization with different values;
- returns frozen/read-only values;
- never exposes the original `NodeJS.ProcessEnv`;
- never serializes secrets in errors or logs.

Maintenance scripts keep separate typed parsers under `src/config/` so they do not need unrelated application secrets. Tests inject explicit environment objects or typed config fixtures.

The final tooling gate rejects `process.env` outside approved configuration adapters and the minimal executable entrypoints documented by the test. The allowlist is finite, path-exact, and contains a rationale for every entry.

### 3. Central HTTP error boundary

All HTTP 5xx paths converge on `createErrorHandling().handler`.

The stable response remains:

```json
{
  "success": false,
  "code": "INTERNAL_ERROR",
  "message": "Erro interno do servidor",
  "correlationId": "request-id"
}
```

Known operational failures use explicit central classifications, including:

- `INTEGRATION_UNAVAILABLE` / 503;
- `PAYLOAD_TOO_LARGE` / 413;
- `INVALID_JSON` / 400;
- existing explicit `HttpError` status/code/message values.

Unknown errors never expose `error.message`, stack, upstream body, token, URL query, email, request body, or headers. The logger receives only the redacted structured event already defined by `ErrorLogEvent`.

Controllers and routes migrate as follows:

- asynchronous uncaught errors are thrown or passed to `next(error)`;
- known internal failures are converted to `HttpError` only when a stable public code/message is meaningful;
- catch blocks that only log and construct a 500 response are removed;
- handlers that already emitted headers retain Express's `headersSent` delegation behavior;
- success and deliberate 4xx branches remain byte-for-byte compatible unless a test demonstrates an existing security defect.

### 4. Domain waves

The migration is split into independently reviewed waves so a 384-site big-bang cannot hide regressions:

1. Configuration types, parser matrix, runtime provider, and regression gate.
2. Core/observability and request-driven integration consumers.
3. Renewal/background-job configuration and enabled-feature completeness.
4. Error-boundary contract and HTTP-layer negative gate.
5. Route/controller 500 migration by domain: small routes, analytics/users/classes, ActiveCampaign/tags, sync/renewal, then remaining catalog entries.
6. Dead configuration/helper removal, repository recount, final review, and gates.

Each wave requires a real RED/GREEN cycle, a lowercase Conventional Commit, and an independent SPEC/QUALITY review before the next wave begins.

## Production Behavior and Impact

### Intended breaking behavior

- Production refuses to start when core configuration is invalid or an enabled feature is incomplete.
- Internal 5xx bodies become one central envelope.
- A request-driven unconfigured optional integration returns a controlled 503 instead of failing later with an SDK/network error.

### Preserved behavior

- Successful responses are unchanged.
- Existing 4xx status codes and bodies are unchanged.
- Disabled integrations remain disabled and open no connection.
- Existing Redis, Mongo, CORS, JWT, shutdown, warmup, and egress behavior remains intact.

### Risk controls

- A production configuration-matrix test covers every enable flag and its required fields.
- A pre-deploy validation command parses production-shaped environment input without connecting to infrastructure.
- Error-contract tests inject failures behind representative routes from every route domain.
- A route/tooling scan prevents local 500 responses and public error-detail fields.
- A configuration/tooling scan prevents raw runtime environment access outside the approved boundary.
- Rollback is a normal Git rollback plus restoring the prior environment; no data migration is introduced.

Code completion means production-ready, not production-proven. Deployment, canary observation, and live integration validation remain explicit operational follow-up.

## Testing Strategy

### Configuration RED/GREEN

- Missing/invalid core values fail before infrastructure loads.
- Every boolean accepts only `true` or `false`.
- Every numeric value enforces integer/range/cap rules.
- Partial credential groups fail deterministically without printing values.
- Disabled features accept absent credentials.
- Enabled features require their complete credential group.
- Runtime provider rejects use-before-init and incompatible reinitialization.
- Mutation proof temporarily reintroduces a direct `process.env` read outside `src/config/` and requires the tooling gate to fail.

### Error-boundary RED/GREEN

- Representative failures from each route domain return the exact central envelope and `X-Request-ID`.
- Invalid incoming request IDs use the generated correlation ID.
- Logged detail is redacted and truncated; response contains no detail field.
- `headersSent` continues to delegate.
- Existing 4xx and success characterization tests remain green.
- Mutation proof temporarily reintroduces `res.status(500)` and a public `error.message`; tooling tests must fail.

### Final offline gates

```powershell
npm.cmd run lint
npm.cmd run types:check
$env:MONGOMS_RUNTIME_DOWNLOAD='false'; npm.cmd test -- --ci --runInBand
npm.cmd run build
$env:RUN_LOAD_TESTS='true'; npm.cmd run test:load -- --ci --runInBand
npm.cmd run test:e2e -- --ci --runInBand
git diff --check 3145ee0..HEAD
git status -sb
```

No test may contact ActiveCampaign, Discord, FMP, Hotmart, Guru, CursEduca, Slack, production Mongo, or live Redis.

## Acceptance Criteria

OPS-01 closes only when:

- all application runtime configuration is typed and validated before infrastructure startup;
- enabled-feature dependency matrices are machine-checked;
- disabled optional integrations remain inert;
- the direct-environment-access gate is green with only documented configuration-boundary exceptions;
- superseded configuration code is removed;
- production-shaped validation is reproducible without external connections.

SEC-10 closes only when:

- all HTTP-layer 5xx paths use the central handler;
- no public 5xx body exposes internal detail;
- all representative route domains prove the exact envelope and correlation header;
- success and intentional 4xx characterization tests remain green;
- repository-wide negative gates reject local 500 responses and public error details.

The workplan may then change exactly two boxes, producing `checked=96 open=8 total=104 percent=92.3`. No other open box is closed by this block.

## Stop Conditions

Stop and return for a design decision if:

- an integration has no reliable enablement boundary and making it required would block currently valid production behavior;
- a 500 response is proven to be a versioned consumer contract that cannot migrate compatibly within this block;
- a required fix expands into ARCH-03, roles, destructive-operation policy, pagination, or sibling Front changes;
- an offline test requires a missing dependency or tries to contact a real integration;
- the final scans cannot reach zero without a broad exception or unbounded allowlist.
