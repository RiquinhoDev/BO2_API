# Clareza comparator parity - terminal offline ledger

**Recorded:** 2026-08-11
**Branch:** `remake`
**Legacy evidence:** `origin/main` at `d423cf0`
**Terminal code head:** `716c97d`

## Outcome

Comparator parity is **code- and evidence-complete offline**. It preserves the two legacy route identities and the selected public comparator contract, while replacing the legacy ambient-config/`any` implementation with typed policy, injected FMP and store ports, and central error handling. This is not operational closure: no deploy, external PHP/HTML observation, real FMP, Redis, MongoDB, or scheduler execution was authorized or performed.

## Main to remake parity

| Observable contract | `origin/main` evidence | `remake` evidence |
| --- | --- | --- |
| Public routes | `GET /api/clareza/comparador`; `POST /api/clareza/comparador/refresh` | Same two identities, mounted through `asyncRoute` |
| Read behavior | `?search=` returns search document; `?symbols=` compares up to four cached symbols | Same documents/cache headers; reads use snapshot store only and call FMP zero times |
| Refresh behavior | Manual symbols capped at ten; full refresh returns aggregate totals | Same limits and success shapes; injected FMP is reachable only from refresh orchestration |
| Missing/invalid behavior | Stable Portuguese validation/missing-symbol documents | Stable `400 { error }`; closed policy-code mapping preserves the canonical invalid-symbol message and never serializes a thrown message |
| Scheduler | Full comparator refresh after existing Clareza products | Same best-effort order with only aggregate safe metadata |

The comparator-specific `origin/main..716c97d` delta comprises **18 files**, **2,443 additions / 208 deletions**: six comparator source modules (**809 physical lines**), typed persistence, HTTP/job wiring, a contract fixture, and seven focused test files. The textual architecture is intentionally not identical: `origin/main` exports the monolithic `clarezaComparadorService`; `remake` owns the replacement under `services/clareza/comparador/**`.

One legacy implementation detail is deliberately normalized by the reviewed contract: the old invalid comparison service could carry an extra empty `companies` member, whereas the executed remake contract returns the reviewed `{ error }` 400 document. The exact selected contract is fixture- and router-tested; external HTML behavior was not observed, so that observation remains an operational gate rather than an assumed proof.

## RED/GREEN ledger

- Historical implementation ledger: policy characterizes normalization, deduplication, order, four/ten-symbol limits, cached missing symbols and ranked search; store covers Redis-to-Mongo fallback and five-snapshot retention; orchestration covers cache-only reads, bounded refresh, partial merge and persistence after settlement. Task 5 records its job-dependency mutation RED and router/catalog production-mount review.
- Terminal RED: the first full offline run found two public `error.message` leaks in comparator policy-error branches: **343/344 suites**, **2,130/2,133 tests**, **473.668 s**. The new forged-message contract then failed as intended: **1 failed / 5 passed**, receiving `forged comparator detail` instead of the stable policy message.
- GREEN: `ce6243d` maps the closed `EMPTY_SYMBOLS`/`INVALID_LIMIT` codes inside the policy domain. The contract proves both GET and POST reject a forged message while retaining the canonical 400 document. Comparator/SEC-10/ratchet focused proof: **11/11 suites, 77/77 tests**. The final authorized full offline rerun passed **344/344 suites, 2,134/2,134 tests, 365.01 s**.
- Gate-generated debt cleanup is separate in `716c97d`: exactly one obsolete Clareza job suppression object was removed (**0 additions / 8 deletions**), covering five `no-explicit-any` and eleven `no-console` baseline counts; no suppression was added.

## Terminal gates and audit

- `npm.cmd run lint:baseline:prune`, `npm.cmd run lint`, and `npm.cmd run types:check`: exit 0.
- Comparator + Clareza + route catalog focused run: **17/17 suites, 89/89 tests**. It includes the real application production mount. `contracts:responses:check` reported **441 reviewed decisions, 219 Front calls, 194 consumers**.
- Post-fix lint, strict TypeScript, response check, build and `git diff --check`: exit 0. The response catalog remained current; moving the policy mapping outside the controller deliberately avoided unreviewed evidence-pointer churn.
- Comparator-domain negative scan: **0** ambient `process.env`, explicit `any`, casts, suppressions, non-null assertions, raw `console.*`, or stale main-only import paths. The two `live_fmp` text matches are reviewed false positives: the FMP base-URL constant and the injected Axios adapter composed in `comparador.runtime`; neither is a read-path call, controller call, or ambient integration.

Known non-failing output remains the existing model-registry logs plus Mongoose duplicate-index and reserved-key warnings when the production mount imports the full tree. The tests use the local offline marker and injected seams; `MONGOMS_RUNTIME_DOWNLOAD=false` was set for the full run. There was no `--forceExit`, network, production datastore, real integration, deployment, or external HTML observation.

## Commits

- `bdf8cdf` through `7392693` - comparator policy, parity corrections, adapters, orchestration, HTTP/job wiring and production-mount characterization.
- `ce6243d` - closed typed public policy-error mapping and forged-message regression test.
- `716c97d` - exact stale Clareza suppression pruning.

ARCH-03 as a whole remains open for feature-by-feature payload normalization and Front+Back migration. This comparator slice does not claim deployment, observation, or operational readiness.
