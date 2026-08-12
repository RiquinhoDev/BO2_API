# Scalability terminal closure — Task 3 report

Date: 2026-08-12
Branch: `remake`
Scope: read-only operational scalability harness only

## Outcome

The fail-closed harness is implemented and registered as
`npm run scalability:operational`. It emits sanitized JSON with a target
fingerprint, timestamp, probe identity, p50/p95/p99 latency, concurrency,
heap/event-loop metrics, zero-write count and Mongo execution statistics when
an authorized Mongo target is supplied.

This is **not operational closure**. A local synthetic smoke probe ran successfully,
but no authorized Mongo target mechanism was present, so no real
`explain('executionStats')` or 1/10/50 target probe ran.

## TDD evidence

RED:

```text
npm.cmd test -- --selectProjects unit --runInBand tests/scalability/scalabilityOperationalHarness.test.ts
FAIL TS2307: Cannot find module '../../scripts/validate-scalability-operational'
Test Suites: 1 failed, 1 total
```

GREEN:

```text
npm.cmd test -- --selectProjects unit --runInBand tests/scalability/scalabilityOperationalHarness.test.ts
PASS tests/scalability/scalabilityOperationalHarness.test.ts
Tests: 7 passed, 7 total
Test Suites: 1 passed, 1 total
```

Covered behavior: missing authorization, production-looking target name,
write-capable authorization, non-allowlisted command, secret sanitization,
zero-write assertion and timeout.

## Local-smoke-first evidence

The local smoke target `local-read-only-fixture` ran before any possible real
target validation. Result: one `syntheticRead` probe named `local-smoke-baseline`, concurrency 1,
`writes: 0`. The emitted target fingerprint was `455d1a9d322bbffb`. No URI,
credential or secret was printed.

## Real-target decision

Environment discovery inspected variable **names/presence only**. None of the
required dedicated operational variables were present:

- `SCALABILITY_OPERATIONAL_ALLOW_READ_ONLY`
- `SCALABILITY_OPERATIONAL_TARGET_KIND`
- `SCALABILITY_OPERATIONAL_TARGET_NAME`
- `SCALABILITY_OPERATIONAL_MONGO_READ_ONLY`
- `SCALABILITY_OPERATIONAL_MONGODB_URI`
- `SCALABILITY_OPERATIONAL_MONGO_DATABASE`
- `SCALABILITY_OPERATIONAL_MONGO_COLLECTION`

Therefore real operational validation was not attempted. Closure remains
blocked until a user-authorized, explicitly non-production/read-only target is
loaded through those variables. The harness accepts only synthetic reads,
Mongo find explains and bounded Mongo find probes; it exposes no write command.

## Fresh gates

```text
npx.cmd eslint scripts/validate-scalability-operational.ts tests/scalability/scalabilityOperationalHarness.test.ts --no-ignore
exit 0

npm.cmd run build
exit 0

git diff --check
exit 0
```

No dependency or lockfile change was made. No external integration was called.
## Review round 1 fixes

A second RED run produced six expected failures: a production-looking Mongo URI
was accepted, invalid command parameters were accepted, and the default probe
still used the misleading `synthetic-baseline` identity.

The subsequent GREEN run passed 13/13 tests. Mongo URI host/path and the
separately supplied database name are inspected internally for production
markers without being emitted. Commands now require an allowlisted identity and
exact concurrency of 1, 10 or 50; explain remains fixed at 1. The synthetic
measurement is described only as a local smoke probe, not deterministic
performance evidence. Operational closure remains blocked and unchanged.
