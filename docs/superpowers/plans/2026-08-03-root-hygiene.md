# Root Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove obsolete root material and broken entrypoints, preserve live documentation, and establish npm as the single BO2_API package manager.

**Architecture:** Three independently reviewable commits separate documentation lifecycle, dead executable/configuration surfaces, and build-tool authority. No runtime feature behavior or dependency version changes are allowed.

**Tech Stack:** Markdown, npm package metadata, Nixpacks TOML, TypeScript/Jest/ESLint.

## Global Constraints

- Work only on branch `remake`.
- Do not install dependencies, use network access, execute operational scripts, or call real APIs/databases.
- Preserve `RENOVACAO_*.md`, live runtime code, dependency versions, and sibling Front files.
- Keep commits lowercase Conventional Commits and do not push.

---

### Task 1: Root documentation lifecycle

**Files:**
- Delete: `DEBUG_RUI_GUIDE.md`, `FINAL-SUMMARY.md`, `TEST_SINGLE_USER.md`, `VALIDACAO_OTIMIZACOES_FASE1.md`, `VALIDATION_REPORT_TAG_SYSTEM_V2.md`, `VERIFICATION-REPORT.md`
- Move: `SNAPSHOT_SYSTEM_GUIDE.md` -> `docs/SNAPSHOT_SYSTEM_GUIDE.md`
- Move: `STUDENTS_BY_PRIORITY_ENDPOINT.md` -> `docs/STUDENTS_BY_PRIORITY_ENDPOINT.md`
- Move: `TAG_MONITORING_BACKEND_DOCUMENTATION.md` -> `docs/TAG_MONITORING_BACKEND_DOCUMENTATION.md`
- Move: `TAG_MONITORING_SYSTEM_PLAN.md` -> `docs/archive/TAG_MONITORING_SYSTEM_PLAN.md`
- Create: `docs/README.md`

- [ ] Confirm every deleted document's named scripts/modules are absent or superseded.
- [ ] Delete the six proven-obsolete documents.
- [ ] Move the four live/historical documents and add explicit current/archive status notes without rewriting their history.
- [ ] Add a concise documentation index with active, reference, archive, plan, and spec sections.
- [ ] Run negative references, PII scan for deleted reports, `git diff --check`, and Markdown path checks.
- [ ] Commit as `docs: clean root documentation`.

### Task 2: Dead executable and package entrypoints

**Files:**
- Delete: `scratch-carteira-harness.ts`, `scratch-clareza-harness.ts`
- Modify: `package.json`

- [ ] Re-run the static package-command target audit and record the 35 missing direct targets plus two affected composites.
- [ ] Delete both unreferenced temporary harnesses without executing them.
- [ ] Remove the 35 direct commands and `diagnose:all`.
- [ ] Rewrite `validate:full` to `npm run build && npm run lint && npm test`.
- [ ] Prove every remaining direct `node`/`ts-node` target exists and every `npm run` reference resolves.
- [ ] Run registered-script tests, lint, TypeScript ratchet, and `git diff --check`.
- [ ] Commit as `chore(scripts): remove dead entrypoints`.

### Task 3: npm authority and package metadata

**Files:**
- Modify: `package.json`, `package-lock.json`, `nixpacks.toml`, `API_AUDIT.md`, `docs/HARDENING-WORKPLAN.md`, `docs/README.md`
- Delete: `yarn.lock`

- [ ] Set `name` to `bo2-api`, `main` to `dist/index.js`, `private` to `true`, and `packageManager` to the locally verified npm version.
- [ ] Synchronize only the lockfile root package name/metadata; do not change dependency versions.
- [ ] Change Nixpacks setup/install/build/start commands from Yarn to npm using `npm ci`, `npm run build`, and `npm start`.
- [ ] Remove `yarn.lock` and update current audit/workplan text to record npm as authoritative.
- [ ] Prove no active BO2_API build configuration uses Yarn; historical/sibling-Front plan commands are allowed.
- [ ] Run lint, TypeScript ratchet, full offline Jest, build, and `git diff --check`.
- [ ] Commit as `build: standardize on npm`.

### Task 4: Final review and workplan evidence

**Files:**
- Modify: `docs/HARDENING-WORKPLAN.md` only if measured evidence needs final correction.

- [ ] Request independent review of each commit and the full range.
- [ ] Fix and re-review every Critical or Important finding.
- [ ] Record exact deletion counts, command counts, preserved live docs, package-manager proof, and final offline gates.
- [ ] Re-run the full final gate on the final HEAD and verify a clean worktree.
