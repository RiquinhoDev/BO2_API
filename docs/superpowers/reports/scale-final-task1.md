# SCALE final Task 1 report

Date: 2026-08-12
Branch: `remake`
Scope: `products.users-full-set`, `heatmap.quick`, `heatmap.cohort`, `course-lessons.grouped`

## Outcome

- `course-lessons.grouped`: implemented. The endpoint still returns one complete grouped envelope, with identical module/lesson cardinality and order. Reads now use complete 200-row composite-cursor batches ordered by `moduleSequence`, `lessonSequence`, `_id`; no truncation was introduced.
- `products.users-full-set`: implemented after review. The endpoint preserves its complete response envelope and natural driver iteration order while replacing the truncating `limit(50000)` with a lean cursor using `batchSize: 200`.
- `heatmap.quick`: ejected as a stale inventory identity. `getEngagementHeatmap` performs no population read: it returns a fixed four-week, 28-cell mock generated locally. There is no full-set database materialization to batch or aggregate without changing product semantics.
- `heatmap.cohort`: ejected as already complete. The live Front consumes the complete cohort array, while `calculateCohortRetention` already performs one set-based Mongo aggregation over the full filtered population, sorts all cohort rows, and enables `allowDiskUse(true)`. Adding cursor batching would be redundant and less direct.

## Consumer evidence

- Products: no sibling Front source reference was found. The backend route remains live and returns the same complete user array plus totals/debug counts; no Front change was needed.
- Quick heatmap: sibling Front `EngagementHeatmap.tsx` calls `/dashboard/quick/engagement-heatmap`; the backend handler contains no model read.
- Cohort: sibling Front `useCohortAnalytics.ts` calls `/analytics/cohort`, and `CohortRetentionHeatmap.tsx` maps the complete returned array.
- Course lessons: sibling Front `courseLessons.service.ts` calls `GET /course-lessons`; its schema requires `{ data: { modules: [...] }, meta: { totalLessons } }`, with no pagination fields.

## Genuine RED/GREEN

RED: `npm.cmd test -- --runInBand tests/controllers/courseLessonsScalability.test.ts`

- Expected failure after test-double compilation was corrected: 10,000/10,000 records and order were preserved, but `requestedLimits.length` was `0`, proving the production read was unbounded.

GREEN:

- `npm.cmd test -- --runInBand tests/controllers/courseLessonsScalability.test.ts tests/controllers/courseLessonsErrorContract.test.ts`
- Result: 2 suites passed, 5 tests passed.
- The lesson 10k proof now executes every lexicographic cursor branch across repeated module/lesson sequence ties, asserts exact equivalence, uniqueness, stable sort and request limits `<= 200`. A separate product 10k proof asserts exact full-array order, total metadata, `batchSize: 200`, and absence of the old limit path.

Additional proof:

- `npm.cmd test -- --runInBand tests/scalability/scale02PartitionA.contract.test.ts`
- Result: 1 suite passed, 6 tests passed, including the existing one-aggregate cohort proof.
- `git diff --check`: passed (line-ending warnings only).
- `npm.cmd run types:check`: passed.
- `npm.cmd run lint`: exited 0; ESLint reported an existing unused-suppressions notice.
- `npm.cmd run build`: passed.

## Files owned by this commit

- `src/controllers/courseLessons.controller.ts`
- `tests/controllers/courseLessonsScalability.test.ts`
- `tests/controllers/courseLessonsErrorContract.test.ts`
- `tests/controllers/productUsersScalability.test.ts`
- `src/controllers/products/products.controller.ts`
- `src/models/CourseLesson.ts`
- `docs/superpowers/reports/scale-final-task1.md`

No inventory, generator, workplan, package, lockfile, or Front file was changed. No push was performed.
