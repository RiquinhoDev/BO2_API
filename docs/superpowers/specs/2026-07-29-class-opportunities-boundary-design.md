# Class opportunities boundary design

Date: 2026-07-29
Status: approved

## Goal

Extract `GET /api/analytics/opportunities/:classId` from
`analytics.controller.ts` into a small, testable vertical slice without
changing its successful response contract, rule thresholds, messages, ordering,
or Front behaviour.

The route is live: `OpportunitiesCard` reaches it through
`getClassOpportunities`. This is not dead-code cleanup.

## Evidence and current problems

The current handler mixes five responsibilities across roughly 240 lines:

1. HTTP parameter handling;
2. loading class analytics;
3. evaluating eleven business rules;
4. ordering and summarising the results;
5. serialising HTTP success and failure responses.

It also logs directly, exposes dependency error details from its catch block,
and has no strict boundary for the path parameter or unexpected query fields.
The embedded rule engine cannot be tested without Express and the analytics
dependency.

## Options considered

### Selected: ordered pure rule registry plus thin boundary

Represent each existing rule as a typed, ordered function returning either one
`OpportunityItem` or `null`. A pure derivation function evaluates the registry,
performs the existing stable priority ordering, and builds the summary.

This makes rules independently testable and additive while preserving their
current semantics.

### Rejected: move the existing handler unchanged

Moving 240 lines to another controller would reduce the original file but keep
the same mixed responsibilities, unsafe catch block, and untestable rules. It
would be cosmetic architecture.

### Rejected: generic cross-domain rules framework

A configurable rules platform would add abstractions, persistence, and runtime
configuration that this endpoint does not need. It would increase operational
risk without evidence of another compatible consumer.

## Architecture

### Strict route boundary

Reuse `classAnalyticsClassInput`, which already guarantees:

- a trimmed, non-empty `classId`;
- no query fields;
- no body fields;
- the shared NoSQL/prototype guard before Zod validation.

Mount the route with:

```ts
withValidatedInput(classAnalyticsClassInput, getClassOpportunities)
```

### Pure opportunity derivation

Create `src/services/analytics/classOpportunities.service.ts` with:

- the minimal analytics snapshot consumed by the rules;
- `OpportunityItem`, priority, summary, and response-data types;
- an ordered registry containing the eleven current rules;
- a pure `deriveClassOpportunities(snapshot, analysisDate)` function;
- `ClassOpportunitiesService`, depending only on a
  `ClassOpportunitiesReader` and injected clock.

The rule registry preserves all current thresholds and text:

- average engagement below 50;
- inactive rate above 30%;
- average progress below 40;
- health score below 60;
- low engagement distribution above 40%;
- progress above 0 and below 25;
- retention below 50;
- average engagement from 50 inclusive to 70 exclusive;
- activity rate from 70 inclusive to 90 exclusive;
- average engagement above 70;
- health score above 80;
- high engagement distribution above 60%.

The existing overlap between low progress and critical progress is preserved.
Changing or deduplicating business rules is outside this extraction.

Rules are evaluated in their current source order. Results are then sorted by
`high`, `medium`, `low`, `info`; equal priorities retain source order.

Division-based rules remain guarded by `totalStudents > 0`.

### Controller and runtime

Create a controller factory that receives a narrow service contract:

- success preserves `{ success, data, timestamp }`;
- no class preserves status 404 and `Turma não encontrada`;
- unexpected failures use the central error handler with code
  `CLASS_OPPORTUNITIES_READ_FAILED`;
- no raw dependency detail enters the public response.

Create an explicit runtime module that wires the existing `analyticsService`
as the reader. No import-time timer or external connection is introduced.

### Legacy removal

After route-level proof:

- remove `getOpportunities` from `analytics.controller.ts`;
- remove its local `OpportunityItem`, `Priority`, and `ClassParams` types when
  no longer referenced;
- remove it from `analyticsController`;
- update route-catalog evidence line numbers;
- prune ESLint bulk suppressions.

`benchmarks`, multi-platform analytics, and score recalculation are not part of
this cut.

## Contract

The successful `data` object remains:

```ts
{
  classId,
  className,
  totalOpportunities,
  opportunities,
  classMetrics: {
    totalStudents,
    activeStudents,
    averageEngagement,
    healthScore,
    averageProgress
  },
  summary: {
    highPriority,
    mediumPriority,
    lowPriority,
    positiveInsights
  },
  analysisDate
}
```

Every opportunity keeps the existing `type`, `priority`, `title`,
`description`, `suggestion`, and `impact`.

## Tests and negative proof

All tests run offline with injected readers and clocks:

1. boundary accepts a real encoded `:classId` and rejects empty/extra/operator
   input;
2. pure service proves every threshold edge, the intentional progress overlap,
   zero-student division guards, stable priority ordering, summaries, and
   timestamps;
3. controller proves success, 404, and redacted central 500;
4. route test proves the extracted handler is mounted instead of the legacy
   controller;
5. negative grep proves the legacy handler and local types are gone;
6. mutation checks prove route wiring, one representative threshold, stable
   ordering, and public error redaction.

The full offline gate remains:

```text
npm run lint
npm run types:check
npx jest --ci
npm run build
```

No real API or production Mongo access is permitted.

## Out of scope

- changing opportunity thresholds or copy;
- deduplicating overlapping opportunity rules;
- repairing `analyticsService` internals;
- changing the Front;
- redesigning `/api/analytics/benchmarks`;
- adding a generic rules engine.
