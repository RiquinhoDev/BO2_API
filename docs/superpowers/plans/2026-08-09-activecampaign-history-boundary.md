# ActiveCampaign communication history boundary

**Date:** 2026-08-09
**Branch:** `remake`
**Scope:** behavior-preserving extraction of the read-only communication-history surface.

## Live contracts preserved

- `GET /api/activecampaign/communication-history`
- `GET /api/activecampaign/history/stats`
- `GET /api/communication-history` (application-level alias)
- Existing success envelopes, populated/unpopulated mapping, pagination, date filtering and public 500 fallbacks.
- History reasons remain a pure formatter and keep null-safe inactivity rendering.

## Deliberately preserved debt

This refactor does not silently change historical semantics:

- the list accepts `action` but does not apply it to the Mongo filter;
- the list reads `createdAt` and `tagApplied`, while statistics aggregate `timestamp`, `action` and `tagName`;
- an explicit `userId` overrides the ID resolved from `email`;
- pagination parsing/clamping and the migration of local 500 responses to SEC-10 remain separate work.

These mismatches require contract/product decisions and must not be repaired inside a move-only extraction.

## Target topology

- `activeCampaignHistoryList.controller.ts`: query, mapping and pagination only;
- `activeCampaignHistoryStats.controller.ts`: aggregation only;
- `activeCampaignHistoryReason.ts`: pure reason formatting;
- route modules import the owning boundary directly; no compatibility barrel is added.

## Verification

Characterization is RED/GREEN mutation-backed for `sentAt` fallback and the legacy `timestamp` pipeline. Focused tests cover the alias-facing handlers, filters, query chain, populated mapping, empty totals and stable empty-error fallbacks. Final acceptance requires lint, strict TypeScript, complete offline Jest, build, route catalog, production-boundary ratchet and clean diffs.