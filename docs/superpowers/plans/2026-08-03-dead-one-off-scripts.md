# Dead One-off Scripts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all sixteen unregistered top-level programs from `src/scripts/` and add a regression guard that prevents unregistered operational scripts from accumulating again.

**Architecture:** Treat package commands as the executable registry for `src/scripts/**/*.ts`. A repository-level Jest test maps each source script to either its source path or compiled `dist` path in `package.json`; the sixteen current one-offs fail that policy and disappear, while the two registered maintenance programs remain. Documentation and the lint suppression baseline are updated in the same implementation commit.

**Tech Stack:** TypeScript 5.9, Jest 29 with ts-jest, Node.js `fs`/`path`, ESLint suppression baseline, PowerShell, Git.

## Global Constraints

- Work only on branch `remake`; do not reset, pull, merge, or push.
- Do not execute any removed program or contact MongoDB, Discord, Guru, Hotmart, ActiveCampaign, CursEduca, or another external service.
- Do not install dependencies or modify either lockfile.
- Preserve `src/scripts/maintenance/ensure-users-v2-indexes.ts` and `src/scripts/maintenance/backfill-ac-webhook-receipt-leases.ts` unchanged.
- Preserve root `scripts/`, runtime routes, scheduled jobs, maintenance commands, and the sibling Front repository.
- Stop deletion of a candidate if any static import, export-from, literal dynamic import, literal `require`, route mount, job registration, test import, or package command is discovered.
- Do not weaken Jest, lint, TypeScript, build, egress, or secret guards.
- Use `apply_patch` for file edits and deletions.
- Implementation ships as one auditable dead-code commit; no push is included.

---

### Task 1: Remove unregistered one-off scripts and enforce the boundary

**Files:**
- Create: `tests/tooling/registeredScripts.test.ts`
- Delete: `src/scripts/add-discord-id.ts`
- Delete: `src/scripts/add-discord-id-joao.ts`
- Delete: `src/scripts/check-student.ts`
- Delete: `src/scripts/clean-duplicate-classes.ts`
- Delete: `src/scripts/diagnose-classes.ts`
- Delete: `src/scripts/find-joao-turma.ts`
- Delete: `src/scripts/fix-status-inconsistencies.ts`
- Delete: `src/scripts/get-joao-class.ts`
- Delete: `src/scripts/investigate-classes.ts`
- Delete: `src/scripts/migrateWebhookSource.ts`
- Delete: `src/scripts/sync-status-from-userproducts.ts`
- Delete: `src/scripts/test-discord-assignrole.ts`
- Delete: `src/scripts/test-discord-inactivation.ts`
- Delete: `src/scripts/test-final-joao.ts`
- Delete: `src/scripts/test-inactivation-flow.ts`
- Delete: `src/scripts/test-joao-complete.ts`
- Modify: `eslint-suppressions.json`
- Modify: `docs/HARDENING-WORKPLAN.md`

**Interfaces:**
- Consumes: `package.json#scripts` as the authoritative registry for executable programs under `src/scripts/`.
- Produces: a generic repository policy requiring every future `src/scripts/**/*.ts` file to have a package command referring to either its source path or compiled `dist` path.

- [ ] **Step 1: Confirm the checkout and candidate set**

Run:

```powershell
git status -sb
Get-ChildItem src\scripts -File -Filter *.ts |
  Sort-Object Name |
  ForEach-Object { "{0}`t{1}" -f $_.Name, (Get-Content $_.FullName).Count }
```

Expected: branch `remake` is clean apart from this plan if it has not yet been committed; exactly sixteen top-level scripts are listed and their line counts total 1,789.

- [ ] **Step 2: Re-prove that no repository entrypoint consumes a candidate**

Run this read-only check:

```powershell
$candidates = @(
  'add-discord-id', 'add-discord-id-joao', 'check-student',
  'clean-duplicate-classes', 'diagnose-classes', 'find-joao-turma',
  'fix-status-inconsistencies', 'get-joao-class', 'investigate-classes',
  'migrateWebhookSource', 'sync-status-from-userproducts',
  'test-discord-assignrole', 'test-discord-inactivation',
  'test-final-joao', 'test-inactivation-flow', 'test-joao-complete'
)
foreach ($candidate in $candidates) {
  rg -n --glob '*.ts' --glob '*.json' --fixed-strings "src/scripts/$candidate" src tests scripts package.json
  rg -n --glob '*.ts' --glob '*.json' --fixed-strings "dist/scripts/$candidate" src tests scripts package.json
}
```

Expected: no matches. The live controller symbol named `migrateWebhookSource` is not a match because this proof searches the script path, not the shared symbol name. If a path match appears, stop and exclude that file until its consumer is understood.

- [ ] **Step 3: Add the durable registration-policy test**

Create `tests/tooling/registeredScripts.test.ts` with:

```ts
import fs from 'fs'
import path from 'path'

import packageJson from '../../package.json'

const repositoryRoot = path.resolve(__dirname, '../..')
const sourceScriptsRoot = path.join(repositoryRoot, 'src', 'scripts')

const toPosixPath = (value: string): string => value.replace(/\\/g, '/')

const listTypeScriptFiles = (directory: string): string[] =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolutePath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      return listTypeScriptFiles(absolutePath)
    }

    return entry.isFile() && entry.name.endsWith('.ts') ? [absolutePath] : []
  })

describe('operational script registry', () => {
  it('keeps every src/scripts program behind a package command', () => {
    const packageCommands = Object.values(packageJson.scripts).join('\n').replace(/\\/g, '/')

    const unregisteredScripts = listTypeScriptFiles(sourceScriptsRoot)
      .map(absolutePath => toPosixPath(path.relative(repositoryRoot, absolutePath)))
      .filter(sourcePath => {
        const compiledPath = sourcePath.replace(/^src\//, 'dist/').replace(/\.ts$/, '.js')
        return !packageCommands.includes(sourcePath) && !packageCommands.includes(compiledPath)
      })
      .sort()

    expect(unregisteredScripts).toEqual([])
  })
})
```

- [ ] **Step 4: Run the policy test and capture genuine RED**

Run:

```powershell
npx.cmd jest tests/tooling/registeredScripts.test.ts --runInBand
```

Expected: one failing test whose received array contains exactly the sixteen top-level candidates. Both `src/scripts/maintenance/*` files must be absent from the failure because their compiled paths are registered in `package.json`.

- [ ] **Step 5: Delete the sixteen candidates**

Use `apply_patch` with one `*** Delete File:` section for every file listed under **Files**. Do not delete `src/scripts/maintenance/` or any file under root `scripts/`.

- [ ] **Step 6: Prune only the orphaned lint suppressions**

Run:

```powershell
npm.cmd run lint:baseline:prune
git diff -- eslint-suppressions.json
```

Expected: the diff removes entries for the deleted scripts only. If unrelated suppressions change, restore those unrelated hunks with `apply_patch` before continuing.

- [ ] **Step 7: Run the policy test and capture GREEN**

Run:

```powershell
npx.cmd jest tests/tooling/registeredScripts.test.ts --runInBand
```

Expected: one suite and one test pass. For mutation proof, use `apply_patch`
to change the filter's `&&` to `||`; rerun the focused test and expect both
registered maintenance scripts in the failure. Restore `&&` with
`apply_patch`, rerun, and require one passing suite and test.

- [ ] **Step 8: Prove filesystem and reference cleanup**

Run:

```powershell
Get-ChildItem src\scripts -File -Filter *.ts
Get-ChildItem src\scripts\maintenance -File -Filter *.ts | Sort-Object Name
rg -n --glob '*.ts' --glob '*.json' 'src/scripts/(add-discord-id|add-discord-id-joao|check-student|clean-duplicate-classes|diagnose-classes|find-joao-turma|fix-status-inconsistencies|get-joao-class|investigate-classes|migrateWebhookSource|sync-status-from-userproducts|test-discord-assignrole|test-discord-inactivation|test-final-joao|test-inactivation-flow|test-joao-complete)' src tests scripts package.json
```

Expected: the top-level listing is empty; the maintenance listing contains exactly `backfill-ac-webhook-receipt-leases.ts` and `ensure-users-v2-indexes.ts`; the reference scan is empty.

- [ ] **Step 9: Run all offline gates**

Run serially:

```powershell
npm.cmd run lint
npm.cmd run types:check
npx.cmd jest --ci --runInBand
npm.cmd run build
```

Expected: all commands exit 0. Record exact suite/test counts and TypeScript ratchet counts. Existing non-failing warnings may be reported but must not be reclassified as failures or fixed outside scope.

- [ ] **Step 10: Update the operational workplan with measured evidence**

In `docs/HARDENING-WORKPLAN.md`:

1. remove `scripts/fix-status-inconsistencies.ts` and `scripts/sync-status-from-userproducts.ts` from the full-scan exceptions because those source programs no longer exist;
2. add a checked item under the dead-code sweep recording the sixteen deleted paths as one top-level-script family, 1,789 removed source lines, the permanent registration-policy test, unchanged maintenance scripts, lint suppression pruning, zero path references, and the exact fresh gate results from Step 9;
3. state explicitly that no removed program, production database, or external API was executed.

- [ ] **Step 11: Review the complete change**

Run:

```powershell
git diff --check
git diff --stat
git status --short
git diff -- tests/tooling/registeredScripts.test.ts eslint-suppressions.json docs/HARDENING-WORKPLAN.md
```

Expected: no whitespace errors; sixteen deleted source files; one focused test added; only their suppression entries removed; only the planned workplan sections changed; no lockfile, maintenance script, root `scripts/`, runtime, route, job, or Front change.

- [ ] **Step 12: Obtain an independent Luna audit**

Delegate a read-only review to an `executor_luna` subagent. Require it to inspect the actual diff, re-run or independently validate the path-reference proof, verify both maintenance commands and tests remain live, and report any High/Medium finding. Resolve findings and rerun affected gates before committing.

- [ ] **Step 13: Commit the implementation**

Stage only the planned files and commit:

```powershell
git add src/scripts tests/tooling/registeredScripts.test.ts eslint-suppressions.json docs/HARDENING-WORKPLAN.md
git commit -m "chore(scripts): remove dead one-offs" -m "Keep operational programs behind explicit package commands and remove stale personal, repair, and external-call entrypoints." -m "Co-Authored-By: Codex <codex@openai.com>"
```

Expected: the commit succeeds; `git status -sb` is clean and shows `remake` ahead of `origin/remake`. Do not push.
