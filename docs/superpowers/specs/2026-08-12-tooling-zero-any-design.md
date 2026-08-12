# Tooling zero-any design

## Goal

Remove all 272 remaining `@typescript-eslint/no-explicit-any` suppressions from
the 80 affected source files and make the suppression baseline fail closed at
zero.

## Constraints

- Preserve runtime behavior, HTTP contracts, write ordering, and error handling.
- Use exact DTOs, inferred library/model types, or `unknown` with explicit
  narrowing.
- Do not add `as any`, inline disables, `ts-ignore`, broad casts, empty catches,
  or weaker tests.
- Eject a site only when a correct type requires a product or external-contract
  decision; an ejection prevents a 100% claim.

## Execution

1. Change the tooling ratchet to require zero explicit-any suppressions and
   capture the genuine RED.
2. Migrate high-density files first, grouped by shared DTO boundaries.
3. Migrate the remaining tail using the same proven patterns.
4. Prune only suppressions made obsolete by source changes.
5. Recalculate Tooling and macro percentages from the factual baseline.

## Verification

- Suppression inventory: explicit-any = 0.
- Negative diff scan: no new escape casts or disables.
- Normal ESLint, TypeScript check, and build pass.
- Focused tests cover every changed behavioral boundary.
- Ratchet mutation proves reintroducing an explicit-any suppression fails.
- Commit remains isolated and is not pushed automatically.
