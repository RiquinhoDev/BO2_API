# Decision context boundary

## Objective

Reduce `decisionEngine.service.ts` below the repository limit of 500 physical
lines without changing ActiveCampaign behavior, public APIs, cooldown order or
`dryRun` semantics.

## Boundary

Extract two cohesive responsibilities:

1. `decisionContextLoader.ts` loads `UserProduct`, `User`, `Product`, `Course`
   and active `TagRule` documents, then adapts persisted rules to the existing
   internal rule contract.
2. `decisionMetrics.ts` derives decision metrics from a loaded context and an
   injected clock/activity reader. It performs no writes.

The engine remains the application service. It owns evaluation order,
cooldowns, conflict resolution, decision execution and the four existing
`if (!dryRun)` write guards.

## Contracts and dependencies

- Shared model-free decision types move to a dedicated type module.
- The loader receives narrow repository ports. Its runtime adapter alone imports
  Mongoose models.
- Metrics receive time explicitly and preserve null learner activity semantics.
- Rule adaptation preserves condition compatibility, priority, action, tag and
  cooldown defaults exactly.
- Missing UserProduct, User or Product keeps the current public error.

## Rejected alternatives

- Extracting only date helpers leaves persistence, mapping and policy mixed.
- A generic repository expands scope without helping this use case.
- Moving cooldown or tag writes is not required for the 500-line limit.

## Verification

1. Characterize rule adaptation and metrics before moving production code;
   prove RED with a semantic mutation and restore GREEN.
2. Keep level-policy, condition-language and dry-run suites green.
3. Scan pure metrics for models/API/env, `any`, casts and suppressions.
4. Run lint, strict TypeScript, complete offline Jest and build.
5. Require the engine and every new handwritten file to stay at or below 500
   physical lines.

## Stop conditions

Stop if extraction exposes a different persisted rule shape, changes effect
ordering or requires a new business default. Never access real integrations.
