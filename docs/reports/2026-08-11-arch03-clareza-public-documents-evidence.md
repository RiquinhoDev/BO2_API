# ARCH-03 Clareza public-document evidence ledger

**Recorded:** 2026-08-11
**Baseline producer commit:** `b300df5fa6fb0450fd57dfd94ea77cb1f2ec00d2`
**Scope:** Task 3 protects route response representation only. It made no
controller or service production diff and did not contact FMP, Redis, or MongoDB.

## Task 3 contract responsibility

The fixture records 15 requests across the finite 13 public GET identities. Task
3 asserts each controller's status, cache header, JSON versus raw serialization,
exact selected fixture body, and absence of a canonical
`{ success: true, data: <selected document> }` wrapper. Raw feeds compare
`res.send` text byte-for-byte; JSON feeds compare Express canonical JSON
serialization.

This is not a universal financial-data snapshot task. Dynamic/cache-backed record
values remain owned by their existing service suites. The fixture provenance is
explicit: cache-seeded passthrough, one derived Raio-X search, shared producer,
existing injected-port test, or unexecuted slow diagnostic.

## Boundary evidence

Cache-seeded boundary checks execute the real cache paths for `/data`, `/top10`,
`/earnings/data`, reit, reit valuation, stock, and the serialized Raio-X ticker
feed. They prove representation passthrough only, not the financial correctness
of the seeded record. The Raio-X search is independently derived from a mocked
cached index; its RED run corrected the fixture to uppercase the query and retain
all index fields.

Raio-X symbol/search share the ticker/index producers. Carteira and comparator
retain their existing injected-port service coverage. The diagnostic is deliberately
not executed: production sleeps 300ms for every fixed ticker and is a manual FMP
operation. These are provenance limits, not claims of universal output equality.

## Shape policy

Fixed JSON document keys reconcile to the reviewed catalog. Data-dependent cache
records are explicit exceptions. `/comparador` has two query-selected documents,
so its single catalog decision stores their union while each fixture preserves the
selected variant.