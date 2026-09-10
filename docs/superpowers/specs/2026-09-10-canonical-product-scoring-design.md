# Canonical Product Scoring Design

**Date:** 2026-09-10

**Status:** Approved in chat; pending user review of this written specification

**Owner:** BO2_API remake

## 1. Purpose

Build a trustworthy analytics foundation that helps Product Management improve each product and the customer's journey through it. The backend will preserve provider-native signals, normalize them into shared dimensions, calculate explainable internal scores, and expose weekly read models to the Front.

The system must distinguish:

- provider-native values;
- internal dimension scores;
- an absolute internal score from 0 to 100;
- a relative rank among comparable learners;
- an action state such as healthy, attention, at risk, or indeterminate;
- data coverage, freshness, and confidence.

Missing data is never equivalent to zero.

## 2. Scope and delivery order

Version 1 covers, in order:

1. canonical contracts and persistence;
2. Hotmart adapter;
3. CursEduca adapter;
4. Guru adapter;
5. weekly snapshots and experimental scoring;
6. internal read endpoints;
7. Front dashboard consumers.

Discord is explicitly excluded from version 1. It will be implemented last through the separate API that owns the Riquinhos Discord bot. The current BO2_API must not pretend that legacy Discord fields prove continuous community activity.

## 3. Rejected approaches

### Patch the existing score fields

Rejected because the current implementation contains several score sources, provider-specific heuristics, mixed grains, and cases where missing values become zero. Patching these independently would preserve contradictory definitions.

### Split the score into common fields and provider-specific fields

Rejected as the primary composition model. A fixed common/specific split can double-count correlated behaviour and reward providers merely for returning more fields.

### Full event warehouse now

Deferred. It offers maximum flexibility but adds unnecessary operational and storage complexity before the canonical contracts and score semantics are proven.

## 4. Chosen architecture

The chosen design is a canonical, dimension-based scoring module with provider adapters at a stable seam.

### 4.1 Provider adapter interface

Each provider adapter converts native payloads into canonical observations. Provider authentication, pagination, retries, field names, and response quirks remain inside the adapter implementation.

Conceptual interface:

```ts
interface ProviderMetricsAdapter {
  collect(context: CollectionContext): Promise<CollectionResult>
}
```

`CollectionResult` contains observations, source freshness, coverage diagnostics, pagination completeness, and non-secret error details. Callers do not learn provider-specific transport behaviour.

### 4.2 Canonical records

`MetricObservation` represents one normalized signal while preserving provenance:

- learner identity;
- product identity;
- provider;
- metric key;
- canonical dimension;
- normalized value when valid;
- native value or a safe structured projection;
- source event time;
- collected time;
- quality state: `observed`, `missing`, `stale`, `invalid`, or `not_supported`;
- source identity for deduplication;
- adapter contract version.

`StudentProductWeeklySnapshot` stores dimension results for one learner, one product, and one ISO week.

`ProductWeeklySnapshot` stores product-level distributions, trends, and health results for one product and one ISO week.

`ScoreDefinition` stores product profile, supported dimensions, signal weights, dimension weights, thresholds, and formula version.

`ScoreResult` stores:

- `score: number | null`;
- dimension breakdown;
- relative percentile/rank when eligible;
- action state;
- coverage;
- freshness;
- confidence;
- formula version;
- positive and negative reasons;
- missing or stale signals.

### 4.3 Idempotency and history

Canonical observations use a stable provider/source identity where the provider supplies one. Weekly snapshots are unique by learner, product, week, and score version. Re-running the same week updates the same versioned snapshot without creating duplicates.

Changing a formula creates a new score version. Historical scores are not silently rewritten or deleted.

## 5. Provider capability model

The final signal catalogue and weights are derived from adapter contract tests and reviewed provider payload fixtures. Documentation alone proves capability, not tenant-specific availability.

### 5.1 Hotmart

Validated capabilities include learner status/type, purchase and access dates, access count, native engagement classification, lesson/module progress, transaction state, sales, refunds, chargebacks, and subscription lifecycle where available.

Primary grains:

- learner in Members Area;
- learner plus content for progress;
- transaction for commercial events;
- product plus month for existing sales aggregates.

The native engagement label and access count may be correlated. They must not be counted independently until correlation and semantics are validated.

### 5.2 CursEduca

Validated capabilities include members, groups, membership situation, access history, last access, progress, lesson completion, assessments, and certificates where the tenant endpoints return them.

Primary grains:

- learner;
- learner plus group/product;
- learner plus access event;
- learner plus content/progress event.

Existing derived engagement formulas are not canonical evidence. A missing progress field must remain missing rather than becoming zero.

### 5.3 Guru

Validated capabilities include subscriptions, plans, cycles, transactions, confirmed payments, gross/net values, currency, trials, cancellations, refunds, chargebacks, and renewal lifecycle where returned.

Primary grains:

- customer plus product plus plan;
- transaction/cycle;
- product plus month for existing aggregates.

Guru contributes strongly to commercial and retention dimensions. It does not prove learning engagement or content progress.

### 5.4 Discord

Deferred to a separate design and implementation against the Discord bot API. Its future adapter may provide messages, reactions, member lifecycle, and voice participation, subject to the bot's stored history, permissions, and identity mapping.

## 6. Scoring semantics

### 6.1 Canonical dimensions

Learner/product scoring can use:

- activation;
- engagement;
- progress or journey;
- consistency;
- retention.

Product scoring can additionally use a separate commercial dimension.

Commercial results never affect an individual learner's engagement score.

### 6.2 Signal and dimension scores

Every signal belongs to exactly one dimension for a score version. Provider-native scores remain visible but are not automatically added to the internal score.

For observed, valid signals:

```text
dimensionScore =
  sum(signalScore * signalWeight * reliability)
  / sum(observed effective weights)
```

Coverage remains separate:

```text
coverage =
  sum(observed expected weights)
  / sum(all expected weights for the product profile)
```

The internal score is:

```text
internalScore =
  sum(dimensionScore * productProfileDimensionWeight)
```

Only dimensions supported by the product profile participate. Product profiles explicitly define weights that sum to 100; the implementation must not silently redistribute an unsupported dimension at runtime.

### 6.3 Product profiles

Initial profiles are:

- OGI/course: activation, engagement, progress, consistency, retention;
- Clareza/subscription learning: activation, engagement, recurring usage, consistency, retention;
- product health: learner journey distribution, activation, retention, engagement trend, completion or recurring usage, and commercial health.

Exact weights are configured only after real field coverage is measured. Until then, a score definition remains experimental and cannot produce definitive action states.

### 6.4 Score, rank, and action state

- Absolute score measures performance against the versioned product profile.
- Relative rank compares only learners in the same product and journey stage.
- Action state uses absolute evidence and coverage; it is not inferred from rank alone.

A learner can have a low relative rank in a healthy cohort without being at risk.

### 6.5 Missingness and eligibility

- `not_supported`: excluded from expected coverage for that product profile.
- `missing`: expected but not received; lowers coverage.
- `stale`: received but older than the accepted freshness window; lowers coverage and confidence.
- `invalid`: received but fails validation; lowers coverage and creates a diagnostic.
- observed zero: a real zero and eligible for scoring.

Without valid signals, `score` is `null` and state is `indeterminate`. A definitive rank or action state is withheld when the score definition's minimum coverage is not met.

## 7. Cadence and freshness

Existing operational jobs remain independent. The design does not slow or duplicate Hotmart/CursEduca syncs used by other workflows.

A separate weekly analytics snapshot reads canonical persisted data and calculates scores. It does not perform a second full provider sync. The target cadence is weekly, with data marked stale after eight days unless a provider-specific contract requires a stricter limit.

The initial calibration lasts 15 days:

- day 0: baseline snapshot;
- day 7: weekly checkpoint;
- day 15: final calibration snapshot.

These snapshots reuse persisted provider data and do not require extra provider calls.

## 8. Experimental calibration

During the 15-day period, results are labelled experimental. Calibration evaluates:

- coverage by provider, product, dimension, and journey stage;
- duplicate or highly correlated signals;
- invalid and stale rates;
- score distribution and concentration;
- relationship with observed completion, renewal, cancellation, and inactivity;
- stability between snapshots;
- identity-match coverage across learner, product, subscription, and transaction records.

The Front may show experimental scores, coverage, version, and reasons, but must not present definitive intervention labels during calibration.

The system exits experimental status only after the day-15 review confirms that the selected signals are interpretable, coverage is sufficient for the intended products, and no critical data-quality finding remains. Time alone does not activate definitive ranks.

## 9. Failure handling

- Adapter failures are isolated by provider.
- A failed run never deletes the previous valid snapshot.
- Partial collection is explicitly marked and cannot masquerade as complete.
- Incomplete pagination makes the provider result partial or failed according to its contract.
- Provider rate limits use bounded retry behaviour already supported by the integration; no unbounded retry loop is introduced.
- Invalid field values are quarantined as diagnostics rather than coerced into valid scores.
- Failed identity joins remain visible in coverage diagnostics.
- Secrets and raw credentials are never persisted in observations or diagnostics.
- The weekly job records start, completion, provider status, counts, duration, score version, and failure reason.

## 10. Read interface for the Front

The Front receives prepared read models and performs no score calculation.

Responses include:

- current and previous weekly values;
- dimension breakdown;
- native provider signals selected for display;
- internal score and experimental/definitive state;
- rank eligibility and cohort description;
- coverage, freshness, confidence, and formula version;
- concise reasons and missing-signal diagnostics.

Existing endpoints remain available until the new read interface has demonstrated equivalent or better coverage. Removal of legacy analytics is a separate, reviewed ticket.

## 11. Verification strategy

Implementation follows TDD with real RED/GREEN evidence.

Required test groups:

1. sanitized fixture contracts for Hotmart, CursEduca, and Guru;
2. adapter mapping tests at the canonical interface;
3. null versus observed-zero regression tests;
4. deterministic pure score calculations;
5. product-profile and journey-stage cohort tests;
6. rank eligibility and minimum-coverage tests;
7. freshness and stale-transition tests;
8. weekly idempotency and score-version history tests;
9. incomplete pagination and provider-failure isolation tests;
10. identity join and orphan diagnostics;
11. legacy endpoint compatibility tests;
12. read-interface contract tests against the Front root.

Provider fixtures must be sanitized and committed without credentials or production identifiers. Live provider, Mongo, deployment, and browser validation remain separate authorization-gated activities.

## 12. Rollout and stop conditions

Each stage is a separate ticket with its own tests, commit, review, and push authorization.

Stop the rollout when:

- a provider contract cannot distinguish missing from zero;
- pagination completeness cannot be proven;
- identity mapping would merge different people or products;
- a formula double-counts correlated evidence;
- coverage is insufficient for a definitive result;
- existing operational sync behaviour would be changed without an explicit migration plan;
- a new score cannot be reproduced from its stored version and inputs.

No stable promotion, provider execution, Mongo mutation, Discord integration, or legacy removal is authorized by this specification alone.
