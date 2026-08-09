# Decision Level Policy Design

## Objective

Extract the re-engagement level policy from `decisionEngine.service.ts` into a pure, typed module while preserving every current decision, tag, cooldown, dry-run, and execution behavior.

The extraction is architectural only. It does not introduce new levels, operators, cooldown rules, tags, database writes, API calls, or public contracts.

## Current boundary

`DecisionEngine.evaluateUserProduct` currently mixes three responsibilities:

1. loading context and metrics;
2. deciding level transitions and constructing tag mutations;
3. persisting cooldown and executing ActiveCampaign mutations.

The level decision block handles mutually exclusive paths:

- recent progress while already in a level;
- return to active status at zero inactive days;
- initial application or escalation to an appropriate level;
- maintenance of the current level;
- no level action.

The database write through `setCooldown` is interleaved with those decisions. The extraction separates the decision from that write without reordering the write relative to regular-rule evaluation or tag execution.

## Architecture

### `decisionLevelTypes.ts`

Owns the minimal contracts required by the policy:

- normalized level rule;
- recent-progress signal;
- policy input;
- policy result containing current/appropriate levels, decisions, tag additions/removals, and optional cooldown date.

The contracts contain no Mongoose documents or service types.

### `decisionLevelPolicy.ts`

Owns pure functions for:

- splitting raw internal rules into level and regular rules;
- inferring the current level from stored state and tags;
- finding the appropriate level from inactive days;
- calculating confidence;
- building the complete level mutation plan using an injected clock.

It imports no model, Mongoose, logger, environment, or ActiveCampaign client. Given the same input and clock it returns the same result.

### `decisionEngine.service.ts`

Remains the orchestration and effects boundary:

1. load context and metrics;
2. inspect existing cooldown and return early when active;
3. load the recent-progress signal;
4. call the pure level policy;
5. merge its decisions and tag mutations into `DecisionResult`;
6. persist the planned cooldown only inside the existing `if (!dryRun)` boundary;
7. evaluate regular rules, resolve conflicts, and execute decisions in the existing order.

`setCooldown` and `executeDecisions` remain effectful and are not moved into the policy.

## Behavioral invariants

- Existing cooldown returns before recent-progress lookup and regular-rule evaluation.
- Recent progress with a positive current level removes all level tags, creates `DESESCALATE`, and plans one day of cooldown.
- Zero inactive days with a positive current level removes all level tags, creates `REMOVE_TAG`, and plans one day of cooldown.
- A higher appropriate level removes other level tags, applies the target tag, preserves `APPLY_TAG` versus `ESCALATE`, confidence, rule identity, and configured/default cooldown.
- Equal positive levels retain the target tag in `tagsToApply`, remove other level tags, and create the existing non-executing maintenance decision.
- Null inactive days produce appropriate level zero and no threshold transition.
- Conflict resolution remains remove-wins and stays outside this module.
- The four current `if (!dryRun)` guards remain four. Each of the three cooldown writes stays in its existing branch and relative position; the final tag-execution guard is untouched.
- Unknown errors continue to be captured in `DecisionResult.errors` by the outer engine boundary.

## Testing strategy

### Pure characterization

Table-driven unit tests cover:

- rule splitting and automatic level numbering;
- explicit levels and thresholds parsed from condition strings;
- current-level inference from stored state and existing tags;
- no action with null inactivity;
- recent-progress de-escalation;
- zero-day return to active;
- first level application;
- escalation from one level to another;
- current-level maintenance;
- configured versus default cooldown duration;
- deterministic timestamps through an injected clock.

At least one policy branch receives a temporary mutation that produces RED before restoration.

### Integration characterization

`decisionEngineDryRun.test.ts` continues to prove that dry-run returns proposed mutations without calling cooldown persistence or ActiveCampaign mutation methods. Additional focused cases characterize non-dry-run cooldown placement if the current suite does not already cover it.

### Full gate

- `npm run lint:baseline:prune`
- `npm run lint`
- `npm run types:check`
- `MONGOMS_RUNTIME_DOWNLOAD=false npm test -- --runInBand`
- `npm run build`
- `git diff --check`
- lockfile diff must be empty
- pure-module forbidden-import and suppression scans
- exactly four `if (!dryRun)` guards in `decisionEngine.service.ts`

## Stop conditions

Stop and report instead of guessing if characterization reveals:

- two branches can write different cooldowns during one evaluation;
- the existing policy depends on mutation of a Mongoose document;
- moving the cooldown executor changes its order relative to regular-rule evaluation;
- a test exposes an undecided business rule rather than a typing or extraction issue.

## Expected result

The engine should fall from 890 lines to roughly 550-600 lines. The exact line count is secondary to preserving behavior and leaving the policy independently understandable and testable. ARCH-02 remains open until the residual engine is below the project's small-module threshold or its remaining orchestration is split into similarly cohesive boundaries.
