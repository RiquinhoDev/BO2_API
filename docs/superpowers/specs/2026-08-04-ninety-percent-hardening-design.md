# Ninety Percent Hardening Design

**Date:** 2026-08-04
**Branch:** `remake`
**Baseline:** `a1cd055`
**Target:** close exactly six existing checklist items, moving the measured workplan from 88/104 (84.6%) to 94/104 (90.4%).

## Context

The remaining workplan contains sixteen open boxes, but they are not equivalent in size or risk. The role matrix, destructive-operation policy, pagination migration, response-envelope migration, error-boundary migration, broad configuration migration, ESLint `any` debt, and vertical decomposition of giant modules remain multi-block changes. Closing any of those by documenting a partial slice would be false progress.

This block instead combines two stale bookkeeping closures whose implementation is already proven with four concrete operational-hardening deliveries. It remains strictly offline: no production MongoDB, Redis, ActiveCampaign, Discord, Guru, Hotmart, CursEduca, FMP, browser, package installation, or other network access.

## Boxes Closed by This Design

1. Controller cleanup protocol at workplan line 751.
2. `syncStats` shadow-route cleanup parent item at line 755.
3. DOC-02 root documentation and package metadata at line 1090.
4. Tracked-artifact, pinned-image, and default-credential hygiene at line 1091.
5. Remaining SEC-08 distributed rate-limit store, stable 429 envelope, and final CSP policy at line 1101.
6. TEST-01/02 suite separation, offline defaults, and egress guard at line 1130.

No new checklist items will be added merely to manipulate the denominator. The final recount must be `checked=94 open=10 total=104 percent=90.4`.

## 1. Evidence Reconciliation

### Controller protocol

The old controller ratchet workflow has been superseded by the stronger repository-wide invariant already delivered: `strict:true`, `noEmitOnError:true`, direct `tsc --noEmit`, and a zero-error build with no baseline file. The open umbrella item may be checked only after fresh lint, type-check, build, and a negative scan confirm that the removed ratchet has not returned. The workplan note will explain that the historical per-file sequence is closed by the stronger final invariant rather than pretending that the obsolete `types:baseline:update` command still exists.

### `syncStats`

The parent item is stale while its nested completion record already identifies commit `fe8c02f` and the exact removed routes and handlers. Fresh route/source scans must prove that only the live `/api/sync/stats` and `/api/sync/history` declarations remain and that the four live `:id` handlers retain typed request parameters. If that proof fails, the box remains open and the implementation is repaired before reconciliation.

These two closures are documentation reconciliation backed by current code evidence; they do not authorize unrelated controller edits.

## 2. Documentation and Artifact Hygiene

### Documentation layout

The seven tracked Markdown files still at repository root move without content rewrites except for a short status banner where needed:

| Current file | Destination | Classification |
| --- | --- | --- |
| `API_AUDIT.md` | `docs/archive/API_AUDIT_2026-07-15.md` | dated audit snapshot |
| `COMPLETE_SECURITY_AUDIT.md` | `docs/archive/NATIVE_TAG_SECURITY_AUDIT_2026-01-23.md` | historical, scope-limited audit |
| `NATIVE_TAG_PROTECTION_SUMMARY.md` | `docs/reference/NATIVE_TAG_PROTECTION_SUMMARY.md` | reference |
| `RENOVACAO_CONTEXTO_IA.md` | `docs/reference/renewal/RENOVACAO_CONTEXTO_IA.md` | renewal handoff |
| `RENOVACAO_DISCORD_CARGOS_PLAN.md` | `docs/reference/renewal/RENOVACAO_DISCORD_CARGOS_PLAN.md` | disabled renewal plan |
| `RENOVACAO_OGI_BO_PLAN.md` | `docs/reference/renewal/RENOVACAO_OGI_BO_PLAN.md` | disabled renewal plan |
| `URGENT_KEY_REPLACEMENT.md` | `docs/active/URGENT_KEY_REPLACEMENT.md` | unresolved operational action |

`docs/README.md` remains the authority for Active, Reference, Archive, Plans, and Specs and receives links with explicit status. Internal relative links are repaired mechanically and checked. The package metadata must remain `name: bo2-api`, `main: dist/index.js`, `private: true`; no dependency or lockfile change is allowed.

### Artifact policy

A small tooling test will enforce that known local outputs are ignored and absent from `git ls-files`, while deploy inputs stay tracked. It will also inspect every active compose image and reject floating tags such as `latest` or an absent tag, and reject default Grafana credentials. Existing fixed versions are accepted; digest pinning is not required when a concrete version is present.

Only disposable ignored files proven to be local outputs (`nul`, root `*.log`, and `tmpclaude-*`) may be deleted. Runtime directories such as `uploads/`, `logs/`, and `dist/` remain ignored and are not recursively deleted. Every deletion target must be resolved and checked inside the repository before removal.

## 3. Test Topology and Offline Boundary

Jest receives explicit, non-overlapping projects/configurations:

- `unit`: pure and mocked tests that do not require MongoMemoryServer;
- `integration`: local adapters, HTTP composition, and MongoMemoryServer tests;
- `load`: existing load tests, opt-in only;
- `e2e`: existing end-to-end tests, opt-in only.

The default `npm test` runs only `unit` and `integration`. `npm run test:unit`, `test:integration`, `test:load`, and `test:e2e` select one project explicitly. Existing legacy `tests/sprint1` remains excluded until separately migrated; it must not be relabelled as passing.

All Jest projects load `tests/setupEnv.ts` before application imports, so the existing fetch/Axios/HTTP/HTTPS egress guard remains universal. Load and E2E commands are registered but are not executed in this offline block. A tooling contract test will prove non-overlap, opt-in status, setup-file inheritance, and script registration. The final offline gate runs the safe default unit+integration set only.

The implementation must classify tests through explicit path lists or stable match patterns. It must not silently exclude an existing safe test. Baseline suite/test inventory is captured before configuration changes and reconciled after them.

## 4. SEC-08 Completion

### Store boundary

`httpPerimeter` stops constructing `MemoryStore` internally. It consumes a rate-limit store factory keyed by policy (`login`, `webhook`, `heavy`). The default factory remains memory-backed only for development and test composition. Production bootstrap must inject a distributed Redis-backed factory and fail before listening if Redis configuration is absent or the store cannot be constructed.

The Redis adapter uses the already-installed Redis client stack; no dependency installation is permitted. Keys are namespaced by policy and environment. The adapter implements the `express-rate-limit` store contract with atomic increment/expiry semantics and deterministic reset behavior. Tests use an in-memory fake port and never open a socket.

### 429 contract

Rate-limit responses use one stable public envelope:

```json
{
  "success": false,
  "code": "RATE_LIMITED",
  "message": "Demasiados pedidos",
  "correlationId": "request-id"
}
```

The handler reuses `res.locals.correlationId`, emits `X-Request-ID`, and sends no internal store details. The observability callback receives policy and correlation ID but no request body, authorization header, token, email, or IP address.

### CSP

Helmet enables an explicit API-safe Content Security Policy rather than `contentSecurityPolicy:false`. The policy is deny-by-default (`default-src 'none'`, with only the minimum directives needed by an API response) and retains the existing cross-origin resource policy required by consumers. Focused HTTP tests assert headers on success, preflight behavior, and 429 responses.

### Startup and shutdown

Distributed-store connection belongs to runtime startup, not module import or `createApp`. Shutdown closes the client through the existing runtime-resource lifecycle. If the repository's current Redis client lifecycle cannot safely be reused, a dedicated small adapter owns connection and teardown; global singleton side effects are forbidden.

## 5. Test Strategy

Each behavioral task follows real RED/GREEN:

1. Tooling tests fail on the current root-doc/artifact state, then pass after moves and policy enforcement.
2. Jest-topology tests fail before project separation, then pass without losing safe suites.
3. SEC-08 tests first prove the current MemoryStore-only construction, correlation-free 429 payload, and disabled CSP; implementation then makes them green.
4. Redis-store tests exercise atomic contract behavior against a fake Redis command port, including expiry, reset, prefix isolation, and dependency failure. No live Redis is used.
5. Startup tests prove production fails without distributed-store configuration and development/test can use injected memory stores.

Final gates, serially on the final tracked HEAD:

```powershell
npm.cmd run lint
npm.cmd run types:check
$env:MONGOMS_RUNTIME_DOWNLOAD='false'; npm.cmd test -- --ci --runInBand
npm.cmd run build
git diff --check
```

Additional negative scans cover root Markdown, tracked local artifacts, floating compose tags/default credentials, test-project overlap, missing egress setup, direct MemoryStore construction in production wiring, disabled CSP, and unstable 429 shapes.

## 6. Delivery Boundaries

Work is split into independently reviewable commits:

1. design and implementation plan;
2. controller/syncStats evidence reconciliation;
3. documentation relocation and index repair;
4. artifact/compose policy test and local-junk cleanup;
5. Jest project separation and tooling contracts;
6. SEC-08 store boundary and Redis adapter;
7. SEC-08 correlation-aware envelope and CSP;
8. workplan evidence/count closeout.

Every implementation task is delegated to a fresh `executor_luna`, reviewed independently, and corrected before the next task. No push is performed without explicit current authorization.

## 7. Stop Conditions and Non-goals

Stop rather than weakening the design if:

- an offline dependency is missing from the existing installation/cache;
- production Redis semantics require installing a new package;
- test separation loses or duplicates an existing safe suite;
- a moved document has an unresolved live consumer or broken link that cannot be repaired locally;
- a proposed checklist closure lacks current code evidence;
- the final count is not exactly 94/104.

This block does not close OPS-01, SEC-10, role authorization, destructive-operation policy, pagination migration, idempotency policy, response-envelope migration, ESLint `any` debt, or the two broad architecture boxes. It does not deploy, provision production secrets/origins/Redis, regenerate the sibling Front contract, or observe production traffic.
