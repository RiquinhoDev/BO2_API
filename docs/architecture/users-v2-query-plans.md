# Users V2 enrollment query plans

**Measured:** 2026-07-31

**Runtime:** MongoDB 8.2.6 via `MongoMemoryServer`, runtime download disabled

**Pipeline:** `buildUsersV2EnrollmentPipeline()`
**Fixture:** 1,200 users and 1,200 `UserProduct` documents

## Measurement method

The regression test executes the production pipeline with:

```ts
UserProduct.aggregate(pipeline)
  .option({ maxTimeMS: 120_000, allowDiskUse: false })
  .explain('executionStats')
```

The source ratio uses the initial `$cursor` values. Lookup examinations are
reported separately because the aggregation returns one faceted document;
using that final `nReturned` as the denominator would misrepresent source
selectivity. The fixture is deterministic:

- `productId + status`: 20 matches (1.67%);
- `platform + status`: 20 matches (1.67%);
- engagement score `90..100`: 50 matches (4.17%);
- progress percentage `80..100`: 50 matches (4.17%);
- default: all 1,200 enrollments.

All selective shapes therefore match at most 10% of the fixture.

## Evidence

| Shape | Index before | Before returned/docs/keys | Index after | After returned/docs/keys | Source docs per match | Lookup docs/keys after | Spill |
|---|---|---:|---|---:|---:|---:|---|
| `productId + status` | `productId_1_status_1` | 20 / 20 / 20 | unchanged | 20 / 20 / 20 | 1x | 41 / 41 | no |
| `platform + status` | `platform_1` | 20 / 300 / 300 | `users_v2_platform_status` | 20 / 20 / 20 | 1x (was 15x) | 41 / 41 | no |
| engagement `90..100` | `engagement.engagementScore_-1` | 50 / 50 / 50 | unchanged | 50 / 50 / 50 | 1x | 101 / 101 | no |
| progress `80..100` | `progress.percentage_-1` | 50 / 50 / 50 | unchanged | 50 / 50 / 50 | 1x | 101 / 101 | no |
| default | `COLLSCAN` | 1,200 / 1,200 / 0 | unchanged | 1,200 / 1,200 / 0 | 1x | 1,251 / 1,251 | no |

The indexed winning plans contain `IXSCAN`, `FETCH` and
`PROJECTION_DEFAULT`. The default winning plan contains `COLLSCAN` and
`PROJECTION_DEFAULT`. No measured aggregation sort used disk or reported a
spill.

The only failing BEFORE condition was `platform + status`: the `platform_1`
plan examined 300 documents for 20 source matches. Adding:

```ts
{ platform: 1, status: 1 }
```

with the stable name `users_v2_platform_status` reduced documents and keys
examined from 300 to 20 without changing result semantics.

## Index decision

Only `users_v2_platform_status` was added. It is the smallest equality prefix
proved by the BEFORE/AFTER result. It adds one compound index to writes and
storage, so it should be created and observed as an explicit deployment
operation before relying on it under production load.

`platform` is first intentionally. It preserves prefix utility for
platform-only listing filters, while the existing `status_1` index remains
available for status-only filters. With equality on both fields either order
has the same bounds for the measured combined shape; there was no evidence for
duplicating the index in the reverse order.

The following alternatives were rejected:

- no new product, engagement or progress indexes: their existing plans already
  examine one source document per match;
- no index for the default listing: enumerating the complete resource is
  intentionally linear;
- no `userId` or `_id` suffix on the new index: the pipeline groups and sorts
  after filtering, and the explain supplied no evidence that either suffix
  removes a blocking stage;
- no speculative compound indexes for every filter combination: they were not
  exercised by a failing representative shape;
- no ordinary `User.name`/`User.email` B-tree index for search: the current
  case-insensitive, unanchored literal substring contract cannot use it
  selectively.

Existing duplicate-schema warnings for unrelated Product Guru indexes and the
pre-existing duplicate `UserProduct { userId, productId }` declaration were
observed but not changed. The explain fixture deduplicates equal declared keys
only when constructing its ephemeral index set, preferring the unique
declaration. That keeps the test deterministic without changing production
schema behavior or widening this evidence-based task.

## Bounded scan exceptions

The default listing is allowed to scan all 1,200 source documents because it
lists the resource without a selective filter.

Literal substring search for `Plan User 1199` also examined all 1,200 source
documents and zero source keys. Its lookup work was 1,202 documents/keys and it
did not spill. This is an intentional compatibility exception: the reader
escapes the client value, runs with `maxTimeMS: 120_000`, and keeps
`allowDiskUse: false`.

Search must be migrated only when there is a design that preserves
case-insensitive literal substring semantics across both name and email. The
trigger is an approved normalized-search field plus backfill/index lifecycle,
or a managed-search equivalent, with representative explain evidence showing
bounded work. Until that trigger is met, search remains an explicit
time-bounded scan rather than receiving a misleading speculative index.

## Railway pre-deploy index verification

The application does not run index maintenance at startup. Use the dedicated
idempotent command as a Railway one-off against the intended service database.
`MONGO_URI` must be supplied by Railway's secret environment and is never
printed by the command. The package command executes the compiled
`dist/scripts/maintenance/ensure-users-v2-indexes.js` artifact shipped by both
Docker and Nixpacks, so it belongs in Railway's post-build/pre-deploy step.

1. Inspect without mutation:

   ```sh
   npm run maintenance:users-v2-indexes
   ```

   An absent index reports `status: "missing"`. An exact existing index reports
   `status: "verified"`. A conflicting name, key or option exits non-zero.
   On a first deployment where `userproducts` does not exist yet, only MongoDB
   `NamespaceNotFound` is treated as an empty index catalog; inspect mode leaves
   the collection absent. Authentication, connectivity and all other catalog
   errors remain fatal.

2. If and only if the inspection reports `missing`, apply explicitly:

   ```sh
   USERS_V2_INDEX_APPLY=true npm run maintenance:users-v2-indexes
   ```

   The command lists indexes first, creates only
   `users_v2_platform_status`, lists again, and exits successfully only after
   verifying the exact key and safe options. If the collection is absent,
   MongoDB creates it as part of this explicitly gated index creation.

3. Re-run the default inspection and require `status: "verified"`:

   ```sh
   npm run maintenance:users-v2-indexes
   ```

4. Deploy the application revision only after that verification. Observe index
   build duration, database load and subsequent query telemetry through the
   normal Railway/Mongo operational tooling.

The current application does not set `autoIndex: false`; under the current
Mongoose default that leaves `autoIndex: true`. This is a fallback risk, not a
deployment guarantee: startup index creation can race traffic, fail because of
existing conflicting declarations, or be disabled by environment policy. This
change deliberately does not alter global `autoIndex`. The one-off
inspect/apply/verify sequence must complete before the application deploy;
automatic startup behavior must not be credited as proof that the index
exists.

## Regression gate

`tests/services/users/mongooseUsersV2Enrollment.explain.test.ts` rebuilds the
ephemeral indexes from the model declarations and fails when:

- a selective source returns zero fixture matches;
- a selective shape exceeds 10% of the fixture;
- its expected production index is absent from the winning plan;
- source documents examined exceed ten times source matches;
- default or substring search examines more than the fixture;
- any aggregation stage reports disk use or spill counters.

The test writes no evidence file and never connects to an external database.
