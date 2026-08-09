# ActiveCampaign service dissolution

## Objective

Replace the 1,010-line `activeCampaignService.ts` monolith with cohesive modules
of at most 500 physical lines while preserving its singleton import, public
methods, request ordering, return values, failure behavior and integration
fail-closed boundary.

## Architecture

### Transport

`activeCampaignTransport.ts` owns runtime configuration, Axios client caching,
request throttling, retry classification/delay, error formatting and connection
probing. It is the only owner of request timing state.

### Contacts

`activeCampaignContacts.service.ts` owns contact lookup/listing, create/update,
find-or-create, cached contact ID and custom-field reads/writes. It depends on a
narrow transport port and a user metadata repository.

### Tags

`activeCampaignTags.service.ts` owns tag lookup/creation, contact-tag lookup,
association/removal, batch removal and expanded tag reads. It composes the
contacts port and transport port without importing Mongo models.

### Product coordination

`activeCampaignProductTags.service.ts` owns User/UserProduct/Product reads and
local tag-state persistence. It receives contact/tag ports. The façade provides
late-bound delegates so spies and overrides on the public singleton continue to
intercept calls exactly as before.

### Compatibility façade

`activeCampaignService.ts` constructs the modules and delegates every existing
public method. Named/default singleton exports and the public `client` and
`retryRequest` surfaces remain unchanged.

## Behavioral invariants

- Unconfigured ActiveCampaign fails before Axios or Mongo work.
- Rate counter, one-minute reset, 200ms inter-request delay, 280 request limit,
  three retries and 2s retry delay remain unchanged.
- Retry remains limited to missing status, 5xx and `ECONNABORTED`.
- Pagination remains limit 100 with offset increments until a short page.
- Tag association remains idempotent; removal keeps its optional verification
  behavior and treats absent tag/link as already removed.
- Product operations keep ActiveCampaign-before-local-write ordering and all
  existing boolean/error contracts.
- No method gains a new kill switch, authorization rule or business default.

## Verification

- Characterize transport retry/rate behavior with injected clock/sleep/Axios.
- Characterize contacts/tags using fake transport responses, including paging,
  idempotent association, absent removal and custom-field no-create behavior.
- Characterize product coordination write ordering and local persistence.
- Prove semantic RED mutations and restore GREEN for each boundary.
- Run the complete offline suite, lint, strict TypeScript, build, size ratchet,
  diff/lockfile checks and negative scans for forbidden type escapes.

## Stop conditions

Stop if an extraction requires changing public responses, retry/rate semantics,
the order of an external write versus Mongo persistence, or any business rule.
Never contact ActiveCampaign or production data.
