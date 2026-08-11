# Task 5 - Clareza Comparador HTTP and scheduled refresh

## Delivered

- Added exactly `GET /api/clareza/comparador` and `POST /api/clareza/comparador/refresh`.
- GET preserves external comparator documents without a success envelope. Search uses `Cache-Control: public, max-age=600`; comparison uses `public, max-age=3600`.
- Refresh reuses `isClarezaRefreshAuthorized`; specific symbols return the domain result and full refresh returns `{ success: true, total, errors }`.
- Policy validation retains `{ error }` 400 responses. `IntegrationUnavailableError` reaches the central 503 boundary and unexpected errors use SEC-10.
- The scheduled comparator full refresh runs after the existing Clareza products, is best-effort, and logs only aggregate `total` and `errors` metadata.
- Route, manifest, security and response catalogs record exactly the two new identities. The GET is explicitly public; refresh remains authenticated.

## Evidence ledger

- RED: `createClarezaJob` was absent; the job test failed with TS2614.
- Mutation RED: replacing the comparator scheduled dependency with earnings made the job suite fail 2/2; the invocation was restored before GREEN.
- GREEN: Comparator/router/job focused suite: 5 suites, 29 tests passed.
- Catalogs: response contract check reported 441 reviewed decisions; response catalog 22/22, default deny 6/6 and route catalog 7/7 passed.
- Static gates: scoped ESLint exited 0 (reported only pre-existing unpruned suppressions); `npm.cmd run types:check` and `git diff --check` exited 0.
- Review RED: changing the comparator GET catalog entry to authenticated made the real application mount return 401; replacing the Raio-X job dependency with Top10 broke the asserted continuation order.
- Review GREEN: real `createApp` plus `runtime/registerRoutes` production-mount contract and the strengthened job suite passed 2 suites / 5 tests. The mount covers public GET success/400, default-deny 401, Clareza-token 403, central 503, and SEC-10 500.

## Offline boundary

All route tests used the local offline loopback marker and injected comparator runtime/auth seams. No FMP, Redis, MongoDB, or external HTTP integration was invoked.

The production-mount test imports the full route tree and therefore retains its existing model/Guru and Mongoose-index import warnings; the test makes no egress calls.