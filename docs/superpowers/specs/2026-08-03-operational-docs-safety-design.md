# Operational Documentation Safety Design

**Date:** 2026-08-03

**Status:** Approved by the standing `remake` cleanup mandate and the explicit instruction to continue the proposed documentation-safety mission.

## Goal

Remove stale operational instructions that can mutate Git history, production MongoDB, or external integrations while preserving a concise map to the live tag-monitoring implementation and its offline verification surfaces.

## Evidence

- `docs/TAG_MONITORING_BACKEND_DOCUMENTATION.md` is a 1,727-line mixed design/runbook document. Its validation and troubleshooting sections contain direct Mongo shell reads and a `createIndex` write despite a warning that database verification is outside the document.
- The same document tells an operator to change ActiveCampaign state manually and embeds many local API commands whose assumptions are not continuously checked.
- `docs/HANDOFF_SWEEP_CODIGO_MORTO.md` is a dated, completed handoff. It still instructs readers to run `git fetch && git reset --hard origin/remake`, use package-fetching `npx`, and follow ownership/process rules superseded by the current hardening workplan.
- The tag-monitoring runtime remains live through its models, services, controllers, routes, scheduler, and `WeeklyTagSnapshot` job. The documentation entrypoint therefore needs a safe reference, not total removal.
- No repository document links to the dead-code handoff. `docs/README.md` is the only current inbound link to the tag-monitoring backend document.

## Selected Approach

1. Replace the mixed 1,727-line tag-monitoring document in place with a short current reference. Preserve its stable path, describe only verified code entrypoints and safety boundaries, and direct readers to offline tests and the route catalog. Do not include executable Mongo, ActiveCampaign, deployment, seed, `curl`, or production mutation commands.
2. Delete `docs/HANDOFF_SWEEP_CODIGO_MORTO.md`. Its useful principle—prove zero live consumers before deletion—already exists in `docs/HARDENING-WORKPLAN.md`; retaining a second stale process authority creates risk without adding a live interface.
3. Update `docs/README.md` and the hardening workplan with exact, scoped evidence. The negative proof must name the active documentation set and the exact forbidden patterns; it must not claim the whole historical archive is free of old commands.

## Safety Boundaries

- Do not run any command copied from the documents being changed.
- Do not use network access, install packages, call ActiveCampaign or another real API, connect to MongoDB, seed data, deploy, or push.
- Do not modify runtime source, tests, route contracts, dependency metadata, or historical files under `docs/archive/`.
- Keep `docs/TAG_MONITORING_BACKEND_DOCUMENTATION.md` as the stable reference path.
- Treat `docs/superpowers/specs/` and `docs/superpowers/plans/` as historical engineering records, not active operator runbooks, when scoping negative searches.

## Verification

- Static searches show zero `db.*`, `reset --hard`, `git fetch`, `curl`, `npx`, personal Windows paths, seed commands, and manual ActiveCampaign mutation instructions in the rewritten tag reference and documentation index; historical plans, specs, and archives are records excluded from this current-document claim.
- The deleted handoff no longer exists. A scoped active-document search found zero live Markdown links to it; the workplan and historical plans/specs are explicit records excluded from that link claim.
- Every path named by the concise tag reference exists, and the scheduler contains the named-job dispatch branch; matching CronJobConfig provisioning, enabled state, expression/timezone, and runtime registration remain unverified.
- Markdown links in the touched current documents resolve.
- `git diff --check`, lint, TypeScript ratchet, offline Jest with `MONGOMS_RUNTIME_DOWNLOAD=false`, and build pass on the final tree.
- Independent task and whole-range reviews find no Critical or Important issue.
