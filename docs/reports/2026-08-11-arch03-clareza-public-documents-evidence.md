# ARCH-03 Clareza public-document evidence ledger

**Recorded:** 2026-08-11
**Baseline producer commit:** `b300df5fa6fb0450fd57dfd94ea77cb1f2ec00d2`
**Scope:** offline contract characterization only; no external FMP, Redis, or MongoDB connection.

## Contract evidence

The fixture records 15 concrete requests across the finite 13 public GET
identities. Every entry records status `200`, cache expectation, JSON versus raw
serialization mode, and the producer boundary used as evidence.

Direct offline producer assertions cover 8 identities / 9 concrete requests:

- `/data`, `/top10`, `/earnings/data`;
- `/reit/:ticker`, `/reit-valuation/:ticker`, `/stock/:ticker` through their
  typed-configured cache paths;
- `/raiox/:ticker` raw cache path and `/raiox-search` cached-index construction.

The Raio-X search producer RED exposed the prior fixture error: it uppercases
the query and preserves all cached-index fields. The fixture was corrected from
that observed result before the router GREEN run.

The remaining fixture provenance is intentionally limited to existing producer
contracts rather than a new controller seam: Raio-X symbol/search share the
tested raw/index producers; carteira data/search are covered by the injected
`ClarezaCarteiraService` tests; comparator symbols/search are covered by its
injected store-port tests; diagnose remains a manual FMP diagnostic and was not
run because its production loop deliberately sleeps 300ms for each fixed ticker.

## Shape policy

For fixed JSON documents, fixture top-level keys equal the reviewed catalog
decision. Cache/raw documents and the reit/stock cache records are explicitly
marked data-dependent. `/comparador` is also explicit: one route identity has
two query-selected documents, so the catalog records their union while each
fixture asserts its selected document.

Router tests assert raw `res.send` text byte equality only for serialized feeds;
JSON routes assert Express's canonical JSON serialization. The wrapper guard
only rejects an actual `{ success: true, data: <expected document> }` envelope,
allowing an independently meaningful `success` or `data` field.
