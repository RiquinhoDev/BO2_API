# Individual Score Recalculation Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the individual score recalculation handler's unvalidated full-read/N+1-write flow with a strict, streaming, batched vertical slice while preserving its route and public response contract.

**Architecture:** A pure application service consumes projected learners through an async repository port, calculates scores with the existing formula, and persists deterministic updates in bounded unordered batches. A Mongoose adapter owns cursor and bulk-error details; a thin validated controller maps typed outcomes to the existing HTTP envelopes and central error handling.

**Tech Stack:** TypeScript 5.9, Express 5, Mongoose, Zod 3, Jest 29, Supertest, MongoMemoryServer 8.2.6, existing `validatedSchema`/`withValidatedInput`, structured Winston logger, and shared PII redaction.

## Global Constraints

- Work only on the existing `remake` branch; never create or switch branches.
- Run entirely offline: no Guru, Hotmart, ActiveCampaign, CursEduca, Discord, or production Mongo access.
- Do not run `npm install`, `npm ci`, or delete `node_modules`.
- Do not alter the engagement weights, thresholds, labels, route, authentication floor, success/404 envelope, per-learner result fields, or all-learners behavior.
- Keep top-level `User.classId` as the membership source in this lot.
- Retain both deletion defenses: legacy top-level `isDeleted` and canonical `discord.isDeleted`.
- Use one projected, `_id`-ordered cursor and `bulkWrite` batches of at most 100. No per-learner database query and no silent truncation.
- Never introduce `any`, type-suppressing casts, non-null assertions, `@ts-ignore`, duplicate redaction, or new `console.*`.
- Partial calculation/write failures continue later learners and return stable public error rows; raw causes go only to the structured observer/logger.
- Preserve the Front API wrapper and hook. Correct the route catalog consumer to `desconhecido`; do not change Front code.
- Rule #9: prove every removed symbol/import is unreferenced before deleting it.
- Preserve the staged `Front/scripts/git-hooks/pre-commit`; it must never enter a commit from this lot.
- Conventional Commit subjects are lowercase. Do not push without explicit current authorization.

## File Structure

### Task 1 — formula characterization

- Modify `src/utils/engagementCalculator.ts`: keep one formula implementation and remove console side effects.
- Create `tests/utils/engagementCalculator.test.ts`: lock weights, thresholds, defaults, clamping, and purity.
- Modify `eslint-suppressions.json`: prune only suppressions removed by this task.

### Task 2 — application service

- Create `src/services/analytics/individualScoreRecalculation.service.ts`: types, ports, deterministic batching, partial failure policy, and public result construction.
- Create `tests/services/analytics/individualScoreRecalculation.service.test.ts`: pure async-generator tests.

### Task 3 — Mongoose adapter

- Create `src/services/analytics/mongooseIndividualScoreRecalculation.repository.ts`: projected cursor, canonical mapping, bounded `bulkWrite`, and structural error narrowing.
- Create `tests/services/analytics/mongooseIndividualScoreRecalculation.repository.test.ts`: MongoMemoryServer integration plus bulk-error unit proof.

### Task 4 — strict HTTP boundary

- Create `src/security/individualScoreRecalculationInput.ts`: strict params/query/body schema.
- Create `src/controllers/analytics/individualScoreRecalculation.controller.ts`: injected HTTP mapping and central error translation.
- Create `tests/security/individualScoreRecalculationInput.test.ts`: hostile input proof.
- Create `tests/controllers/individualScoreRecalculation.controller.test.ts`: exact envelopes and redaction proof.

### Task 5 — production composition and legacy removal

- Create `src/services/analytics/individualScoreRecalculation.runtime.ts`: observer, repository, service, and controller composition.
- Create `tests/services/analytics/individualScoreRecalculation.runtime.test.ts`: direct typed batch-log privacy proof.
- Modify `src/routes/analytics.routes.ts`: validated runtime mount.
- Modify `src/controllers/analytics.controller.ts`: remove only the recalculation handler and orphan dependencies.
- Modify `tests/routes/classAnalytics.routes.test.ts`: extracted wiring and boundary proof.
- Modify `tests/controllers/analytics.controller.test.ts`: leave only the multi-platform characterization.
- Modify `src/security/route-catalog.json`: consumer fact and shifted evidence lines.
- Modify `eslint-suppressions.json`: prune legacy handler suppressions.

### Task 6 — evidence and complete gates

- Modify `docs/HARDENING-WORKPLAN.md`: record measured outcomes only.

---

### Task 1: Characterize and purify the shared engagement calculator

**Files:**
- Modify: `src/utils/engagementCalculator.ts`
- Create: `tests/utils/engagementCalculator.test.ts`
- Modify: `eslint-suppressions.json`

**Interfaces:**
- Preserves:
  ```ts
  export function calculateCombinedEngagement(
    user: UserData,
  ): EngagementResult
  ```
- Produces no logging or other side effect.

- [ ] **Step 1: Write formula characterization tests**

Create `tests/utils/engagementCalculator.test.ts`:

```ts
import {
  calculateCombinedEngagement,
  type EngagementResult,
  type UserData,
} from '../../src/utils/engagementCalculator'

type ThresholdCase = readonly [
  UserData,
  number,
  EngagementResult['level'],
  string,
]

const thresholdCases: readonly ThresholdCase[] = [
  [{ engagement: 'MEDIO', accessCount: 0, progress: { completedPercentage: 9 } }, 14, 'MUITO_BAIXO', 'Muito Baixo'],
  [{ engagement: 'ALTO', accessCount: 0, progress: { completedPercentage: 0 } }, 15, 'BAIXO', 'Baixo'],
  [{ engagement: 'MUITO_ALTO', accessCount: 0, progress: { completedPercentage: 22 } }, 29, 'BAIXO', 'Baixo'],
  [{ engagement: 'MUITO_ALTO', accessCount: 0, progress: { completedPercentage: 24 } }, 30, 'MEDIO', 'Médio'],
  [{ engagement: 'MUITO_ALTO', accessCount: 0, progress: { completedPercentage: 72 } }, 49, 'MEDIO', 'Médio'],
  [{ engagement: 'MUITO_ALTO', accessCount: 0, progress: { completedPercentage: 74 } }, 50, 'ALTO', 'Alto'],
  [{ engagement: 'MUITO_ALTO', accessCount: 4, progress: { completedPercentage: 98 } }, 69, 'ALTO', 'Alto'],
  [{ engagement: 'MUITO_ALTO', accessCount: 4, progress: { completedPercentage: 100 } }, 70, 'MUITO_ALTO', 'Muito Alto'],
]

describe('calculateCombinedEngagement', () => {
  it('preserves the 40/40/20 formula and high-score output', () => {
    const result = calculateCombinedEngagement({
      engagement: 'ALTO',
      accessCount: 31,
      progress: { completedPercentage: 100 },
    })

    expect(result).toMatchObject({
      score: 89,
      level: 'MUITO_ALTO',
      breakdown: {
        accessScore: 86,
        progressScore: 100,
        engagementScore: 75,
        weights: { access: 0.4, progress: 0.4, engagement: 0.2 },
      },
    })
  })

  it('keeps absent engagement neutral and the exact low-level boundary', () => {
    expect(calculateCombinedEngagement({
      accessCount: 0,
      progress: { completedPercentage: 0 },
    })).toMatchObject({
      score: 4,
      level: 'MUITO_BAIXO',
      breakdown: { engagementScore: 20 },
    })

    expect(calculateCombinedEngagement({
      engagement: 'ALTO',
      accessCount: 0,
      progress: { completedPercentage: 0 },
    })).toMatchObject({ score: 15, level: 'BAIXO' })
  })

  it('keeps progress capped at one hundred', () => {
    expect(calculateCombinedEngagement({
      engagement: 'NONE',
      accessCount: 0,
      progress: { completedPercentage: 150 },
    }).breakdown.progressScore).toBe(100)
  })

  it.each(thresholdCases)(
    'maps threshold case %# to its exact score, level, and label',
    (input, score, level, levelLabel) => {
      expect(calculateCombinedEngagement(input)).toMatchObject({
        score,
        level,
        levelLabel,
      })
    },
  )
})
```

- [ ] **Step 2: Run characterization GREEN before refactoring**

Run:

```powershell
npx.cmd jest --ci --runInBand tests/utils/engagementCalculator.test.ts
```

Expected: three tests pass against the existing formula. These are
characterization tests; mutation proof in Step 7 establishes their sensitivity.

- [ ] **Step 3: Write the failing purity test**

Append:

```ts
it('does not write learner or metric data to the console', () => {
  const log = jest.spyOn(console, 'log').mockImplementation(() => undefined)
  try {
    calculateCombinedEngagement({
      engagement: 'MEDIO',
      accessCount: 7,
      progress: { completedPercentage: 42 },
      email: 'private@example.test',
    })
    expect(log).not.toHaveBeenCalled()
  } finally {
    log.mockRestore()
  }
})
```

- [ ] **Step 4: Run the purity test and verify RED**

Run:

```powershell
npx.cmd jest --ci --runInBand tests/utils/engagementCalculator.test.ts
```

Expected: FAIL because the current calculator invokes `console.log`.

- [ ] **Step 5: Remove calculator console side effects**

Delete every `console.log` from `engagementCalculator.ts`. Do not add a logger,
change branches, reorder conditions, alter arithmetic, or change the exported
types. Remove comments that describe runtime debug output only when they become
misleading.

- [ ] **Step 6: Run calculator GREEN and prune suppressions**

Run:

```powershell
npx.cmd jest --ci --runInBand tests/utils/engagementCalculator.test.ts
npm.cmd run lint:baseline:prune
npm.cmd run lint
npm.cmd run types:check
```

Expected: tests pass; the calculator's 19 `no-console` suppressions disappear;
TypeScript remains 0/0.

- [ ] **Step 7: Run formula mutation checks**

Perform one mutation at a time, restore after each failure:

1. change `access: 0.4` to `access: 0.5`;
2. change the `score >= 15` boundary to `score > 15`;
3. change absent engagement default from `20` to `0`.

Run after each:

```powershell
npx.cmd jest --ci --runInBand tests/utils/engagementCalculator.test.ts
```

Expected: the focused suite is RED for each mutation. Restore and rerun GREEN.

- [ ] **Step 8: Commit the pure calculator**

```powershell
git add -- src/utils/engagementCalculator.ts tests/utils/engagementCalculator.test.ts eslint-suppressions.json
git diff --cached --check
git commit -m "refactor(engagement): make calculator pure"
```

---

### Task 2: Build the streaming application service

**Files:**
- Create: `src/services/analytics/individualScoreRecalculation.service.ts`
- Create: `tests/services/analytics/individualScoreRecalculation.service.test.ts`

**Interfaces:**
- Consumes:
  ```ts
  calculateCombinedEngagement(input: UserData): EngagementResult
  ```
- Produces:
  ```ts
  export const SCORE_RECALCULATION_BATCH_SIZE = 100

  export interface ScoreRecalculationLearner {
    id: string
    name?: string
    email?: string
    currentScore?: number
    currentLevel?: string
    accessCount?: number
    totalProgress?: number
  }

  export interface ScoreRecalculationUpdate {
    learnerId: string
    calculatedAt: Date
    score: number
    level: EngagementResult['level']
  }

  export interface ScoreRecalculationBatchWrite {
    successfulIds: ReadonlySet<string>
    failedIds: ReadonlySet<string>
  }

  export interface ScoreRecalculationRepository {
    streamByClass(classId: string): AsyncIterable<ScoreRecalculationLearner>
    persistBatch(
      updates: readonly ScoreRecalculationUpdate[],
    ): Promise<ScoreRecalculationBatchWrite>
  }

  export interface ScoreRecalculationObserver {
    calculationFailed(event: {
      learnerId: string
      cause: unknown
    }): void
    writeFailed(event: {
      learnerIds: readonly string[]
      cause: unknown
    }): void
  }

  export interface ScoreRecalculationSuccessResult {
    studentId: string
    name: string
    oldScore: number
    newScore: number
    oldLevel: string
    newLevel: EngagementResult['level']
  }

  export interface ScoreRecalculationFailureResult {
    studentId: string
    name: string
    error: 'Não foi possível atualizar o score'
  }

  export type ScoreRecalculationResult =
    | ScoreRecalculationSuccessResult
    | ScoreRecalculationFailureResult

  export type ScoreRecalculationOutcome =
    | { kind: 'not-found' }
    | {
        kind: 'completed'
        classId: string
        totalStudents: number
        successfulUpdates: number
        failedUpdates: number
        calculationDuration: number
        completedAt: Date
        results: ScoreRecalculationResult[]
      }

  export class IndividualScoreRecalculationService {
    constructor(
      repository: ScoreRecalculationRepository,
      calculator?: (input: UserData) => EngagementResult,
      now?: () => Date,
      observer?: ScoreRecalculationObserver,
    )
    recalculate(classId: string): Promise<ScoreRecalculationOutcome>
  }
  ```

- [ ] **Step 1: Write service test fixtures**

Create typed helpers:

```ts
const learner = (
  id: string,
  overrides: Partial<ScoreRecalculationLearner> = {},
): ScoreRecalculationLearner => ({
  id,
  name: `Learner ${id}`,
  currentScore: 0,
  currentLevel: 'BAIXO',
  accessCount: 0,
  totalProgress: 0,
  ...overrides,
})

async function* stream(
  learners: readonly ScoreRecalculationLearner[],
): AsyncIterable<ScoreRecalculationLearner> {
  for (const item of learners) yield item
}
```

Use a repository fake whose `persistBatch` returns every submitted ID as
successful by default.

- [ ] **Step 2: Write failing empty and single-learner tests**

Prove:

1. an empty stream returns `{ kind: 'not-found' }`, performs no write, and does
   not consume a finish clock value;
2. one learner uses nullish zero preservation, name/email fallback, one shared
   update timestamp, formula output, duration, and completion timestamp;
3. the mapper passes only level, access count, and progress to the calculator.

- [ ] **Step 3: Run the service suite and verify RED**

Run:

```powershell
npx.cmd jest --ci --runInBand tests/services/analytics/individualScoreRecalculation.service.test.ts
```

Expected: FAIL because the service module does not exist.

- [ ] **Step 4: Implement public types, constructor, and one-batch flow**

Use a no-op observer:

```ts
const NOOP_OBSERVER: ScoreRecalculationObserver = {
  calculationFailed: () => undefined,
  writeFailed: () => undefined,
}
```

Use `calculateCombinedEngagement` and `() => new Date()` as defaults. Build
public learner names with:

```ts
const publicName =
  item.name || item.email || 'Aluno sem identificação'
```

For old fields use:

```ts
oldScore: item.currentScore ?? 0
oldLevel: item.currentLevel || 'BAIXO'
```

Do not use `any`, a cast, or a non-null assertion.

- [ ] **Step 5: Run the initial service tests GREEN**

Run:

```powershell
npx.cmd jest --ci --runInBand tests/services/analytics/individualScoreRecalculation.service.test.ts
```

Expected: empty and single-learner tests pass.

- [ ] **Step 6: Write failing batching and partial-failure tests**

Add tests proving:

- 205 learners call `persistBatch` with sizes `[100, 100, 5]`;
- result order remains input order;
- a calculator throw affects only that learner and calls
  `observer.calculationFailed` with ID/cause, never name/email;
- indexed failed IDs become stable rows with
  `error: 'Não foi possível atualizar o score'`;
- a repository throw is converted into failure for only the current batch,
  calls `observer.writeFailed`, and later batches continue;
- an outcome that omits an update ID from both sets treats it as failed
  defensively;
- no raw error string appears in `results`.

The repository fake may throw for one selected call. The service catches that
throw, observes it, and treats all valid updates in that batch as failed.

- [ ] **Step 7: Implement stable 100-learner chunking**

Accumulate at most 100 streamed learners, then call an internal
`processBatch(batch)` that:

1. calculates each learner independently;
2. records calculation failures in their original positions;
3. submits only valid updates once;
4. catches a repository failure and observes it;
5. maps update outcomes back into the original learner order;
6. appends result rows before clearing the batch.

Flush the final partial batch after iteration. Call the finish clock once only
when at least one learner was read.

- [ ] **Step 8: Run service GREEN and mutation checks**

Run:

```powershell
npx.cmd jest --ci --runInBand tests/services/analytics/individualScoreRecalculation.service.test.ts
```

Then mutate separately:

1. change batch size to 101;
2. push calculation failures immediately instead of preserving batch order;
3. return raw `error.message`;
4. abort after a repository failure.

Expected: a focused test fails for every mutation. Restore and rerun GREEN.

- [ ] **Step 9: Commit the application service**

```powershell
git add -- src/services/analytics/individualScoreRecalculation.service.ts tests/services/analytics/individualScoreRecalculation.service.test.ts
git diff --cached --check
git commit -m "refactor(analytics): add score recalculation service"
```

---

### Task 3: Add the projected Mongoose cursor and batched writer

**Files:**
- Create: `src/services/analytics/mongooseIndividualScoreRecalculation.repository.ts`
- Create: `tests/services/analytics/mongooseIndividualScoreRecalculation.repository.test.ts`

**Interfaces:**
- Implements `ScoreRecalculationRepository`.
- Constructor:
  ```ts
  export class MongooseIndividualScoreRecalculationRepository
  implements ScoreRecalculationRepository {
    constructor(observer?: ScoreRecalculationObserver)
  }
  ```

- [ ] **Step 1: Write offline fixture setup**

Start MongoMemoryServer with:

```ts
process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
mongoServer = await MongoMemoryServer.create({
  binary: { version: '8.2.6' },
  instance: { dbName: 'individual_score_recalculation_test' },
})
await mongoose.connect(
  assertSafeTestMongoUri(
    mongoServer.getUri('individual_score_recalculation_test'),
  ),
)
```

Seed learners with:

- matching and non-matching class IDs;
- zero combined score/progress;
- names and email fallback;
- one canonical Discord-deleted learner;
- one raw legacy top-level deleted document written through
  `User.collection.insertOne` so Mongoose strict schema cannot discard it.
- stored level fixtures proving Hotmart fallback, CursEduca fallback, and
  combined precedence. Use actual MongoMemoryServer documents, not repository
  mocks.

- [ ] **Step 2: Write failing stream assertions**

Collect `repository.streamByClass('class-1')` and assert:

- only eligible class learners appear;
- both deleted representations are excluded;
- order is `_id` ascending;
- projection maps only ID/name/email/current score/current level/access count/
  total progress, including the two legacy level fields required to derive
  `currentLevel`;
- `currentLevel` uses exact nullish precedence:
  `combined.engagement.level ?? hotmart.engagement.engagementLevel ??
  curseduca.engagement.engagementLevel`;
- meaningful zero remains zero.

Spy on `User.find`; assert one call with both deletion filters and the exact
projection/sort/cursor batch size.

- [ ] **Step 3: Run the adapter suite and verify RED**

Run:

```powershell
npx.cmd jest --ci --runInBand tests/services/analytics/mongooseIndividualScoreRecalculation.repository.test.ts
```

Expected: FAIL because the repository module does not exist.

- [ ] **Step 4: Implement the async projected cursor**

Define a private projection interface with `Types.ObjectId` and optional nested
fields. Implement `async *streamByClass()` with `.find()`, `.select()`,
`.sort({ _id: 1 })`, `.lean<Projection>()`, and
`.cursor({ batchSize: SCORE_RECALCULATION_BATCH_SIZE })`.

Map IDs with `String(document._id)`. Do not pass a document, `unknown`, or
Mongoose object outside the adapter.

- [ ] **Step 5: Run stream tests GREEN**

Run:

```powershell
npx.cmd jest --ci --runInBand tests/services/analytics/mongooseIndividualScoreRecalculation.repository.test.ts
```

Expected: stream/projection/filter assertions pass.

- [ ] **Step 6: Write failing `bulkWrite` tests**

Call `persistBatch` with two typed updates and assert one:

```ts
User.bulkWrite([
  {
    updateOne: {
      filter: { _id: '<id>' },
      update: {
        $set: {
          'combined.combinedEngagement': 42,
          'combined.engagement.score': 42,
          'combined.engagement.level': 'MEDIO',
          'combined.calculatedAt': calculatedAt,
          'metadata.updatedAt': calculatedAt,
        },
      },
    },
  },
  // ...
], { ordered: false })
```

Also mock a rejection shaped as:

```ts
{
  writeErrors: [{ index: 1, errmsg: 'private database detail' }],
}
```

Assert only the second learner fails, the first succeeds, the observer receives
the cause and failed ID, and no raw message appears in the returned outcome.

Add a realistic combined failure shaped with valid indexed `writeErrors` plus
a non-empty `writeConcernError` or `writeConcernErrors` in the cause or nested
result. Assert every submitted learner fails because the committed subset is
ambiguous.

For `{ cause: 'unclassified' }`, assert every submitted learner fails.

- [ ] **Step 7: Implement structural bulk-error narrowing**

Use:

```ts
function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null
}
```

Read `writeErrors` only after `isRecord`, require an array, and accept an index
only when it is an integer within the submitted update range. Before mapping
indexes, structurally inspect both the cause and its result: any non-empty
`writeConcernError` or `writeConcernErrors` makes the entire submitted batch
failed. If the indexed structure is missing, empty, malformed, out of range,
or otherwise ambiguous, classify the complete batch as failed. Never access
`.message` for the public outcome.

- [ ] **Step 8: Add the 205-learner integration proof**

Compose the real service with the real repository and seed 205 eligible
learners. Spy on `User.bulkWrite` while preserving its implementation. Assert:

- exactly three calls;
- operation counts `[100, 100, 5]`;
- no `findByIdAndUpdate`, `updateOne`, or per-learner query;
- all 205 documents contain the five canonical updates;
- response totals report 205 successes.

- [ ] **Step 9: Run adapter/service GREEN and query mutation**

Run:

```powershell
npx.cmd jest --ci --runInBand tests/services/analytics/mongooseIndividualScoreRecalculation.repository.test.ts tests/services/analytics/individualScoreRecalculation.service.test.ts
```

Temporarily add one `User.findByIdAndUpdate` inside the batch loop. The
query/write-count assertion must fail. Restore and rerun GREEN.

- [ ] **Step 10: Commit the Mongoose adapter**

```powershell
git add -- src/services/analytics/mongooseIndividualScoreRecalculation.repository.ts tests/services/analytics/mongooseIndividualScoreRecalculation.repository.test.ts
git diff --cached --check
git commit -m "perf(analytics): batch score recalculation writes"
```

---

### Task 4: Add the strict HTTP boundary

**Files:**
- Create: `src/security/individualScoreRecalculationInput.ts`
- Create: `src/controllers/analytics/individualScoreRecalculation.controller.ts`
- Create: `tests/security/individualScoreRecalculationInput.test.ts`
- Create: `tests/controllers/individualScoreRecalculation.controller.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const individualScoreRecalculationInput = validatedSchema({
    params: {
      classId: z.string().trim().min(1).max(256),
    },
    query: {},
    body: {},
  })

  export function createIndividualScoreRecalculationController(
    service: Pick<IndividualScoreRecalculationService, 'recalculate'>,
  ): ValidatedInputHandler<typeof individualScoreRecalculationInput>
  ```

- [ ] **Step 1: Write failing boundary tests**

Build an Express test app with `withValidatedInput` and a service spy. Prove:

- encoded `class/a` reaches the service as `class/a`;
- the offline marker is removed before service input;
- blank and 257-character IDs return 400;
- extra query/body fields return 400;
- `$where`, dotted keys, and literal JSON `__proto__` return 400;
- invalid requests never call the service.

- [ ] **Step 2: Write failing controller tests**

With fixed typed outcomes, assert exact 404 and 200 envelopes from the design.
For a partial result, assert the stable error string. With
`createErrorHandling`, make the service throw
`new Error('database private@example.test token=secret-value')` and assert:

- status 500;
- code `ANALYTICS_SCORE_RECALCULATION_FAILED`;
- public message `Erro ao recalcular scores individuais da turma`;
- correlation ID is returned;
- body excludes database, email, token, and secret detail;
- captured log detail is redacted.

- [ ] **Step 3: Run boundary/controller tests and verify RED**

Run:

```powershell
npx.cmd jest --ci --runInBand tests/security/individualScoreRecalculationInput.test.ts tests/controllers/individualScoreRecalculation.controller.test.ts
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 4: Implement schema and thin controller**

The controller must only call the service and map outcomes. It does not import
Mongoose, the engagement calculator, or logger. Unexpected failures become:

```ts
export function createIndividualScoreRecalculationController(
  service: Pick<IndividualScoreRecalculationService, 'recalculate'>,
): ValidatedInputHandler<typeof individualScoreRecalculationInput> {
  return async ({ params }, _req, res, next) => {
    try {
      const result = await service.recalculate(params.classId)
      if (result.kind === 'not-found') {
        res.status(404).json({
          success: false,
          message: 'Nenhum aluno encontrado na turma',
        })
        return
      }

      res.status(200).json({
        success: true,
        message:
          `Scores recalculados para ${result.successfulUpdates}`
          + ` de ${result.totalStudents} alunos`,
        data: {
          classId: result.classId,
          totalStudents: result.totalStudents,
          successfulUpdates: result.successfulUpdates,
          failedUpdates: result.failedUpdates,
          calculationDuration: result.calculationDuration,
          results: result.results,
        },
        timestamp: result.completedAt.toISOString(),
      })
    } catch (error) {
      next(new HttpError({
        status: 500,
        code: 'ANALYTICS_SCORE_RECALCULATION_FAILED',
        publicMessage: 'Erro ao recalcular scores individuais da turma',
        cause: error,
      }))
    }
  }
}
```

- [ ] **Step 5: Run boundary/controller GREEN**

Run:

```powershell
npx.cmd jest --ci --runInBand tests/security/individualScoreRecalculationInput.test.ts tests/controllers/individualScoreRecalculation.controller.test.ts tests/security/validatedInput.test.ts tests/security/errorHandling.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 6: Run hostile-input mutations**

Mutate separately:

1. remove `.strict()` indirectly by replacing the shared builder;
2. allow 257-character class IDs;
3. return `error.message` in the controller.

Expected: focused tests are RED. Restore and rerun GREEN.

- [ ] **Step 7: Commit the HTTP boundary**

```powershell
git add -- src/security/individualScoreRecalculationInput.ts src/controllers/analytics/individualScoreRecalculation.controller.ts tests/security/individualScoreRecalculationInput.test.ts tests/controllers/individualScoreRecalculation.controller.test.ts
git diff --cached --check
git commit -m "refactor(analytics): add recalculation boundary"
```

---

### Task 5: Wire production, remove the legacy slice, and correct catalog facts

**Files:**
- Create: `src/services/analytics/individualScoreRecalculation.runtime.ts`
- Modify: `src/routes/analytics.routes.ts`
- Modify: `src/controllers/analytics.controller.ts`
- Modify: `tests/routes/classAnalytics.routes.test.ts`
- Modify: `tests/controllers/analytics.controller.test.ts`
- Modify: `src/security/route-catalog.json`
- Modify: `eslint-suppressions.json`

**Interfaces:**
- Runtime export:
  ```ts
  export const recalculateIndividualScores =
    createIndividualScoreRecalculationController(service)
  ```

- [ ] **Step 1: Write the failing route-wiring test**

Mock the new runtime:

```ts
jest.mock(
  '../../src/services/analytics/individualScoreRecalculation.runtime',
  () => ({
    recalculateIndividualScores:
      extractedHandler('recalculateIndividualScores'),
  }),
)
```

Remove the legacy recalculation mock and assert:

```ts
const response = await request(createTestApp())
  .post(
    '/class/class-1/recalculate-individual?__bo2_offline_loopback=1',
  )

expect(response.body).toMatchObject({
  source: 'class-analytics-boundary',
  handler: 'recalculateIndividualScores',
  input: {
    params: { classId: 'class-1' },
    query: {},
    body: {},
  },
})
```

Also assert extra query/body return 400.

- [ ] **Step 2: Run the route test and verify RED**

Run:

```powershell
npx.cmd jest --ci --runInBand tests/routes/classAnalytics.routes.test.ts
```

Expected: FAIL because the route still uses the legacy controller.

- [ ] **Step 3: Compose the structured observer and runtime**

In the runtime, define one observer:

```ts
const observer: ScoreRecalculationObserver = {
  calculationFailed: ({ learnerId, cause }) => {
    logger.error('Individual score calculation failed', {
      learnerId,
      error: cause,
    })
  },
  writeFailed: ({ learnerIds, cause }) => {
    logger.error('Individual score batch write failed', {
      failedCount: learnerIds.length,
      error: cause,
    })
  },
}
```

Expose this composition as a small typed factory receiving an `AppLogger`.
Do not include learner ID, name, or email in batch-write logger metadata. Pass
the same observer to the Mongoose repository and service. Compose the
controller last.

- [ ] **Step 3a: Prove count-only batch logging**

Create `tests/services/analytics/individualScoreRecalculation.runtime.test.ts`.
Invoke the observer factory directly with a typed recording logger, then call
`writeFailed` with opaque learner IDs and a sensitive cause. Assert the logger
metadata contains `failedCount` and the cause passed for shared redaction, but
neither the metadata nor its serialized form contains either learner ID.

- [ ] **Step 4: Mount the validated runtime**

Import the input, runtime handler, and existing `withValidatedInput`. Replace
the one-line legacy route with the validated multiline mount from the design.

- [ ] **Step 5: Prove and remove only the legacy handler**

Before deleting:

```powershell
rg -n "recalculateIndividualScores|calculateCombinedEngagement|findByIdAndUpdate" src/controllers/analytics.controller.ts src/routes/analytics.routes.ts tests
```

Remove from `analytics.controller.ts`:

- `recalculateIndividualScores`;
- its `analyticsController` property;
- `Request` if no longer used;
- `calculateCombinedEngagement`;
- any import orphaned only by this handler.

Keep `getMultiPlatformAnalytics`, its interface, model reads, service import,
route, tests, and object export intact.

Update `tests/controllers/analytics.controller.test.ts` to remove only the
recalculation test and `findByIdAndUpdate` mock.

- [ ] **Step 6: Update all catalog evidence**

Keep route count 437. For the target entry use:

```json
{
  "method": "POST",
  "path": "/api/analytics/class/:classId/recalculate-individual",
  "access": "authenticated",
  "consumer": "desconhecido",
  "writes": true,
  "destructive": false,
  "evidence": "wrapper/hook sem caller de componente no Front em <src/features/analytics/analytics.api.ts>, <src/features/analytics/hooks/useAnalyticsController.ts>; rota em src/routes/analytics.routes.ts:<linha>"
}
```

Update every shifted `analytics.routes.ts` evidence line. Do not hand-edit the
route manifest because method/path count is unchanged.

- [ ] **Step 7: Prune lint baselines and prove no orphan**

Run:

```powershell
npm.cmd run lint:baseline:prune
rg -n "recalculateIndividualScores|calculateCombinedEngagement|findByIdAndUpdate" src/controllers/analytics.controller.ts src/routes/analytics.routes.ts tests
rg -n "console\\.|\\bany\\b|@ts-ignore|@ts-expect-error|\\bas\\s+(any|unknown)\\b|!\\." src/services/analytics/individualScoreRecalculation* src/controllers/analytics/individualScoreRecalculation.controller.ts src/security/individualScoreRecalculationInput.ts
```

Expected: references exist only in the new runtime/controller/service/tests and
route; none remain in the legacy controller. No forbidden new pattern.

- [ ] **Step 8: Run focused integration GREEN**

Run:

```powershell
npx.cmd jest --ci --runInBand tests/utils/engagementCalculator.test.ts tests/services/analytics/individualScoreRecalculation.service.test.ts tests/services/analytics/mongooseIndividualScoreRecalculation.repository.test.ts tests/services/analytics/individualScoreRecalculation.runtime.test.ts tests/security/individualScoreRecalculationInput.test.ts tests/controllers/individualScoreRecalculation.controller.test.ts tests/controllers/analytics.controller.test.ts tests/routes/classAnalytics.routes.test.ts tests/security/routeCatalog.test.ts
```

Expected: all focused tests pass; catalog is 437/437.

- [ ] **Step 9: Run wiring and safety mutations**

Mutate separately:

1. wire the route back to the legacy mock;
2. remove `discord.isDeleted` from the Mongoose filter;
3. replace `bulkWrite` with per-learner writes;
4. add learner email to an observer event.

Expected: focused route, repository/query-count, or observer tests fail. Restore
and rerun GREEN.

- [ ] **Step 10: Commit production wiring**

```powershell
git add -- src/services/analytics/individualScoreRecalculation.runtime.ts src/routes/analytics.routes.ts src/controllers/analytics.controller.ts tests/routes/classAnalytics.routes.test.ts tests/controllers/analytics.controller.test.ts src/security/route-catalog.json eslint-suppressions.json
git diff --cached --check
git commit -m "fix(analytics): harden individual recalculation"
```

---

### Task 6: Run complete verification and record evidence

**Files:**
- Modify: `docs/HARDENING-WORKPLAN.md`

- [ ] **Step 1: Run the complete BO2_API offline gate**

Run independently:

```powershell
npm.cmd run lint
npm.cmd run types:check
npx.cmd jest --ci --runInBand
npm.cmd run build
```

Record exact exits, suites, passed tests, skipped tests, and warnings. No
success claim may rely on an earlier or focused run.

- [ ] **Step 2: Run the unchanged Front contract gate**

From `../Front`, without installing:

```powershell
.\node_modules\.bin\eslint.cmd src
.\node_modules\.bin\jest.cmd --runInBand src/features/analytics/__tests__/analytics.api.test.ts src/features/analytics/__tests__/useAnalyticsController.test.tsx
.\node_modules\.bin\vite.cmd build
```

If the sandbox blocks Vite's `.vite-temp`, rerun only the same build with
approved filesystem escalation. Verify the staged security hook remains
unchanged.

- [ ] **Step 3: Run final negative and state checks**

```powershell
git diff --check
rg -n "recalculateIndividualScores|findByIdAndUpdate" src/controllers/analytics.controller.ts
rg -n "console\\.|\\bany\\b|@ts-ignore|@ts-expect-error|\\bas\\s+(any|unknown)\\b|!\\." src/services/analytics/individualScoreRecalculation* src/controllers/analytics/individualScoreRecalculation.controller.ts src/security/individualScoreRecalculationInput.ts
git diff --name-only HEAD~4..HEAD | rg "(package-lock\\.json|yarn\\.lock)$"
git status -sb
git log -7 --oneline
git -c safe.directory=C:/Users/User/Documents/GitHub/Riquinho/api/Front/Front -C ../Front status -sb
git -c safe.directory=C:/Users/User/Documents/GitHub/Riquinho/api/Front/Front -C ../Front diff --cached -- scripts/git-hooks/pre-commit
```

Expected: no legacy handler, forbidden new pattern, lockfile change, accidental
Front change, or branch drift.

- [ ] **Step 4: Measure factual outcomes**

Record:

- `analytics.controller.ts` physical lines before/after;
- calculator `no-console` before/after;
- legacy controller `no-console`/`no-explicit-any` before/after;
- database complexity before/after (`1 read + N writes` to
  `1 cursor + ceil(N/100) bulk writes`);
- route count and consumer correction;
- mutation RED/GREEN evidence;
- exact API and Front gate counts;
- confirmation that only MongoMemoryServer was used.

- [ ] **Step 5: Update the workplan**

Add one completed ARCH-02/security/scalability entry. Do not mark role policy,
idempotency, the multi-platform endpoint, or the whole ARCH-02 pillar complete.

- [ ] **Step 6: Commit evidence**

```powershell
git add -- docs/HARDENING-WORKPLAN.md
git diff --cached --check
git commit -m "docs(analytics): record recalculation boundary"
```

- [ ] **Step 7: Verify committed trees**

```powershell
git status -sb
git show --check --stat --oneline HEAD
git log -7 --oneline
git -c safe.directory=C:/Users/User/Documents/GitHub/Riquinho/api/Front/Front -C ../Front status -sb
```

Expected: BO2_API has only coherent commits from this lot; Front still contains
only its pre-existing staged security hook. Do not push.
