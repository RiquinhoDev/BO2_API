# Tooling explicit-any reduction

Date: 2026-08-12

- RED: terminal assertion observed 375 no-explicit-any suppressions.
- Closed: 103 explicit-any suppressions across DTOs, Mongo query shapes, populated documents and unknown external payload guards.
- Remaining: 272 no-explicit-any; no casts to any, inline disables or weakened tests introduced.
- Global baseline: 450/118 files -> 347/103 files.
- Hard residue includes multi-consumer UserProduct DTOs, achievement persistence DTOs, provider compensation flows and historical polymorphic models.
