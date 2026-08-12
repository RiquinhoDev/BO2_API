# Scalability Round One - Task 3

## Result

Four decisions were reviewed offline with fake boundaries. One safe read-only fan-out was changed; three provider/compensating-write units remain sequential.

### `activecampaign.manual-actions` - bounded reads, ordered writes

Active `UserProduct` reads are independent by product. `loadActiveUserProductsBounded` starts at most 10 reads and exposes one result promise per product index. The controller awaits only the current index, then traverses that product's user-products in the original order; a later hung read cannot block an earlier ready product. `decisionEngine.evaluateUserProduct` remains strictly sequential, so external actions, counters, and error ordering are unchanged.

Focused tests cover N=1/10/100, peak concurrency <=10, complete indexed cardinality, an indexed read failure, and progress when a later read hangs. Existing controller coverage proves a user failure does not stop the next item and preserves execution counters/audit details.

RED: the focused suite first failed because `loadActiveUserProductsBounded` did not exist. A self-review RED then timed out after 30 seconds because an await-all implementation let a later hung read block the earlier result; 8 other tests passed.

GREEN: indexed result promises removed the await-all barrier; `tests/controllers/activeCampaignOps.controller.test.ts` passed 9/9 and `npm.cmd run types:check` exited zero.

### `native-tags.compensating-writes` - ejected

`captureNativeTagsBatch` calls `captureNativeTags` sequentially and pauses 1,000 ms between configured batches. Each item couples an ActiveCampaign tag read with snapshot creation/update, diff calculation, ordered history append (`ADDED` then `REMOVED`), timestamps, sync count, and save. There is no stable idempotency key or transaction spanning provider state and snapshot/history. Parallelizing the read separately would allow an older provider result to overwrite a newer snapshot and reorder history/timestamps. The compensating unit remains sequential.

### `testimonial-tags.ordered-provider` - ejected

Each user executes contact lookup/create, ordered old-tag removals, ordered new-tag additions, partial per-tag error accounting, and only then writes `lastSyncedAt`. Removal failures deliberately do not abort additions. There is no stable operation idempotency key spanning remove/add/local sync state. Concurrency within or across this unit could reorder provider effects and change which partial outcome is marked synchronized. It remains sequential.

### `weekly-tags.snapshot-writes` - ejected

The weekly flow has an explicit provider budget: 50 emails per batch with a 1,000 ms delay between batches. For each email it reads provider tags, creates the weekly snapshot, loads the previous snapshot, computes changes, then builds critical-change entries in traversal order. Grouped notifications and cleanup run after all snapshots. Snapshot uniqueness/idempotency and provider-aware rate ports are not established here; bounded concurrent reads would bypass the existing throttle and can reorder snapshot/history/change aggregation. It remains sequential.

## Safety and scope

- No real ActiveCampaign, Mongo, or network call.
- No provider write was parallelized.
- No inventory, generator, workplan, package, lockfile, or Front file changed.
- Concurrency is validated as finite/positive and capped at 10.
- Other workers' worktree changes were not staged or reverted.

## Verification

- `npm.cmd test -- --runInBand tests/controllers/activeCampaignOps.controller.test.ts --silent`: 1 suite, 9/9 passed.
- `npm.cmd run types:check`: exit 0.
