# ESLint Ratchet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a flat ESLint 10 gate that protects all clean code and ratchets 2904 existing violations without mass fixes.

**Architecture:** Apply the JavaScript and TypeScript recommended correctness rules to `src/**/*.ts`, add explicit security rules and global `no-console`, then use ESLint 10 native bulk suppressions keyed by file and rule. Existing debt is suppressed once; new violations fail, and the only exposed baseline command prunes resolved suppressions.

**Tech Stack:** ESLint 10.7, @eslint/js 10, @typescript-eslint 8.64, globals 17.7, Jest 29.

## Global Constraints

- Never use `--pass-on-unpruned-suppressions` in scripts, CI, documentation, or commands.
- Do not autofix or migrate existing lint debt.
- Keep `tsc || exit 0` and `noEmitOnError:false` unchanged.
- Keep `@typescript-eslint/no-unused-vars` and the four smaller migration rules enabled and suppressed.
- Disable only `@typescript-eslint/no-explicit-any`: 1965 violations in 183 files.
- Reevaluate `no-explicit-any` when TypeScript `strict` starts rolling out in waves.
- Everything remains offline.

---

### Task 1: Characterize the lint boundary

**Files:**
- Create: `tests/tooling/eslintRatchet.test.ts`

**Interfaces:**
- Consumes: ESLint programmatic API and the future root flat config/suppressions.
- Produces: regression tests for clean files, dirty-file count increases, security rules, unused variables, and the strict trigger.

- [ ] **Step 1: Write failing tests**

Create tests that lint text under a clean synthetic `src` path, lint the current `src/controllers/users.controller.ts` plus one extra console call, lint `eval`/`new Function`, lint a new unused variable, and lint an explicit `any`.

- [ ] **Step 2: Run tests to verify RED**

Run: `npx jest --ci --runInBand tests/tooling/eslintRatchet.test.ts`

Expected: FAIL because no `eslint.config.js` or `eslint-suppressions.json` exists.

### Task 2: Add the flat config and native baseline

**Files:**
- Create: `eslint.config.js`
- Create: `eslint-suppressions.json`
- Modify: `package.json`
- Modify: `API_AUDIT.md`

**Interfaces:**
- Consumes: ESLint dependencies from commit `088650f`.
- Produces: `npm run lint` and `npm run lint:baseline:prune`.

- [ ] **Step 1: Create minimal flat config**

Compose `@eslint/js` recommended and `@typescript-eslint` flat recommended, add Node globals, `no-console`, `no-eval`, `no-implied-eval`, `no-new-func`, `no-script-url`, and `no-debugger`. Disable only `no-explicit-any`, with a comment naming TypeScript `strict` rollout as the reactivation trigger.

- [ ] **Step 2: Wire package scripts**

Set `lint` to `eslint src --max-warnings=0`. Add `lint:baseline:prune` using `--prune-suppressions`; do not add any command capable of increasing the baseline.

- [ ] **Step 3: Generate the one-time baseline**

Run: `npx eslint src --suppress-all --max-warnings=0`

Expected suppression sum: 2904, including 2681 `no-console` and 115 `@typescript-eslint/no-unused-vars`.

- [ ] **Step 4: Document the trigger and measurements**

Record the 2904 baseline and the `no-explicit-any` 1965/183 decision in `API_AUDIT.md`.

### Task 3: Prove the ratchet and close Fase 1

**Files:**
- Test: `tests/tooling/eslintRatchet.test.ts`
- Verify: all files above

**Interfaces:**
- Consumes: flat config and native suppressions.
- Produces: evidence for the reviewer and the final Fase 1 gate.

- [ ] **Step 1: Run tests GREEN**

Run: `npx jest --ci --runInBand tests/tooling/eslintRatchet.test.ts`

Expected: all tests pass.

- [ ] **Step 2: Run the two negative probes**

Lint a clean synthetic path containing one `console.log`, then lint `users.controller.ts` with one extra `console.log`.

Expected: the clean file reports one `no-console`; the dirty file exceeds its stored count and therefore exposes all `no-console` violations for that file.

- [ ] **Step 3: Run full verification**

Run:
- `npm run lint`
- `npm run types:check`
- `npx jest --ci --runInBand`
- `npm run build`
- repository scan proving the forbidden suppressions flag is absent

Expected: all commands exit 0; Jest has no failures; TypeScript remains 194/45; build keeps `tsc || exit 0`.

- [ ] **Step 4: Commit and push**

Commit subject: `build(lint): add native eslint ratchet`

Commit body must record 2904 suppressions, `no-explicit-any` 1965/183, and the `strict` reactivation trigger.
