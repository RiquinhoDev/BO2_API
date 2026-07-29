# Individual Score Recalculation Boundary Design

**Date:** 2026-07-29
**Status:** approved design, pending implementation plan
**Scope:** `POST /api/analytics/class/:classId/recalculate-individual`

## 1. Objective

Replace the remaining write-heavy handler in
`src/controllers/analytics.controller.ts` with a strict, testable vertical
slice that recalculates every eligible learner in a class without loading full
documents or performing one database round trip per learner.

The endpoint must preserve its route, authentication floor, engagement
formula, success/404 envelopes, per-learner result list, and partial-progress
semantics. It must improve input validation, canonical deletion filtering,
observability, database complexity, deterministic processing, and failure
isolation.

This lot must run entirely offline. It may only use local mocks and
MongoMemoryServer. It must never call Guru, Hotmart, ActiveCampaign,
CursEduca, Discord, or production Mongo.

## 2. Current facts

The route is live and mounted in `analytics.routes.ts`. The Front contains an
API wrapper and hook for it, but no production component invokes that hook.
The route is therefore not dead, but its catalog consumer is factually
`desconhecido`, not `front`.

The current handler:

- accepts unvalidated params/query/body;
- reads every matching full `User` document into memory;
- uses one `findByIdAndUpdate` per learner;
- filters the non-canonical top-level `isDeleted`, which is not part of the
  current `IUser` contract;
- logs learner names or emails with `console.*`;
- exposes raw caught error messages in the HTTP result;
- uses a shared calculator containing 19 additional `console.*`;
- cannot be tested without mocking the model directly;
- mixes HTTP, selection, calculation, persistence, timing, logging, and
  response construction in one function.

The write is limited to our Mongo data and is not an external destructive
effect. The existing authenticated floor remains; role policy is outside this
lot because the project still has no approved role matrix or equivalent Front
gating.

## 3. Approaches considered

### 3.1 Move the handler without changing its internals

This would reduce the legacy controller's size, but preserve unvalidated
input, full-document loading, N+1 writes, PII logging, and model coupling. It
is rejected as cosmetic architecture.

### 3.2 Add bounded concurrency around `findByIdAndUpdate`

This would reduce wall-clock time while keeping N writes and a full in-memory
read. It also introduces concurrency tuning without solving the boundary or
observability defects. It is rejected as a local optimisation with weak
scalability.

### 3.3 Strict vertical slice with streaming reads and batched writes

This is the selected approach. A pure calculator maps projected learner data
to an update/result pair. A Mongoose repository streams learners in stable
`_id` order and persists bounded unordered batches. An application service
coordinates partial failures. A thin controller maps domain outcomes to the
existing HTTP contract behind `withValidatedInput`.

This approach removes the N+1 database pattern without truncating learners or
changing the public success semantics.

## 4. Architecture

### 4.1 Pure engagement calculator

`src/utils/engagementCalculator.ts` remains the single formula source. Before
the endpoint extraction, characterization tests will lock:

- access weight: 40%;
- progress weight: 40%;
- existing engagement weight: 20%;
- all current score thresholds and level labels;
- default engagement score when the level is absent or unknown;
- progress clamping behavior.

After the tests are RED/GREEN-capable, all `console.*` calls are removed from
the calculator. Its inputs, return type, weights, thresholds, and output remain
unchanged. This makes every existing caller quieter and prevents the new
boundary from inheriting hidden console output.

No replacement logger belongs inside the pure calculator.

### 4.2 Application types and calculator

Create `src/services/analytics/individualScoreRecalculation.service.ts`.

The projected learner contract contains only:

```ts
interface ScoreRecalculationLearner {
  id: string
  name?: string
  email?: string
  currentScore?: number
  currentLevel?: string
  accessCount?: number
  totalProgress?: number
}
```

The pure mapper calls the existing engagement calculator and produces:

```ts
interface ScoreRecalculationUpdate {
  learnerId: string
  calculatedAt: Date
  score: number
  level: EngagementResult['level']
}

interface ScoreRecalculationSuccess {
  studentId: string
  name: string
  oldScore: number
  newScore: number
  oldLevel: string
  newLevel: EngagementResult['level']
}
```

`name` preserves the current `student.name || student.email` fallback. This is
part of the existing authenticated response contract. It must never be copied
into logs.

Use nullish fallback for numeric fields so meaningful zero is never treated as
missing.

The service constructor receives the repository, calculator, clock, and a
small observer port. Runtime composition supplies the existing calculator and
structured logger adapter; tests supply deterministic fakes. Calculator
injection is specifically required to prove that one malformed learner does
not abort the class without manufacturing an impossible database fixture.

The observer accepts structured failure events containing learner ID or batch
counts plus the internal cause. It never receives name or email. The runtime
observer writes through the existing structured logger, whose single shared
redaction function remains authoritative.

### 4.3 Repository port

The service depends on:

```ts
interface ScoreRecalculationRepository {
  streamByClass(classId: string): AsyncIterable<ScoreRecalculationLearner>
  persistBatch(
    updates: readonly ScoreRecalculationUpdate[],
  ): Promise<ScoreRecalculationBatchWrite>
}
```

`ScoreRecalculationBatchWrite` reports successful and failed learner IDs. It
does not expose driver error strings:

```ts
interface ScoreRecalculationBatchWrite {
  successfulIds: ReadonlySet<string>
  failedIds: ReadonlySet<string>
}
```

The port allows the application service to be tested without Express or
Mongoose and keeps partial-write policy outside the controller.

### 4.4 Mongoose adapter

Create
`src/services/analytics/mongooseIndividualScoreRecalculation.repository.ts`.

The read uses one cursor:

```ts
User.find({
  classId,
  isDeleted: { $ne: true },
  'discord.isDeleted': { $ne: true },
})
  .select({
    _id: 1,
    name: 1,
    email: 1,
    'combined.combinedEngagement': 1,
    'combined.totalProgress': 1,
    'combined.engagement.level': 1,
    'hotmart.engagement.accessCount': 1,
  })
  .sort({ _id: 1 })
  .lean()
  .cursor({ batchSize: 100 })
```

The top-level `isDeleted` condition is retained defensively for raw legacy
documents, while `discord.isDeleted` is the canonical current field; neither
flag may be the sole guard. The stable `_id` order avoids ambiguous traversal.
Updates only touch combined metrics and timestamps, so they do not move a
document in the traversal key.

The adapter persists up to 100 operations per `bulkWrite`, with
`ordered: false`, setting:

- `combined.combinedEngagement`;
- `combined.engagement.score`;
- `combined.engagement.level`;
- `combined.calculatedAt`;
- `metadata.updatedAt`.

The same injected timestamp is used for both timestamp fields in one learner
update.

For an unordered partial bulk error, the adapter narrows the unknown error
structurally and maps driver write-error indices back to learner IDs. No
`any`, assertion cast, non-null assertion, or raw driver message crosses the
port. If an error cannot be classified by index, the whole submitted batch is
reported failed. This is conservative and retry-safe because every write sets
deterministic derived fields.

No per-learner Mongo query is permitted.

The adapter reports internal bulk error detail only through the observer. The
event contains batch size and failed count, never learner names or emails.

### 4.5 Application service

`IndividualScoreRecalculationService.recalculate(classId)`:

1. records the start time through an injected clock;
2. iterates the projected cursor once;
3. calculates learners independently;
4. groups valid updates into batches of 100;
5. persists each batch;
6. converts calculation failures and failed write IDs into stable public
   per-learner error rows;
7. accumulates the existing result array and counters;
8. returns `not-found` when the cursor yields zero learners;
9. returns `completed` otherwise, including total, successes, failures,
   duration, results, and completion timestamp.

One malformed learner must not abort other learners. A cursor/read failure is
not a partial learner failure because the complete class could not be read; it
propagates to the controller as a central 500.

Calculation failures are sent to the observer with learner ID and cause before
being converted to a stable result row. No exception detail is discarded
silently and none crosses the HTTP boundary.

An unclassified persistence failure affects only its submitted batch. The
service continues with later batches and returns 200 with failed rows, matching
the old per-learner continuation semantics.

The batch size is an internal constant, not client input. There is no hard
learner cap: truncation would silently change functionality. Memory is reduced
for Mongo documents and pending writes, although the existing response's full
result array necessarily remains proportional to class size.

No retry loop is added. Blind retries could duplicate load during a database
incident. Retry/idempotency policy belongs to the transversal OPS-02 layer.

### 4.6 HTTP boundary

Create `src/security/individualScoreRecalculationInput.ts` with the shared
builder:

```ts
validatedSchema({
  params: { classId: z.string().trim().min(1).max(256) },
  query: {},
  body: {},
})
```

This preserves non-ObjectId class identifiers and rejects:

- empty or unreasonably large class identifiers;
- unknown params/query/body fields;
- Mongo operators;
- dotted properties;
- `__proto__`, `constructor`, and `prototype`;
- payloads that attempt to influence the recalculation.

The test-only offline marker is removed by the shared boundary before the
operator guard and Zod validation.

Create
`src/controllers/analytics/individualScoreRecalculation.controller.ts` as an
injected factory. It maps:

- `not-found` to the existing 404 envelope and message;
- `completed` to the existing 200 envelope, counters, result rows, ISO
  timestamp, and success message;
- unexpected service failures to `HttpError` with code
  `ANALYTICS_SCORE_RECALCULATION_FAILED` and a stable public message.

The controller never logs directly. The central error handler logs unexpected
request-level failures with correlation ID; the observer logs isolated
calculation/write failures. Both paths use the same structured logger and
shared PII redaction function.

Partial result rows retain the `error` field but use a stable public message;
they never contain exception messages, stack traces, names in logs, or email
addresses in logs.

### 4.7 Runtime and route wiring

Create
`src/services/analytics/individualScoreRecalculation.runtime.ts` to compose the
Mongoose repository, service, and controller.

Replace the route's legacy handler with:

```ts
router.post(
  '/class/:classId/recalculate-individual',
  withValidatedInput(
    individualScoreRecalculationInput,
    recalculateIndividualScores,
  ),
)
```

After wiring is proven, remove only `recalculateIndividualScores` and its
orphan imports from `src/controllers/analytics.controller.ts`. The remaining
multi-platform handler stays intact for the next independent lot.

Update all shifted route-catalog evidence lines. Change only this route's
consumer from `front` to `desconhecido`, with evidence that the Front wrapper
and hook exist but no production component calls the hook. Route count remains
437/437.

## 5. Public contract

### 5.1 No learners

Preserve:

```json
{
  "success": false,
  "message": "Nenhum aluno encontrado na turma"
}
```

with status 404.

### 5.2 Completed or partially completed

Preserve:

```json
{
  "success": true,
  "message": "Scores recalculados para <updated> de <total> alunos",
  "data": {
    "classId": "<classId>",
    "totalStudents": 0,
    "successfulUpdates": 0,
    "failedUpdates": 0,
    "calculationDuration": 0,
    "results": []
  },
  "timestamp": "<ISO-8601>"
}
```

Successful rows preserve `studentId`, `name`, `oldScore`, `newScore`,
`oldLevel`, and `newLevel`. Failed rows preserve `studentId`, `name`, and
`error`, but the error value becomes stable and non-sensitive.

The Front wrapper continues to return `unknown`; no Front contract change is
required in this lot.

## 6. Testing strategy

### 6.1 Characterization RED/GREEN for the shared formula

Add direct unit tests for representative zero, boundary, and high-score
inputs. Prove the tests detect mutations to:

- a formula weight;
- a level threshold;
- absent engagement default.

Then remove the 19 console calls and prove no console method is invoked.

### 6.2 Pure service tests

Use async-generator fakes and a typed repository fake to prove:

- empty stream returns `not-found` without a write;
- one learner preserves formula, fields, zero, name/email fallback, and
  timestamp;
- 205 learners create three batches of 100/100/5;
- calculation failure affects one learner only;
- indexed bulk failures map only their learner IDs;
- unclassified bulk failure marks exactly one batch failed and processing
  continues;
- totals, order, duration, and completion timestamp are deterministic;
- no raw exception detail appears in result rows.

### 6.3 Offline Mongoose tests

MongoMemoryServer proves:

- the projection plus canonical and defensive legacy deletion filters;
- top-level class membership remains intentionally supported;
- Discord-deleted learners are excluded;
- stable `_id` traversal;
- 205 learners require one cursor plus three `bulkWrite` calls;
- all five canonical fields are persisted;
- unordered partial write-error narrowing has a direct unit-level adapter
  test without relying on a real database fault.

### 6.4 Boundary and controller tests

Prove:

- valid encoded string class ID reaches the service;
- empty and over-256-character class IDs are rejected;
- extra query/body fields return 400;
- `$where` and literal `__proto__` return 400 before the service;
- both HTTP envelopes remain exact;
- partial errors remain public and stable;
- unexpected error uses the central code, correlation ID, and redacted detail.

### 6.5 Route and mutation tests

Prove the real route uses the extracted boundary and rejects invalid input.
Mutations must make focused tests RED when:

- the route is wired back to the legacy handler;
- the canonical Discord deletion filter is removed;
- per-learner writes replace `bulkWrite`;
- batching occurs before the 100-item boundary;
- raw exception text is returned.

## 7. Commits

Use one subject per commit, all lowercase:

1. `refactor(engagement): make calculator pure`
2. `refactor(analytics): add score recalculation service`
3. `perf(analytics): batch score recalculation writes`
4. `fix(analytics): harden individual recalculation`
5. `docs(analytics): record recalculation boundary`

The exact split may combine service and adapter only if their staged diff
remains one coherent subject. No commit may include the Front's staged
security hook or unrelated files.

## 8. Verification and stop conditions

Focused tests run after every RED/GREEN cycle. Every implementation commit
must pass:

```powershell
npm.cmd run lint
npm.cmd run types:check
npx.cmd jest --ci --runInBand
npm.cmd run build
```

Final negative checks must prove:

- no legacy handler or orphan import remains;
- no new `any`, cast suppression, non-null assertion, `@ts-ignore`, or
  `console.*`;
- the shared calculator has no console output;
- no lockfile changed;
- route catalog and manifest remain 437/437;
- only local MongoMemoryServer was used.

Stop and ask before implementation if:

- preserving a response field requires exposing new sensitive data;
- Mongoose cannot map unordered write failures without a suppressing cast;
- the real schema contradicts the projected learner contract;
- the Front has a production caller with a stricter undocumented expectation;
- a proposed optimisation would truncate learners or change the formula;
- any test requires a real integration or production database.

## 9. Explicitly outside this lot

- `GET /api/analytics/multi-platform`;
- role-matrix design and `authorize(...)`;
- cross-instance idempotency or distributed leases;
- changing the engagement formula or thresholds;
- migrating class membership from top-level `User.classId`;
- adding client-controlled batch size, pagination, caps, retries, or dry-run;
- converting the full response result list to an asynchronous job;
- Front UI changes;
- external-system writes.
