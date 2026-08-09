# ActiveCampaign Course Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the Clareza/OGI dashboards and real dry-run previews from the 1,413-line ActiveCampaign controller without changing routes, response contracts, database reads, or external-write semantics.

**Architecture:** Move the five course-specific functions into one focused controller boundary. Keep models and `decisionEngine` dependencies exactly as today, retain both route aliases, and use characterization tests to prove behavior before and after the move. This slice does not fix route ordering, random dashboard placeholders, legacy TagRule duplication, or mutating operations.

**Tech Stack:** TypeScript, Express 5, Mongoose, Jest 29, Supertest.

## Global Constraints

- Work only on branch `remake`.
- Run fully offline with `MONGOMS_RUNTIME_DOWNLOAD=false`; never call real integrations or production databases.
- Preserve `evaluateAllUsersOfProduct(productId, true)` for both previews.
- Preserve both `/api/courses/*` and `/api/activecampaign/courses/*` aliases.
- Do not touch `testCron`, product-tag V2 handlers, `AC_TAG_APPLY_ENABLED`, route ordering, or dashboard placeholder semantics.
- Add no `any`, type-silencing cast, suppression, non-null assertion, or direct environment read.
- One lowercase Conventional Commit; push only to `origin/remake` after the full gate.

---

### Task 1: Characterize the course boundary

**Files:**
- Modify: `tests/controllers/courseEvaluationPreview.controller.test.ts`
- Create: `tests/controllers/courseStudents.controller.test.ts`

**Interfaces:**
- Consumes: current exports `getClarezaStudents`, `evaluateClarezaRules`, `getOGIStudents`, `evaluateOGIRules`.
- Produces: a regression net independent of the source file that owns those exports.

- [ ] **Step 1: Add failing sensitivity assertions for preview lookup and failures**

Extend the preview table with the exact expected lookup (`{ name: /^Clareza$/i }` or `{ code: /^OGI$/i }`), zero-result cases for missing course and no active products, and a 500 contract when the engine rejects.

- [ ] **Step 2: Prove RED by mutating the course lookup**

Temporarily change one expected lookup in production, run:

```powershell
npx jest --ci --runInBand tests/controllers/courseEvaluationPreview.controller.test.ts
```

Expected: the lookup assertion fails. Restore production immediately and confirm GREEN.

- [ ] **Step 3: Characterize dashboard contracts**

Cover missing-course warning/zero envelope for both courses and one populated response per course, including tag reconciliation, platform precedence, stats, sort/select calls, and existing placeholder fields under a fixed `Math.random` spy.

- [ ] **Step 4: Prove RED by mutating tag classification**

Temporarily alter the Clareza or OGI tag predicate and run the new focused suite. Expected: applied-tag assertions fail. Restore and confirm GREEN.

---

### Task 2: Extract the focused controller

**Files:**
- Create: `src/controllers/acTags/activeCampaignCourse.controller.ts`
- Modify: `src/controllers/acTags/activecampaign.controller.ts`
- Modify: `src/routes/course.routes.ts`
- Modify: `src/routes/ACroutes/activecampaign.routes.ts`
- Modify: `tests/security/activeCampaignDestructiveValidation.test.ts`
- Modify: `src/security/route-catalog.json` only if evidence line references move.

**Interfaces:**
- Produces unchanged named exports: `getClarezaStudents`, `evaluateClarezaRules`, `getOGIStudents`, `evaluateOGIRules`.
- Keeps private `previewCourseRules` co-located with the preview handlers.

- [ ] **Step 1: Move the characterized functions without rewriting them**

Move the handlers, private lookup/preview types, and `previewCourseRules` into the new file. Import only the models, decision engine, error helper, and Express types actually used.

- [ ] **Step 2: Rewire both route modules and tests**

Import the four handlers directly from `activeCampaignCourse.controller.ts`. Do not re-export them through the old controller, so dead imports cannot accumulate.

- [ ] **Step 3: Run focused verification**

```powershell
$env:MONGOMS_RUNTIME_DOWNLOAD='false'
npx jest --ci --runInBand tests/controllers/courseEvaluationPreview.controller.test.ts tests/controllers/courseStudents.controller.test.ts tests/security/activeCampaignDestructiveValidation.test.ts tests/security/routeCatalog.test.ts
npm run lint
npm run types:check
git diff --check
```

Expected: all focused tests pass; lint/types/diff exit 0.

---

### Task 3: Verify and deliver

**Files:**
- Modify: `docs/HARDENING-WORKPLAN.md`

**Interfaces:**
- Records measured controller line reduction and remaining ARCH-02 debt without claiming the whole pillar closed.

- [ ] **Step 1: Audit the final boundary**

Run negative greps for old course exports in `activecampaign.controller.ts`, direct real-network additions, `any`, casts, suppressions, and lockfile changes.

- [ ] **Step 2: Run the complete offline gate**

```powershell
npm run lint:baseline:prune
npm run lint
npm run types:check
$env:MONGOMS_RUNTIME_DOWNLOAD='false'
npm test -- --runInBand
npm run build
git diff --check
```

- [ ] **Step 3: Commit and push**

```text
refactor(activecampaign): extract course boundary
```

Push only to `origin/remake` after the gate is green.
