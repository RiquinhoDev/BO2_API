# Root Hygiene Design

**Date:** 2026-08-03

**Status:** Approved by the standing `remake` cleanup mandate and the open DOC-02/TOOL-03 workplan items.

## Goal

Remove obsolete root documentation, dead local harnesses, and broken package entrypoints while preserving operational documentation tied to live code. Make npm the single package-manager authority and correct package metadata without installing dependencies or contacting external services.

## Evidence

- Eleven tracked root Markdown files have no inbound repository references.
- Six are obsolete reports or guides whose scripts/modules no longer exist; together they contain 1,604 lines and include production instructions or personal email addresses.
- Four describe live systems and must be moved, not deleted: snapshots, students-by-priority, and tag monitoring.
- `scratch-carteira-harness.ts` and `scratch-clareza-harness.ts` are tracked, unreferenced temporary harnesses; one explicitly calls the real FMP API.
- Thirty-five `package.json` commands point to missing `.ts` files. `diagnose:all` is consequently broken; `validate:full` is useful but calls the missing `check-ac-sync` command.
- Docker and the production command use npm. Nixpacks is the only active Yarn configuration.

## Selected Approach

Use three atomic cuts:

1. Delete only the six documents proven obsolete. Move the four live documents under `docs/`, archive the historical tag-monitoring plan, add status warnings where commands or claims are stale, and create `docs/README.md` as the documentation entrypoint. Keep all `RENOVACAO_*.md` files in place because the workplan explicitly protects them.
2. Delete the two temporary harnesses and remove all 35 commands whose direct targets do not exist. Remove `diagnose:all`; retain `validate:full` but redefine it as the valid offline sequence `build`, `lint`, and `test`.
3. Make npm authoritative: migrate `nixpacks.toml` to npm, remove `yarn.lock`, set factual package metadata (`bo2-api`, `dist/index.js`, private package, pinned package-manager field), synchronize the lockfile root metadata, and update current audit/workplan statements.

## Safety Boundaries

- Never execute deleted scripts or harnesses.
- Never call MongoDB, ActiveCampaign, FMP, Discord, Guru, Hotmart, CursEduca, or any external network.
- Do not install or update dependencies.
- Preserve live runtime code and package dependency versions.
- Historical superpowers plans may retain Yarn commands for the sibling Front; they are not current BO2_API build configuration.
- No push.

## Verification

- Static target-existence audit reports zero package commands pointing to missing script files.
- Negative searches prove the deleted harnesses/docs and stale package commands are absent.
- Nixpacks, Docker, and package metadata all select npm.
- `git diff --check`, lint, TypeScript ratchet, Jest with `MONGOMS_RUNTIME_DOWNLOAD=false`, and build pass.
- Independent review checks each commit and the whole range.
