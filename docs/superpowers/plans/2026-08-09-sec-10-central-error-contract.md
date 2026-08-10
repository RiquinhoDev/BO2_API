# SEC-10 Central Error Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all local HTTP 500 responses with one safe, correlation-aware error contract while keeping the Front functional throughout the migration.

**Architecture:** The Front first gains one compatibility boundary and a machine-checked inventory. The Back then gains one typed async adapter and error factory, after which controllers migrate by domain to the existing final handler. Success responses remain untouched; internal details are logged only after shared redaction.

**Tech Stack:** TypeScript strict, Express 5.1, Axios, Jest 29, Supertest, Zod 3, ESLint 10, React/Vite.

## Global Constraints

- Work only on `remake` in both repositories; never `main`.
- Stay offline: no real external APIs, production Mongo/Redis, browser, deploy, `npm install`, `npm ci`, or deletion of `node_modules`.
- Preserve all success payloads and business behavior.
- Public errors use `{ success: false, code, message, correlationId }`; never expose technical detail.
- Use `redactSensitiveData` as the single redaction source.
- Follow RED → GREEN → refactor for every behavior change, including mutation sensitivity where practical.
- Apply rule #9 before migrating a file: dead, duplicated, shadowed or stub code is proved and removed rather than typed or wrapped.
- One lowercase Conventional Commit per family; do not mix Front and Back commits, but report coordinated pairs together.
- Preserve unrelated Front changes in `.claude/settings.local.json` and `scripts/git-hooks/`.
- Do not deploy the Back before the compatible Front is ready.

---

### Task 1: Front error compatibility boundary

**Files:**
- Modify: `Front/src/lib/apiError.ts`
- Modify: `Front/src/lib/__tests__/apiError.test.ts`
- Modify: `Front/src/features/renewalOffers/renewalOffers.domain.ts`
- Modify: `Front/src/pages/guru/TrialsTab.tsx`
- Modify: `Front/src/pages/gerirAlunos/lessonLinks/LessonLinksPage.tsx`
- Create: `Front/src/__tests__/apiErrorBoundaryInventory.test.ts`

**Interfaces:**
- Produces: `ApiErrorPayload`, `getApiErrorMessage(error, fallback)`, `getApiErrorStatus(error)`, `getApiErrorCode(error)`, `getApiErrorCorrelationId(error)`.
- Legacy aliases `error` and `details` remain private to `src/lib/apiError.ts` during migration.

- [ ] **Step 1: Write RED tests for the canonical envelope and metadata**

Add cases proving `message`, `code`, `correlationId`, status, network fallback, and legacy `error`/`details` compatibility. Add an inventory mutation that creates a direct `response.data.details` consumer outside the boundary and must be detected.

- [ ] **Step 2: Run the focused Front tests and verify RED**

Run:

```powershell
npx jest --ci --runInBand src/lib/__tests__/apiError.test.ts src/__tests__/apiErrorBoundaryInventory.test.ts
```

Expected: failures for missing metadata helpers and missing inventory.

- [ ] **Step 3: Implement the single boundary**

Use this public shape:

```ts
export interface ApiErrorPayload {
  success?: false
  code?: string
  message?: string
  correlationId?: string
}
```

Keep legacy aliases in a private compatibility type. Narrow unknown values; do not cast components to Axios payloads.

- [ ] **Step 4: Remove the three local helpers**

Import the shared functions in renewal offers, Guru trials and lesson links without changing their displayed fallback copy.

- [ ] **Step 5: Run Front focused and repository gates**

Run Jest for touched suites, ESLint, `tsc --noEmit`, Prettier check for touched files, Vite build, and `git diff --check`.

- [ ] **Step 6: Commit**

```text
refactor(api): centralize error parsing
```

---

### Task 2: Back async and error factories

**Files:**
- Modify: `src/security/errorHandling.ts`
- Create: `src/security/asyncRoute.ts`
- Modify: `tests/security/errorHandling.test.ts`
- Create: `tests/security/asyncRoute.test.ts`
- Modify: `tests/tooling/productionBoundaryInventory.test.ts`
- Modify: `src/routes/discordRenewal.routes.ts`
- Modify: `src/routes/guru.routes.ts`
- Modify: `src/routes/hotmart.routes.ts`
- Modify: `src/routes/renewalAc.routes.ts`

**Interfaces:**
- Produces: `asyncRoute(handler: RequestHandler): RequestHandler`.
- Produces: `internalError(publicMessage: string, code: string, cause: unknown): HttpError`.
- Existing `HttpError` and `createErrorHandling` remain authoritative.

- [ ] **Step 1: Write RED tests**

Prove that async rejection reaches `next` once; synchronous throw reaches `next`; an unknown error is not exposed; `internalError` retains only the public message in the response and the cause in the redacted log; `headersSent` delegates.

- [ ] **Step 2: Verify RED**

Run the two focused security suites and confirm failures are caused by the missing interfaces.

- [ ] **Step 3: Implement the minimal shared adapter and factory**

The adapter must use `Promise.resolve(handler(req, res, next)).catch(next)` and never send a response itself. The factory must construct `HttpError` with status 500 and the supplied stable code/message.

- [ ] **Step 4: Replace four duplicated route wrappers**

Delete local `asyncRoute` definitions and import the shared typed adapter. Do not change route order, middleware order or handlers.

- [ ] **Step 5: Strengthen the Back inventory**

Track executable `res.status(500)` and public `error.message`/`details` response patterns by file and line. Mutation tests must prove both detectors. Freeze the current baseline; never increase it.

- [ ] **Step 6: Run focused and Back gates, then commit**

```text
refactor(errors): centralize async failures
```

---

### Task 3: Critical exposure wave

**Files:**
- Modify: `src/routes/events.routes.ts`
- Modify: `src/controllers/courseLessons.controller.ts`
- Modify: `src/controllers/discovery.controller.ts`
- Modify: `src/controllers/businessAnalytics.controller.ts`
- Modify: `src/controllers/dashboard.controller.ts`
- Modify: `src/controllers/dashboardQuick.controller.ts`
- Modify: `src/controllers/usersReviewLists.controller.ts`
- Tests: matching route/controller characterization suites; create focused suites where absent.

**Interfaces:** Uses `asyncRoute`, `internalError`, `HttpError`, and the final handler from Task 2.

- [ ] **Step 1: Apply rule #9 and record live mounts/consumers**
- [ ] **Step 2: Add characterization tests for success payloads and RED tests proving raw causes are currently exposed**
- [ ] **Step 3: Migrate one file at a time to `next(internalError(...))`, preserving non-formatting catch behavior**
- [ ] **Step 4: Run focused tests and update the inventory after each file**
- [ ] **Step 5: Commit each coherent family separately**

Subjects:

```text
refactor(events): centralize route errors
refactor(courses): centralize query errors
refactor(analytics): centralize dashboard errors
refactor(users): centralize review list errors
```

---

### Task 4: Guru error wave

**Files:**
- Modify: `src/controllers/guru.sso.controller.ts`
- Modify: `src/controllers/guru.analytics.controller.ts`
- Modify: `src/controllers/guru.snapshot.controller.ts`
- Modify: `src/controllers/guru.inactivation.controller.ts`
- Modify: `src/controllers/guru.sync.controller.ts`
- Modify: `src/controllers/guru.trials.controller.ts`
- Modify: `src/controllers/guru.webhook.controller.ts`
- Tests: Guru route/controller suites.

- [ ] **Step 1: Characterize success contracts and classify every catch as formatting-only or compensating**
- [ ] **Step 2: RED-test stable public messages and no raw Guru/axios payload exposure**
- [ ] **Step 3: Migrate formatting-only catches; retain and test cleanup/compensation before forwarding**
- [ ] **Step 4: Remove dead helpers/imports and update the inventory**
- [ ] **Step 5: Run Guru-focused tests and Back gates**
- [ ] **Step 6: Commit one controller family per commit using `refactor(guru): ...` subjects**

---

### Task 5: ActiveCampaign error wave

**Files:**
- Modify: `src/controllers/acTags/acReader.controller.ts`
- Modify: `src/controllers/acTags/tagRule.controller.ts`
- Modify: `src/controllers/acTags/tagRuleEstimate.controller.ts`
- Modify: `src/controllers/acTags/activecampaign.controller.ts`
- Modify: `src/routes/ACroutes/activecampaign.routes.ts`
- Tests: ActiveCampaign controller, preview and destructive-validation suites.

- [ ] **Step 1: Prove live routes and distinguish preview/dry-run from destructive paths**
- [ ] **Step 2: RED-test safe errors without changing the real preview or the four `if (!dryRun)` guards**
- [ ] **Step 3: Migrate reader, rules and estimates, then the main controller**
- [ ] **Step 4: Update inventory and run all ActiveCampaign-focused tests offline with HTTP mocks**
- [ ] **Step 5: Commit each controller family separately**

---

### Task 6: Sync, tag monitoring and testimonials wave

**Files:**
- Modify the listed controllers under `src/controllers/syncUtilizadoresControllers/`, `src/controllers/tagMonitoring/`, `src/controllers/sync.controller.ts`, and `src/controllers/testimonials.controller.ts`.
- Tests: matching characterization, validation and feature tests.

- [ ] **Step 1: Generate the current per-file inventory and verify each file is live**
- [ ] **Step 2: Characterize callbacks, partial-error stats and long-running request behavior before migration**
- [ ] **Step 3: Migrate by controller without changing request timeout, dry-run, batching or partial-failure semantics**
- [ ] **Step 4: Gate and commit one controller per commit**

---

### Task 7: Remaining Back tail and Front direct consumers

**Files:**
- Modify every remaining file named by the Back and Front inventories; the inventory output is the authoritative finite list.
- Modify: `Front/src/__tests__/apiErrorBoundaryInventory.test.ts`
- Modify: `tests/tooling/productionBoundaryInventory.test.ts`

- [ ] **Step 1: Snapshot the finite remaining lists in test output**
- [ ] **Step 2: Migrate Front direct consumers to the shared boundary**
- [ ] **Step 3: Migrate Back formatting-only catches; stop on business decisions or compensating behavior without coverage**
- [ ] **Step 4: Prove both mutation tests RED and restore GREEN**
- [ ] **Step 5: Reach zero for local 500 responses, public technical detail, duplicate Front helpers and direct Front consumers**
- [ ] **Step 6: Run full offline gates in both repositories and commit the final tail**

---

### Task 8: Cross-repository closeout

**Files:**
- Modify: `docs/HARDENING-WORKPLAN.md`
- Modify: `docs/superpowers/specs/2026-08-09-sec-10-central-error-contract-design.md` only if implementation evidence requires clarification.
- Modify Front transport-contract documentation/test inventory where already established.

- [ ] **Step 1: Run negative greps and both machine inventories**
- [ ] **Step 2: Run the complete BO2_API offline gate**
- [ ] **Step 3: Run the complete Front Jest/lint/TypeScript/Prettier/build gate**
- [ ] **Step 4: Confirm lockfiles unchanged, worktrees contain no unintended files and no real systems were contacted**
- [ ] **Step 5: Record exact counts, commits, operational caveats and the Back-before-Front deploy prohibition**
- [ ] **Step 6: Commit documentation**

```text
docs(sec): close central error migration
```

## Stop Conditions

Stop rather than guess when a catch performs compensation/cleanup without characterization, a consumer depends on technical detail, a status code encodes undocumented business behavior, a success response would change, a required dependency is absent, or an offline gate attempts real network access.
