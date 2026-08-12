# Tooling no-console closure

Date: 2026-08-12

- Scope: all 49 files carrying the remaining 186 no-console suppressions.
- RED: productSalesStatsBuilder reported 23 no-console errors without the suppression baseline.
- Change: console.log/error/warn migrated mechanically to the canonical redacting logger with severity preserved.
- Result: no-console 186 -> 0; global suppressions 636/144 files -> 450/118 files.
- Ratchet: old expected total 636 failed with received 450; updated baseline additionally requires no-console=0.
- No explicit-any suppressions were credited or weakened in this block.
