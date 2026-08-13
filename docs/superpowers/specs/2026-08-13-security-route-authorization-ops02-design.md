# Security route authorization and OPS-02 design

## Goal

Take **Security & routes** from the current 70% code baseline to a defensible
100% state by closing the two remaining workplan items:

1. a fail-closed role matrix for every authenticated route; and
2. a transversal OPS-02 policy for every route that writes or is destructive.

This is an incremental hardening change, not an authentication rewrite. The
existing JWT authority, `authenticate`, route catalog, strict destructive-input
validation, central error boundary, and provider-specific kill switches remain
the sources of truth they are today.

## Approved role model

The existing roles are retained without migration:

- `MODERATOR` is read-only.
- `ADMIN` can read and perform normal internal writes.
- `SUPER_ADMIN` can do everything `ADMIN` can do plus high-impact operations.

High-impact operations are fail-closed and include:

- writes to external providers such as ActiveCampaign, Guru, Discord, Hotmart,
  or CursEduca;
- destructive operations unless the OPS-02 decision explicitly proves that the
  operation is safely reversible;
- bulk destructive operations;
- account/role/permission administration;
- security-sensitive configuration, kill switches, and near-irreversible
  maintenance actions.

HTTP method alone never determines privilege. Some current `GET` routes write;
the factual `writes`/`destructive` route metadata and OPS-02 decision determine
the authorization tier.

## Authority boundaries

### Route catalog remains factual

`src/security/route-catalog.json` continues to describe route facts such as
identity, access class, consumer, `writes`, and `destructive`. Roles must not be
added to that catalog.

The existing default-deny authentication middleware remains responsible for
public/signature/authenticated separation.

### Authorization policy is separate

Create one authorization authority keyed by canonical route identity:

`METHOD + normalized route template`.

The policy resolver produces exactly one tier for each authenticated route:

- `read` -> `MODERATOR | ADMIN | SUPER_ADMIN`;
- `internal-write` -> `ADMIN | SUPER_ADMIN`;
- `super-admin` -> `SUPER_ADMIN`.

The default classification is deterministic and fail-closed:

- authenticated route with `writes:false` -> `read`;
- authenticated route with `writes:true` -> `internal-write`;
- routes marked high-impact by OPS-02 -> `super-admin`.

A write route cannot be downgraded to `read`. A high-impact route cannot be
implicitly downgraded to `internal-write`.

The role-checking semantics must have one implementation. Extract a small pure
role-check helper from the current `authorize(...)` behavior; the existing
`authorize(...)` middleware and the new central route-authorization middleware
both call that helper. This prevents two subtly different role authorities.

## Runtime route matching

Authorization runs centrally after authentication and before the productive
handler. It resolves the incoming method/path to one and only one canonical
catalog route template.

The matcher must:

- support parameterized templates such as `/api/users/:id`;
- normalize trailing slashes and method case consistently with the catalog;
- reject ambiguous matches in tests;
- preserve `public` and `signature` routes unchanged;
- return the normal not-found outcome for a request that matches no cataloged
  route identity, so unknown paths do not become authorization errors;
- fail closed for a cataloged authenticated route that has no authorization
  decision.

A newly added productive route therefore cannot become authorized merely by
being placed under an authenticated root: exact-membership tests must add it to
the catalog/policy before the gate can pass.

No route handler is modified merely to add role logic.

## Authorization responses

Preserve current authentication semantics:

- missing/invalid authentication remains `401` at the existing authentication
  boundary;
- authenticated but insufficient role returns stable `403` without technical
  detail;
- a request matching no catalog route preserves the normal `404` path;
- a cataloged authenticated route with missing/ambiguous authorization policy
  is a fail-closed security configuration error and must never execute the
  handler.

No request body, token, provider payload, or raw error detail is returned or
logged by the authorization layer.

## Audit logging

Role enforcement adds structured security audit events through the existing
canonical logger. It does not introduce a second logging stack or a new audit
collection in this slice.

Log only safe metadata:

- actor ID;
- actor role;
- HTTP method;
- canonical route template;
- authorization tier;
- outcome (`allowed-write`, `allowed-super-admin`, or `denied`);
- correlation/request ID when available.

Do not log request bodies, tokens, email addresses, provider responses, or
secrets.

Read-only allowed requests do not require an audit event; denied requests and
all allowed writes do. This keeps the audit surface useful without turning
normal reads into noise.

## OPS-02 transversal policy

Create a separate exact inventory derived from every catalog route with
`writes:true` or `destructive:true`. Every such identity must have one explicit
OPS-02 decision.

Each decision records:

- route identity;
- scope: internal database, external provider, or mixed;
- provider when applicable;
- authorization tier;
- destructive/bulk classification;
- maximum affected-item cap or a documented bounded single-item decision;
- idempotency strategy or explicit proof that replay is safe/no-op;
- kill switch where an external/high-impact write requires one;
- dry-run/preview availability where meaningful;
- reversibility/compensation behavior;
- concise reason for any protection that is not applicable.

The policy requires a decision, not the same mechanism everywhere. For example,
a single internal metadata update does not need an artificial kill switch, but
it still needs an explicit bounded/replay decision.

## Provider writes

Provider writes are `SUPER_ADMIN` by default and must have a fail-closed
provider-write decision before execution. Reuse existing feature gates and
preview/dry-run mechanisms where they already exist; do not create duplicate
flags.

Where a provider write lacks a suitable kill switch, cap, idempotency rule, or
preview and the operation is high-impact, implementation must add the smallest
shared protection that preserves current ordering and error semantics.

No real provider call is permitted during implementation or verification.

## Internal destructive writes

Internal destructive operations are `SUPER_ADMIN` by default. An operation may
be classified as `internal-write` only when the OPS-02 entry proves that it is
safely reversible or compensating and bounded.

Bulk operations require an explicit cap even when internal. Existing strict
input validation remains authoritative and is not duplicated by OPS-02.

## Front-end gating

The backend policy is the security authority. Front-end gating is a paired UX
requirement, not a substitute for backend enforcement.

The Front must consume the same three effective capabilities: read-only,
internal-write, and super-admin. Controls unavailable to the current role should
be hidden or disabled, but direct HTTP calls must still be rejected by the
backend.

Backend code-complete can be demonstrated independently, but **Security & routes
must not be marked 100% in the macro table until the paired Front gating is also
verified**. Any Front route/contract regeneration remains under the established
reviewer process when required.

## Testing strategy

### Authorization ratchet

Add an exact-membership test derived from the route catalog that proves:

- every authenticated route resolves to exactly one authorization tier;
- no public/signature route is accidentally role-gated;
- no write route resolves to `read`;
- every high-impact OPS-02 identity resolves to `super-admin`;
- a newly added authenticated route without policy coverage fails the test.

### Runtime role tests

Representative HTTP tests must prove:

- `MODERATOR` can read;
- `MODERATOR` cannot perform internal writes;
- `ADMIN` can perform a normal internal write;
- `ADMIN` cannot execute a provider/high-impact write;
- `SUPER_ADMIN` can execute the same high-impact boundary with the productive
  dependency mocked;
- denied requests never invoke the handler/dependency;
- audit metadata is safe and contains no body/token/PII.

### OPS-02 ratchet

Add an exact inventory test that fails when:

- a `writes:true` or `destructive:true` catalog route lacks a decision;
- a provider write lacks provider identification or required kill-switch
  disposition;
- a bulk operation has no cap decision;
- a destructive operation has neither super-admin classification nor explicit
  reversible justification;
- a newly introduced write route bypasses the inventory.

Mutation tests must prove at least the coverage, role downgrade, provider-write,
and cap guards fail closed.

## Delivery waves

1. **Inventory and RED ratchets**
   - Build canonical authorization/OPS-02 inventories from the current catalog.
   - Add exact-membership and mutation tests before runtime enforcement.

2. **Central role enforcement**
   - Add route-template resolution and central role middleware.
   - Close read vs internal-write first, then high-impact `SUPER_ADMIN`.
   - Preserve existing authentication and handler behavior.

3. **OPS-02 protections**
   - Review every current write/destructive identity.
   - Reuse existing caps, kill switches, dry-runs, idempotency, and compensation.
   - Add only missing shared protections, provider/high-impact first.

4. **Paired Front gating and closeout**
   - Align visible actions to the approved roles without weakening backend
     enforcement.
   - Run focused tests per wave, then TypeScript/lint/build and the full offline
     Jest gate after the security source stabilizes.

## Constraints

- Work only on branch `remake`; never touch `main`.
- Everything remains offline. No real Mongo production target or provider call.
- Preserve runtime HTTP success contracts, write ordering, compensation, and
  current error handling unless the approved authorization policy intentionally
  changes access from allowed to `403`.
- No `as any`, lint disables, `ts-ignore`, suppressions, or weaker tests as
  escape hatches.
- Reuse existing auth, logging, validation, kill-switch, and dry-run authorities.
- Do not manually regenerate reviewer-owned route manifests/contracts unless the
  established repo process explicitly assigns that step.
- Ambiguous destructive semantics discovered during the inventory are surfaced
  for decision instead of guessed.

## Definition of done

Backend security is code-complete only when:

- every authenticated route has exactly one role decision;
- `MODERATOR` is proven read-only;
- normal internal writes require at least `ADMIN`;
- external/high-impact writes require `SUPER_ADMIN`;
- every current write/destructive route has one OPS-02 decision;
- provider/high-impact writes have the required bounded/replay/kill-switch
  disposition;
- denied access is fail-closed and handlers are not invoked;
- structured security audit events are redacted and centralized;
- authorization and OPS-02 mutation ratchets are GREEN after restoration;
- focused tests, strict TypeScript, lint, build, and the final offline Jest gate
  are GREEN;
- the workplan is updated from factual evidence, not projected completion.

The macro **Security & routes = 100%** additionally requires verified paired
Front gating. Operational deployment/provisioning evidence remains distinct
from code-complete security and is not fabricated by offline tests.
