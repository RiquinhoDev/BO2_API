# TypeScript Ratchet Retirement Design

## Goal

Remove the now-empty TypeScript debt ratchet without weakening the compiler gate or changing runtime behavior.

## Evidence

- `tsconfig.json` already enables `strict` and `noEmitOnError`.
- `config/typescript-ratchet-baseline.json` contains zero tracked errors and zero dirty files.
- A fresh `tsc --noEmit --pretty false` exits successfully on `remake`.
- The ratchet implementation is only consumed by package scripts and its dedicated test.
- Docker and Nixpacks build through `npm run build`, whose implementation remains `tsc`.

## Design

Keep `npm run types:check` as the stable developer/CI interface, but make it invoke the compiler directly with `tsc --noEmit --pretty false`. Remove the redundant `prebuild` hook because `npm run build` already runs `tsc` with `noEmitOnError`; remove `types:baseline:update` because zero debt leaves nothing legitimate to regenerate.

Delete the ratchet-only implementation, empty baseline, and ratchet-specific unit test:

- `scripts/typecheck-ratchet.js`
- `config/typescript-ratchet-baseline.json`
- `tests/tooling/typecheckRatchet.test.ts`

No replacement production abstraction is introduced. The behavioral proof is the direct compiler gate itself, supplemented by existing registered-script coverage and negative reference checks. This is a tooling deletion/refactor, so there is no new runtime behavior requiring a RED application test.

## Documentation

Mark TOOL-01 complete only after the direct compiler, focused tooling tests, lint, full offline Jest, and build pass on the final HEAD. Update stale references that still describe the ratchet as active; retain historical evidence where it is clearly labelled as history.

## Safety and Stop Conditions

- Stop if direct `tsc --noEmit --pretty false` reports any diagnostic.
- Stop if any active non-documentation consumer depends on the ratchet implementation or baseline-update command.
- Do not install packages, access the network, run external APIs, ActiveCampaign, or real Mongo.
- Do not weaken `strict`, `noEmitOnError`, lint, tests, or build to obtain green gates.

## Expected Result

The workplan moves from `85/104` to `86/104` (`82.7%`). The repository has one compiler authority instead of a zero-debt wrapper around that compiler.
