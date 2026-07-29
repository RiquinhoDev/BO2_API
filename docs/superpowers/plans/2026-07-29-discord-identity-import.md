# Discord Identity Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the Discord identity CSV/XLSX import from `users.controller.ts` into a tested use case with explicit persistence and workbook ports, while preserving the HTTP contract and deriving audit ownership exclusively from the authenticated principal.

**Architecture:** A pure `DiscordIdentityImportService` owns record normalization, reconciliation, statistics, and history lifecycle. Mongoose and ExcelJS remain behind adapters; a thin controller owns only the HTTP/file-cleanup boundary and maps the use-case result to the existing response envelope. Runtime composition wires the existing identity reconciliation service, workbook reader, history repository, logger, and clock.

**Tech Stack:** TypeScript strict, Express 5, Mongoose, ExcelJS, Jest 29, Supertest, mongodb-memory-server.

## Global Constraints

- Everything runs offline: no Guru, Hotmart, ActiveCampaign, CursEduca, Discord, or production Mongo access.
- Do not run `npm install`, `npm ci`, or remove `node_modules`.
- Preserve `POST /api/users/syncDiscordAndHotmart`, its upload limits, cleanup guarantees, and success/error envelopes.
- Never trust `req.body.user` for audit ownership; use `req.user.email`, with `"system"` only for explicitly auth-disabled local/test composition.
- Use real types or `unknown` plus narrowing; no `any`, unsafe casts, non-null assertions, `@ts-ignore`, or new lint suppressions.
- Remove the old handler and every orphaned import; do not leave forwarding wrappers or duplicate orchestration.
- Keep route-catalog evidence lines stable or update the catalog evidence atomically if the route line must move.
- One lowercase Conventional Commit for the implementation after the RED/GREEN cycle and full gate.

---

## File Structure

- Create `src/services/users/discordIdentityImport.service.ts`: pure import use case and its ports.
- Create `src/services/users/mongooseDiscordIdentityImportHistory.repository.ts`: `SyncHistory` persistence adapter.
- Create `src/services/users/discordIdentityImport.runtime.ts`: production composition.
- Create `src/controllers/userDiscordImport.controller.ts`: thin HTTP and file-cleanup adapter.
- Modify `src/routes/users.routes.ts`: import the new controller directly and stop importing the old handler.
- Modify `src/controllers/users.controller.ts`: delete the import orchestration and now-unused dependencies.
- Create `tests/services/users/discordIdentityImport.service.test.ts`: pure orchestration tests with in-memory fakes.
- Create `tests/services/users/mongooseDiscordIdentityImportHistory.repository.test.ts`: MongoMemory persistence contract.
- Create `tests/controllers/userDiscordImport.controller.test.ts`: authenticated actor, envelope, cleanup, and failure behavior.
- Modify `docs/HARDENING-WORKPLAN.md`: record the completed ARCH-02 checkpoint and measured line-count reduction.

### Task 1: Define and prove the pure import use case

**Files:**
- Create: `src/services/users/discordIdentityImport.service.ts`
- Test: `tests/services/users/discordIdentityImport.service.test.ts`

**Interfaces:**
- Consumes:
  - `readImportedUsers(filePath: string): Promise<ImportedUserRecord[]>`
  - `reconcileImportedIdentity(input: { email: string; discordId: string }): Promise<'added' | 'unchanged' | 'unmatched'>`
- Produces:
  - `DiscordIdentityImportHistoryRepository`
  - `DiscordIdentityImportService.execute(input): Promise<DiscordIdentityImportResult>`

- [x] **Step 1: Write failing use-case tests**

Cover these cases with in-memory fakes:

```ts
expect(await service.execute({
  filePath: '/tmp/users.csv',
  originalName: 'users.csv',
  actorEmail: 'admin@example.com',
})).toEqual({
  syncId: 'sync-1',
  stats: { added: 1, unmatched: 2, errors: 1 },
})
```

The input rows must include an added identity, an unchanged identity, an unmatched identity, an invalid row, and one reconciliation exception. Assert that:

- actor and original filename reach `history.start`;
- emails are trimmed and lower-cased and Discord IDs are trimmed;
- invalid rows count as `unmatched`;
- a per-record exception counts as `errors` without aborting later rows;
- `history.complete` receives `{ total, added, errors }`;
- a workbook-level failure calls `history.fail` and rejects;
- `history.start` failure does not call `history.fail` because no history ID exists.

- [x] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
npx jest --ci tests/services/users/discordIdentityImport.service.test.ts
```

Expected: FAIL because `DiscordIdentityImportService` does not exist.

- [x] **Step 3: Implement the ports and use case**

Define:

```ts
export interface DiscordIdentityImportHistoryRepository {
  start(input: { actorEmail: string; originalName: string }): Promise<string>
  complete(input: {
    syncId: string
    completedAt: Date
    stats: { total: number; added: number; errors: number }
  }): Promise<void>
  fail(input: { syncId: string; completedAt: Date }): Promise<void>
}

export interface DiscordIdentityImportDependencies {
  readRecords(filePath: string): Promise<ImportedUserRecord[]>
  reconcile(input: {
    email: string
    discordId: string
  }): Promise<'added' | 'unchanged' | 'unmatched'>
  history: DiscordIdentityImportHistoryRepository
  now(): Date
  logRecordError(input: { row: number; error: unknown }): void
}

export interface DiscordIdentityImportResult {
  syncId: string
  stats: { added: number; unmatched: number; errors: number }
}
```

`execute()` starts history, reads records, processes them sequentially to preserve current database-write behavior, completes history, and returns the response statistics. Only failures after `start()` mark that history record failed.

- [x] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
npx jest --ci tests/services/users/discordIdentityImport.service.test.ts
```

Expected: PASS with no network access.

### Task 2: Add the Mongoose history adapter

**Files:**
- Create: `src/services/users/mongooseDiscordIdentityImportHistory.repository.ts`
- Test: `tests/services/users/mongooseDiscordIdentityImportHistory.repository.test.ts`

**Interfaces:**
- Consumes: `DiscordIdentityImportHistoryRepository`
- Produces: `MongooseDiscordIdentityImportHistoryRepository`

- [x] **Step 1: Write the failing MongoMemory contract test**

Start MongoMemory with the existing offline environment (`MONGOMS_RUNTIME_DOWNLOAD=false`). Assert:

```ts
const syncId = await repository.start({
  actorEmail: 'admin@example.com',
  originalName: 'users.csv',
})
```

persists `type: "csv"`, `status: "running"`, authenticated `user`, and `metadata.fileName`. Then assert `complete()` writes `status: "completed"`, `completedAt`, and the exact history stats, while `fail()` writes `status: "failed"` and `completedAt`.

- [x] **Step 2: Run the adapter test and verify RED**

Run:

```powershell
npx jest --ci tests/services/users/mongooseDiscordIdentityImportHistory.repository.test.ts
```

Expected: FAIL because the adapter does not exist.

- [x] **Step 3: Implement the adapter**

Use `new SyncHistory(...).save()` for `start()` and `SyncHistory.findByIdAndUpdate()` for terminal states. Return `document.id` as the opaque service identifier; do not expose Mongoose documents to the use case.

- [x] **Step 4: Run adapter and use-case tests**

Run:

```powershell
npx jest --ci tests/services/users/discordIdentityImport.service.test.ts tests/services/users/mongooseDiscordIdentityImportHistory.repository.test.ts
```

Expected: both suites PASS offline.

### Task 3: Replace the controller orchestration

**Files:**
- Create: `src/services/users/discordIdentityImport.runtime.ts`
- Create: `src/controllers/userDiscordImport.controller.ts`
- Modify: `src/routes/users.routes.ts`
- Modify: `src/controllers/users.controller.ts`
- Test: `tests/controllers/userDiscordImport.controller.test.ts`

**Interfaces:**
- Consumes: `DiscordIdentityImportService.execute()`, `withUploadedFileCleanup()`, `req.user.email`
- Produces: `syncDiscordAndHotmart: RequestHandler`

- [x] **Step 1: Write failing controller characterization tests**

Build a test app with an injected controller service and multipart upload middleware. Prove:

- no file yields the existing `400 / UPLOAD_FILE_REQUIRED`;
- `req.user.email` is passed as `actorEmail`;
- a malicious multipart `user=attacker@example.com` never becomes the actor;
- success preserves:

```json
{
  "message": "Sincronização concluída",
  "syncId": "sync-1",
  "stats": { "added": 1, "unmatched": 2, "errors": 0 }
}
```

- the uploaded file is deleted after success and after service failure;
- service failure reaches the central handler as `500 / USER_IMPORT_FAILED`.

- [x] **Step 2: Run the controller test and verify RED**

Run:

```powershell
npx jest --ci tests/controllers/userDiscordImport.controller.test.ts
```

Expected: FAIL because the controller factory does not exist.

- [x] **Step 3: Implement runtime composition and the thin controller**

Expose a factory for tests:

```ts
export function createUserDiscordImportController(
  service: Pick<DiscordIdentityImportService, 'execute'>,
): RequestHandler
```

The handler must:

1. reject a missing file;
2. derive `actorEmail` from `req.user?.email ?? "system"`;
3. run `service.execute()` inside `withUploadedFileCleanup`;
4. send the unchanged success envelope;
5. translate unknown failures to `HttpError(USER_IMPORT_FAILED)`.

The runtime service wires `readImportedUsers`, `userIdentityReconciliationService.reconcileImportedIdentity`, `MongooseDiscordIdentityImportHistoryRepository`, `() => new Date()`, and the shared redacted logger.

- [x] **Step 4: Switch the route and delete the old implementation**

Import `syncDiscordAndHotmart` from `userDiscordImport.controller.ts`. Delete the old handler from `users.controller.ts`, remove `readImportedUsers`, `withUploadedFileCleanup`, `HttpError`, and identity runtime imports only when `rg` proves they are no longer used there. Preserve the route declaration line when possible because route-catalog evidence is line-sensitive.

- [x] **Step 5: Run focused regression tests**

Run:

```powershell
npx jest --ci tests/controllers/userDiscordImport.controller.test.ts tests/security/usersImportUpload.test.ts tests/services/users/discordIdentityImport.service.test.ts tests/services/users/mongooseDiscordIdentityImportHistory.repository.test.ts tests/security/routeCatalog.test.ts
```

Expected: all suites PASS offline.

### Task 4: Document, verify, and publish the batch

**Files:**
- Modify: `docs/HARDENING-WORKPLAN.md`

**Interfaces:**
- Consumes: measured before/after line count and fresh gate output
- Produces: independently reviewable ARCH-02 checkpoint

- [x] **Step 1: Prove dead-code cleanup and architecture boundaries**

Run:

```powershell
rg -n "syncDiscordAndHotmart|readImportedUsers|withUploadedFileCleanup|req\\.body\\.user" src/controllers src/routes src/services
rg -n "any|@ts-ignore|eslint-disable|eslint-suppress" src/controllers/userDiscordImport.controller.ts src/services/users/discordIdentityImport*
```

Expected: one live route/controller composition, no old orchestration, no client-controlled audit owner, and no new suppressions.

- [x] **Step 2: Update the workplan**

Record the extracted vertical, authenticated audit ownership, preserved HTTP/upload contracts, RED/GREEN evidence, and measured `users.controller.ts` line-count reduction.

- [x] **Step 3: Run the full sandbox gate**

Run sequentially:

```powershell
npm run lint
npm run types:check
npx jest --ci
npm run build
```

Expected: lint 0, TypeScript ratchet 0/0, Jest green with only the two known skips, build 0.

- [x] **Step 4: Review and commit**

Review `git diff --check`, `git diff --stat`, and the complete diff. Stage only this vertical and commit:

```text
refactor(users): extract identity import

Derive import audit ownership from the authenticated principal instead of
trusting multipart form data.
```

- [ ] **Step 5: Push and verify the remote**

Push `remake`, then compare local HEAD with `git ls-remote origin refs/heads/remake`. If credentials reject the push, report the exact failure and recheck whether the external synchronizer advanced the remote.
