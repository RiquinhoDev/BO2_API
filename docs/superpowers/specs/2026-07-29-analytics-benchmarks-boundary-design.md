# Analytics benchmarks boundary design

Date: 2026-07-29
Status: approved

## Goal

Extract `GET /api/analytics/benchmarks` from
`src/controllers/analytics.controller.ts` into a small, testable vertical
slice, replacing its `1 + 3N` query pattern and legacy field reads without
breaking its existing rich HTTP contract.

The backend contract remains the source of truth because the route may have an
external consumer that is not represented in the Front repository. The Front
types and runtime schema will be corrected to describe that contract instead
of continuing to accept a different payload through `parseOrWarn`.

This is an incremental ARCH-02 and ARCH-03 correction. It does not redesign
the analytics product or invent industry-retention data.

## Evidence and current problems

The current handler mixes persistence, metric normalization, percentile
calculation, ranking, insight generation, logging, and HTTP serialization
across roughly 217 lines.

For `N` active classes it performs:

1. one `Class.find`;
2. two `User.countDocuments` calls per class;
3. one `User.aggregate` call per class.

The resulting `1 + 3N` reads do not scale with the number of classes.

The calculations also read legacy or invalid top-level fields:

- `User.engagementScore`, instead of the persisted combined/platform scores;
- `User.progress` as a number, instead of the persisted nested progress data;
- top-level `status`, without preferring the combined status;
- top-level `isDeleted`, without excluding `discord.isDeleted`.

The populated backend response contains `benchmarks`, `industryStats`, arrays
of class metrics, insights, and metadata. The Front currently declares a
different shape containing `industry`, an object-valued `topPerformers`, and
`recommendations`. `parseOrWarn` only logs this mismatch and returns the raw
payload under the incorrect TypeScript type.

The Front exposes API and hook functions for the endpoint, but no production
component calls them. This is not proof that the backend route is dead. Route
usage instrumentation remains the authority for a future removal decision.

## Options considered

### Selected: preserve the rich backend contract and replace the internals

Create a projected Mongoose reader, a pure benchmark calculator, and a thin
HTTP boundary. Correct the Front schema and type to match the real backend
contract.

This preserves possible external consumers, removes the query fan-out, makes
ranking deterministic, and turns the masked Front mismatch into an executable
contract.

### Rejected: replace the backend response with the current Front type

The current Front type has no implementation behind it. Producing it would
require inventing retention and recommendation semantics, and would remove
the richer backend fields. It would be a breaking change based on a dormant
consumer declaration rather than observed behaviour.

### Rejected: remove or deprecate the route now

The absence of a production component in the Front repository does not prove
the absence of jobs or external consumers. The route remains authenticated
and instrumented until traffic evidence supports a separate removal decision.

## Architecture

### Strict route boundary

Define an empty input schema with the shared `validatedSchema` builder:

- empty strict params;
- empty strict query;
- empty strict body.

Mount the route with `withValidatedInput`. The shared boundary continues to
remove the offline marker before the NoSQL/prototype guard and Zod validation.
Unexpected fields, operators, and prototype properties return `400`.

### Reader port

Define a narrow `BenchmarkAnalyticsReader` that returns:

```ts
interface BenchmarkAnalyticsRead {
  activeClasses: Array<{
    classId: string
    className: string
  }>
  metricsByClassId: ReadonlyMap<string, {
    totalStudents: number
    activeStudents: number
    averageEngagement: number
    averageProgress: number
  }>
}
```

The application service depends only on this port and an injected clock. It
does not import Express or Mongoose.

### Mongoose adapter

The adapter performs at most two database reads, independent of the number of
classes:

1. one projected `Class` query for `classId` and `name`, preserving the
   existing active predicate (`isActive: true` or `status: "active"`);
2. one `User` aggregation grouped by `classId`.

If there are no active classes, the reader skips the user aggregation.

The aggregation:

- matches only the active class IDs;
- excludes both top-level `isDeleted: true` and
  `discord.isDeleted: true`;
- keeps the existing membership scope based on top-level `classId`;
- resolves active status as `combined.status`, falling back only to an
  explicit legacy top-level `status`, and counts only `"ACTIVE"`;
- resolves engagement by first-defined precedence:
  `combined.engagement.score` ->
  `combined.combinedEngagement` ->
  `hotmart.engagement.engagementScore` ->
  `curseduca.engagement.alternativeEngagement` ->
  `0`;
- resolves progress by first-defined precedence:
  `combined.totalProgress` ->
  a Hotmart percentage derived from `completedLessons / lessonsData.length`
  when lessons exist ->
  `curseduca.progress.estimatedProgress` ->
  `0`;
- preserves legitimate numeric zero values rather than treating them as
  missing;
- clamps derived and stored percentages to the inclusive `0..100` range;
- applies `maxTimeMS: 120_000`;
- does not materialize full user documents.

The service joins the grouped results back to the projected classes. Active
classes with no students are omitted from benchmark calculation, preserving
the current endpoint behaviour.

Broadening class membership to `UserProduct` or nested CursEduca enrolments is
outside this extraction because it would change which students belong to each
benchmark.

### Pure benchmark calculator

Create a pure calculator that receives class metrics and returns the public
benchmark data.

It preserves:

- nearest-rank percentiles at 90, 75, 50, 25, and 10;
- the existing `excellent`, `good`, `average`, `needsImprovement`, and `poor`
  keys;
- class-size percentiles at 90, 50, and 25;
- top-performer qualification: engagement and progress at or above p75;
- needs-attention qualification: engagement or progress at or below p25;
- the existing industry-stat formulas and insight thresholds;
- the limit of ten entries in each ranked list.

The existing source-order slicing is replaced with deterministic ranking:

- top performers sort by
  `averageEngagement + averageProgress` descending;
- needs-attention sorts by the same sum ascending;
- ties sort by `classId` ascending.

The ranking score is internal and is not added to the response.

All averages, rates, and percentiles remain rounded to whole numbers as in the
current public response.

### Application service, controller, and runtime

The service receives:

- `BenchmarkAnalyticsReader`;
- an injected `now(): Date`.

It returns either the populated benchmark DTO or one of the two legacy empty
DTOs:

- no active classes;
- active classes exist, but none has valid student data.

The controller factory receives only the service contract:

- success preserves status `200` and `{ success, data, timestamp }`;
- both empty cases preserve status `200` and their current
  `{ message, totalClasses: 0 }` data shape;
- unexpected failures enter the central error handler under
  `ANALYTICS_BENCHMARKS_READ_FAILED`;
- the public message remains
  `Erro ao calcular benchmarks da indústria`;
- raw dependency errors never enter the HTTP response.

An explicit runtime module wires the Mongoose adapter and real clock. It
introduces no import-time connection, timer, or external request.

### Legacy removal

After route-level proof:

- remove `getBenchmarks` from `analytics.controller.ts`;
- remove it from the legacy `analyticsController` export;
- prune obsolete lint suppressions;
- update route-catalog evidence to the new boundary;
- change the catalog consumer from `front` to `desconhecido`, recording that
  the Front has an API wrapper but no production component caller;
- retain route-usage instrumentation.

The route, method, authentication policy, and route count do not change.

## HTTP contract

### Populated data

The populated `data` object remains:

```ts
interface BenchmarksResult {
  benchmarks: {
    engagement: BenchmarkLevels
    progress: BenchmarkLevels
    activityRate: BenchmarkLevels
    classSize: {
      large: number
      medium: number
      small: number
    }
  }
  industryStats: {
    totalClasses: number
    totalStudents: number
    averageClassSize: number
    overallEngagement: number
    overallProgress: number
    overallActivityRate: number
  }
  topPerformers: ClassBenchmarkMetric[]
  needsAttention: ClassBenchmarkMetric[]
  insights: Array<{
    type: 'warning' | 'info' | 'success'
    message: string
    recommendation: string
  }>
  metadata: {
    calculationDate: string
    classesAnalyzed: number
    calculationDuration: number
    dataFreshness: 'Calculado em tempo real'
  }
}
```

`BenchmarkLevels` contains `excellent`, `good`, `average`,
`needsImprovement`, and `poor`. `ClassBenchmarkMetric` contains `classId`,
`className`, `totalStudents`, `activeStudents`, `activityRate`,
`averageEngagement`, and `averageProgress`.

### Empty data

The exact legacy empty union remains:

```ts
type EmptyBenchmarksResult = {
  message:
    | 'Nenhuma turma ativa encontrada para calcular benchmarks'
    | 'Nenhuma turma com dados válidos encontrada'
  totalClasses: 0
}
```

No synthetic populated fields are added to the empty result in this lot.

### Front contract

Replace the incorrect `BenchmarksData` type and Zod schema with the union of
the populated and empty contracts above. Keep `getAnalyticsBenchmarks` and the
existing hook surface intact so latent Front consumers do not break.

The populated schema rejects the former invented
`industry/topPerformers-object/recommendations` shape. Representative backend
payloads must parse without warnings.

## Tests and negative proof

All tests run offline with injected readers, clocks, and local Mongo only where
the adapter requires it.

RED/GREEN coverage must prove:

1. empty input is accepted, while extra fields, NoSQL operators, and prototype
   properties return `400`;
2. zero active classes skips the user aggregation;
3. the adapter performs one class query and one user aggregation for multiple
   classes;
4. projections contain only the required class fields;
5. both deletion flags exclude users;
6. canonical status, engagement, and progress fields win over fallbacks;
7. each fallback is used only when the preceding field is absent, including
   preservation of legitimate zero values;
8. Hotmart progress derivation handles zero lessons without division errors;
9. percentages are clamped to `0..100`;
10. grouped class metrics, zero-student omission, rates, and averages are
    correct;
11. every percentile edge follows nearest-rank semantics;
12. top and attention qualification remain unchanged;
13. rankings are deterministic across different database return orders and
    use `classId` as the final tie-breaker;
14. both legacy empty responses remain exact;
15. controller success and central redacted failure envelopes are stable;
16. the route is wired to the new strict boundary, not the legacy controller;
17. the Front populated and empty schemas accept representative backend
    payloads without `parseOrWarn` warnings;
18. the old invented Front payload is rejected by the schema;
19. the catalog records the same route with `consumer: "desconhecido"`;
20. negative grep proves the legacy handler is gone.

Required mutation checks:

1. restore a per-class query;
2. read top-level `engagementScore` or numeric `progress`;
3. treat a legitimate zero as missing;
4. remove deterministic sorting;
5. revert the route to the legacy controller;
6. restore the old Front schema.

Each mutation must produce RED before the correct implementation returns to
GREEN.

## Cross-repository delivery

Backend and Front changes form one coordinated block:

- backend implementation and tests are committed in `BO2_API/remake`;
- Front type, schema, and contract tests are committed in `Front/remake`;
- neither side deploys before both commits are ready and their gates pass.

The pre-existing staged `Front/scripts/git-hooks/pre-commit` file is not part
of this block. It is retained because that repository's `core.hooksPath`
actively points to `scripts/git-hooks`. Front commits must name their intended
paths explicitly so the staged script is neither modified nor accidentally
included.

## Verification

Backend gate:

```text
npm run lint
npm run types:check
npx jest --ci
npm run build
```

Front gate:

```text
yarn lint
yarn test
yarn build
```

Additionally:

- prune backend lint suppressions after removing the legacy handler;
- run backend route-catalog tests;
- run the Front analytics contract tests;
- inspect both staged diffs explicitly;
- run `git diff --check` in both repositories;
- confirm both repositories remain on `remake`;
- use no real APIs and no production Mongo;
- do not run `npm install`, `npm ci`, or delete `node_modules`;
- do not push without explicit current authorization.

## Out of scope

- changing route authentication or adding role policy;
- removing or deprecating the endpoint without traffic evidence;
- changing class membership from top-level `classId`;
- inventing retention or recommendation metrics;
- adding cache without measured need;
- changing percentile thresholds or insight copy;
- removing the Front hook/API surface;
- changing the global API envelope;
- altering the staged Front security hook.
