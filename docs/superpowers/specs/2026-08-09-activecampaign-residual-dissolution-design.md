# ActiveCampaign residual controller dissolution

## Goal

Delete `src/controllers/acTags/activecampaign.controller.ts` after moving every live handler into a domain owner smaller than 400 lines, without changing public routes, response contracts or external side-effect ordering.

## Boundaries

- `activeCampaignOps.controller.ts`: manual evaluation, execution-log listing and the legacy summary endpoint.
- `activeCampaignLegacyTagRules.controller.ts`: the four legacy CRUD handlers used by both `/api/tag-rules` and `/api/activecampaign/tag-rules`.
- `activeCampaignProductTags.controller.ts`: the five V2 product-tag handlers.
- Route registration imports each owner directly. No compatibility barrel or re-export is allowed.

## Preserved behavior and explicit debt

- `testCron` still invokes `decisionEngine.evaluateUserProduct` without dry-run and records `CronExecutionLog` in the same order. This extraction does not invent a gate; activation policy is a separate security decision.
- Both tag-rule route families remain live. The `/api/tag-rules` handlers registered by `routes/index.ts` shadow the later app-level aliases, while `/api/activecampaign/tag-rules` remains reachable. Deletion requires traffic/consumer evidence and is not part of this move.
- Product-tag V2 keeps its current ActiveCampaign calls, UserProduct persistence, partial-sync behavior and public envelopes. No real integration is invoked during tests.
- Existing local 500 responses remain in the production-boundary ratchet; SEC-10 migration is separate.

## Verification

Characterization-first tests protect operation counters/log payloads, last-20 ordering, legacy CRUD envelopes, V2 tag persistence and partial synchronization. Mutation RED must prove at least the manual-operation counters/log contract and one V2 persistence contract. Acceptance: no imports or file at the old path, all units under 400 lines, route catalog 439/439, lint, strict TypeScript, full offline Jest and build green.