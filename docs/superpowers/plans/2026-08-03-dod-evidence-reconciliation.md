# DoD Evidence Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the hardening summary accurately reflect proven security, observability, and pagination slices while retaining every unresolved gap.

**Architecture:** One documentation-only implementation task replaces stale compound checkboxes with independently reviewable checked/open slices. A second task reviews the evidence and final mechanical count; runtime remains unchanged.

**Tech Stack:** Markdown, ripgrep, PowerShell, Jest, ESLint, TypeScript.

## Global Constraints

- Work only on branch `remake`.
- Modify only `docs/HARDENING-WORKPLAN.md` during implementation.
- Do not change runtime, tests, dependencies, routes, deployment files, or historical evidence sections.
- Do not close CORS, global central-error coverage, distributed limiter state/429 normalization, secondary JWT authority, legacy console migration, or remaining full-scan governance.
- Run offline without installs, network, external APIs, production Mongo, deployment, or push.
- Keep commits lowercase Conventional Commits.

---

### Task 1: Reconcile compound DoD checkboxes

**Files:**
- Modify: `docs/HARDENING-WORKPLAN.md`

**Interfaces:**
- Consumes: source/test evidence named in `docs/superpowers/specs/2026-08-03-dod-evidence-reconciliation-design.md`.
- Produces: exactly `85` checked and `19` open Markdown checkboxes (`104` total), with checked slices and open gaps adjacent.

- [ ] Mark the already-resolved dry-run decision checked without changing its explanatory text.
- [ ] Replace SEC-08 with two checked slices (Helmet/segmented single-instance rate limiting; body/upload/timeouts/non-root) and one open slice for distributed state, normalized 429 correlation envelope, and final CSP policy.
- [ ] Keep central-error global coverage open and add the concrete ad hoc response/detail gap.
- [ ] Mark the single-redactor/no-new-console guard checked; state that the legacy console baseline remains under TOOL-02.
- [ ] Split the JWT/debug/upload compound into one checked primary/startup/upload slice and one open debug/global-gating plus secondary-secret/fallback slice; keep `/api/curseduca/debug` without `localDebugOnly` explicitly open.
- [ ] Keep CORS open and state that static localhost/production defaults are still merged in production.
- [ ] Split pagination into one checked canonical HTTP-list slice with cap 200, cursor where needed, and explicit projections on migrated surfaces, and one open slice requiring noncanonical HTTP-list migration plus a machine-checked inventory; operational scans must use cursor/batch, and every `find({})` exception must be bounded or protected by an explicit machine-checked finite-set allowlist.
- [ ] Record the focused evidence: 14 suites/65 tests for perimeter/upload/observability/pagination and 5 suites/27 tests for JWT/CORS/Helmet.
- [ ] Count checkboxes and require `checked=85`, `open=19`, `total=104`, `percent=81.7`.
- [ ] Run `git diff --check` and commit as `docs: reconcile hardening evidence`.

### Task 2: Review and final gates

**Files:**
- Modify: `docs/HARDENING-WORKPLAN.md` only if review finds an inaccurate statement.

**Interfaces:**
- Consumes: Task 1 commit, focused outputs, and static evidence.
- Produces: reviewed checkbox truth and final offline repository proof.

- [ ] Review every new checked/open slice against source, wiring, focused tests, and named contradictions.
- [ ] Fix and re-review every Critical or Important finding.
- Provenance: Task 1 uses the recorded focused runs (**14 suites / 65 tests** for perimeter/upload/observability/pagination and **5 suites / 27 tests** for JWT/CORS/Helmet). Task 2 full lint, TypeScript ratchet, full offline Jest, and build remain **unclaimed/unchecked** until the controller runs them after the final fix/re-review on final HEAD; these remain hard gates.
- [ ] Confirm a clean worktree and no push/external-system use.
