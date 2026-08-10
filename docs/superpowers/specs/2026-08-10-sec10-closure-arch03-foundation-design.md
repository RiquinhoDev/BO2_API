# SEC-10 Closure and ARCH-03 Foundation Design

**Date:** 2026-08-10  
**Branch:** `remake`  
**Scope:** BO2_API, with read-only Front inspection where consumer evidence is required

## Objective

Close the remaining SEC-10 debt without changing successful HTTP contracts, then establish a fail-closed ARCH-03 foundation that prevents new response-shape inconsistency. The terminal targets for this mission are:

- local `res.status(500)` inventory: **188 -> 0**;
- public technical-detail exposure: remain **0**;
- all unexpected failures use the central error boundary with a stable public message, machine-readable code, correlation ID, and logger-only redacted detail;
- existing success, validation, not-found, conflict, authentication and integration-unavailable contracts remain unchanged;
- an ARCH-03 inventory and ratchet classify every mounted response surface without forcing a broad success-envelope migration in the same mission.

## Non-goals

- No production deployment or operational observation.
- No real Guru, Hotmart, ActiveCampaign, CursEduca, Discord, Redis or production Mongo access.
- No global rewrite of successful payloads.
- No compatibility break hidden behind a generic response helper.
- No role-policy redesign, SEC-01 authorization expansion or route deletion.

## Architecture

### Central error boundary

Every unexpected handler failure must flow through the existing `HttpError`/`internalError` boundary. Controllers retain only domain decisions they own:

- deterministic 400/404/409 responses stay local when they are intentional public contracts;
- typed domain errors may map to a stable non-500 response;
- unexpected values, including non-`Error` rejections, are passed as the internal cause;
- routes use `asyncRoute` exactly once, after authentication/validation middleware already present;
- handlers behind `withValidatedInput` thread `next` through that wrapper rather than stacking wrappers.

The central handler remains the single authority for correlation IDs, PII redaction, logging and the canonical error envelope.

### SEC-10 execution waves

The 188 sites are migrated in three checkpoints. Boundaries are domain-based, not arbitrary file counts.

1. **Wave A — integrations and products:** ActiveCampaign/tag controllers, Products, Hotmart and Guru snapshots.
2. **Wave B — synchronization:** Sync Utilizadores, Sync, Sync Stats, cron-management and related history/reporting controllers.
3. **Wave C — remaining application surfaces:** Clareza, Testimonials, engagement, courses, lessons, auth/health/metrics and the small tail.

Each family receives characterization before production edits. A family commit must lower the exact inventory and may not move debt to another file.

### ARCH-03 foundation

ARCH-03 begins after SEC-10 reaches zero, but within the same overall mission. It adds no forced success-envelope migration. The foundation consists of:

1. a generated inventory of mounted route response families;
2. explicit classification such as canonical error, `{ success, data }`, domain envelope, raw array/object, stream/file/redirect and no-content;
3. a fail-closed baseline keyed by route identity, not fragile line counts;
4. canonical schema/types for new JSON endpoints;
5. a ratchet that rejects unclassified new routes and new response families;
6. Front consumer evidence for any later migration candidate.

Existing success responses are recorded, not normalized silently. A future feature-by-feature ARCH-03 migration must update Front and Back atomically where the consumer contract changes.

## Contract preservation

Before migrating a family, tests must characterize:

- successful status and complete body shape;
- validation and authentication precedence;
- 400/404/409/410/429/503 behavior where applicable;
- side-effect order and partial-failure semantics;
- aliases and app-level mounts;
- Front-visible fallback messages when they are intentional.

The SEC-10 assertion covers secret-bearing `Error` values and non-`Error` rejections. Public responses must never contain the injected email, token or internal detail.

## Testing strategy

For each family:

1. prove RED against the current local 500 or public-detail behavior;
2. apply the minimal boundary migration;
3. prove GREEN for central 500 plus preserved local contracts;
4. run the family suites, route catalog, inventory mutation/restoration, lint and strict TypeScript;
5. commit one cohesive domain subject.

At the end of each wave, run the full offline Jest suite and build. At the terminal gate run:

- `npm run lint:baseline:prune`;
- `npm run lint`;
- `npm run types:check`;
- `MONGOMS_RUNTIME_DOWNLOAD=false npm test -- --runInBand`;
- `npm run build`;
- `git diff --check`;
- lockfile diff proof.

## Stop conditions

Stop and request a decision when:

- an existing 500 body is demonstrably consumed as business data;
- a catch performs compensating writes or recovery that cannot be moved without changing order;
- success and failure shapes are coupled in a Front parser;
- a route is shadowed, dead or duplicated and deletion would change the catalog;
- typed domain mapping requires a new business rule;
- offline characterization cannot exercise the real boundary safely.

Do not weaken tests, preserve raw technical errors, add broad casts/suppressions or invent a compatibility response.

## Completion criteria

SEC-10 is code-complete only when the exact inventory is **0**, mutation proof remains effective, public technical detail remains **0**, all gates pass and the workplan records the result. ARCH-03 foundation is code-complete when every mounted route has a response-family decision and the fail-closed ratchet rejects an unclassified route or family.

Operational closure remains separate: no production claim is made until the approved deployment and observation process is completed.
