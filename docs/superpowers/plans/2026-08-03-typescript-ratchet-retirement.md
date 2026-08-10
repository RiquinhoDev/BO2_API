# TypeScript Ratchet Retirement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the empty TypeScript debt ratchet with the direct strict compiler gate and delete every ratchet-only artifact.

**Architecture:** Preserve `npm run types:check` as the stable no-emit compiler entry point. Let `npm run build` remain the sole emitting compiler invocation, remove the duplicate prebuild pass, and retain a small tooling contract test that prevents debt-tolerating infrastructure from returning.

**Tech Stack:** TypeScript 5.9, Jest 29, npm scripts, PowerShell-safe `.cmd` executables.

## Global Constraints

- Do not change runtime source files or dependency versions.
- Do not weaken `strict`, `noEmitOnError`, lint, Jest, or build.
- Do not install packages or use network, ActiveCampaign, external APIs, or real Mongo.
- Stop if direct `tsc --noEmit --pretty false` reports any diagnostic.
- Preserve `npm run types:check` as a public developer/CI command.

---

### Task 1: Replace and delete the empty ratchet

**Files:**
- Create: `tests/tooling/typescriptCompilerGate.test.ts`
- Modify: `package.json`
- Delete: `scripts/typecheck-ratchet.js`
- Delete: `config/typescript-ratchet-baseline.json`
- Delete: `tests/tooling/typecheckRatchet.test.ts`

**Interfaces:**
- Consumes: repository `tsconfig.json` and local `typescript` binary.
- Produces: `npm run types:check` as direct `tsc --noEmit --pretty false`; `npm run build` remains `tsc`.

- [x] **Step 1: Write the failing tooling contract test**

Create a Jest test that loads `package.json`, parses `tsconfig.json` through the TypeScript API, and asserts these hand-written invariants:

```ts
expect(packageJson.scripts['types:check']).toBe('tsc --noEmit --pretty false')
expect(packageJson.scripts).not.toHaveProperty('types:baseline:update')
expect(packageJson.scripts).not.toHaveProperty('prebuild')
expect(parsed.options.strict).toBe(true)
expect(parsed.options.noEmitOnError).toBe(true)
```

The break caught is reintroducing a debt-tolerating wrapper or disabling strict/no-emit-on-error compiler enforcement.

- [x] **Step 2: Run the test and verify RED**

Run:

```powershell
node_modules\.bin\jest.cmd --runInBand tests/tooling/typescriptCompilerGate.test.ts
```

Expected: FAIL because `types:check` still invokes `scripts/typecheck-ratchet.js`, `types:baseline:update` and `prebuild` still exist.

- [x] **Step 3: Apply the minimal tooling change**

In `package.json`, set:

```json
"types:check": "tsc --noEmit --pretty false"
```

Remove only `types:baseline:update` and `prebuild`. Delete the three ratchet-only files listed above. Do not change dependencies or `package-lock.json`.

- [x] **Step 4: Run focused GREEN and direct compiler proof**

Run:

```powershell
node_modules\.bin\jest.cmd --runInBand tests/tooling/typescriptCompilerGate.test.ts tests/tooling/registeredScripts.test.ts
npm.cmd run types:check
```

Expected: 2 suites pass and direct TypeScript compilation exits 0 with no diagnostics.

- [x] **Step 5: Prove the deleted ratchet has no active references**

Run:

```powershell
rg -n "typecheck-ratchet|typescript-ratchet-baseline|types:baseline:update" --glob '!docs/**' --glob '!node_modules/**' --glob '!dist/**' .
```

Expected: no matches and exit code 1 from `rg`.

- [x] **Step 6: Commit the tooling deletion**

Stage exactly the Task 1 files and commit:

```text
chore: retire typescript debt ratchet
```

### Task 2: Close TOOL-01 with current evidence

**Files:**
- Modify: `docs/HARDENING-WORKPLAN.md`
- Modify: `API_AUDIT.md`
- Modify: `docs/superpowers/plans/2026-08-03-typescript-ratchet-retirement.md`

**Interfaces:**
- Consumes: Task 1 compiler/test evidence and final gate outputs.
- Produces: an honest checked TOOL-01 criterion with `86/104` (`82.7%`) mechanical progress.

- [x] **Step 1: Update active documentation**

Mark the TOOL-01 checkbox complete only after Task 1 GREEN. Record that `strict`, `noEmitOnError`, direct no-emit compilation, and emitting build are the remaining authorities. Update the active `API_AUDIT.md` TOOL-01 row so it no longer describes the removed ratchet or an already-removed false-green build bypass.

- [x] **Step 2: Recalculate the workplan**

Count Markdown checkboxes in `docs/HARDENING-WORKPLAN.md` and require:

```text
checked=86 open=18 total=104 percent=82.7
```

- [x] **Step 3: Run final offline gates**

Run serially:

```powershell
npm.cmd run lint
npm.cmd run types:check
$env:MONGOMS_RUNTIME_DOWNLOAD='false'; npm.cmd test -- --ci --runInBand
npm.cmd run build
git diff --check
```

Expected: every command exits 0; Jest uses only local cached MongoMemoryServer assets and no external APIs.

- [x] **Step 4: Commit documentation**

Stage exactly the Task 2 documentation files and commit:

```text
docs: close typescript compiler gate
```

- [x] **Step 5: Final hygiene**

Require a clean tracked worktree, no push, no external-system access, and `HEAD` ahead of `origin/remake` only by the local commits created in this block.
