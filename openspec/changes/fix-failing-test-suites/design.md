## Context

A clean test matrix run produced: web 394/394 (green, out of scope); server
27–32 failures with a non-deterministic failing set across runs; camel 61/62
with one order-dependent failure. Three independent root causes were isolated
with controlled experiments and each independently confirmed by a peer-review
agent:

- **RC-1** — `server/vitest.setup.ts` connects every worker to one shared DB
  (`process.env.MONGO_URL ?? mongodb://mongo1:27017/gdfkube_test?replicaSet=rs0`)
  and runs a global `beforeEach` that does `deleteMany({})` over *all*
  collections. Vitest 2.1.9 defaults to the `forks` pool (parallel processes).
  Worker A's wipe destroys Worker B's freshly seeded fixtures mid-test.
  Evidence: Run A 32 fails vs Run B 27 fails (different sets);
  `--no-file-parallelism` → 2 fails.
- **RC-2** — commit `146f4d7` changed `Group.ts` `users`/`forms` from
  `{ type: [String], default: [] }` to `Schema.Types.Mixed` (no default). The
  data model deliberately moved to numeric counts (`groups.json` seeds
  `"users": 8`; SPA `src/types.ts` `Group.users: number`). The two failing
  tests still assert `[]` — stale expectations, not a runtime defect.
- **RC-3** — `OrgBootstrapIntegrationTest.outputDir_cleanedUpAfterSuccess`
  (~line 289) counts `bootstrap-cultura-*` in the JVM-global
  `java.io.tmpdir` under `@TestInstance(PER_CLASS)` with no per-test root, so
  it tallies residue from sibling tests. `OrgBootstrapRoute`'s success-path
  directory cleanup is correct and was previously live-verified.

Constraints (CLAUDE.md): prefer modifying existing files over adding new ones;
no throwaway helper scripts; keep changes simple; eliminate drift.

## Goals / Non-Goals

**Goals:**
- The server vitest suite is deterministically green across repeated runs with
  default parallelism preserved.
- `Group` model defaults and the two Group unit tests agree with the
  numeric-counts data model used by the seed data and the SPA.
- The camel suite is deterministically 62/62 across repeated runs.
- Every fix is confined to the file that owns the defect and gated by an
  explicit re-run verification.

**Non-Goals:**
- Any change to the green web suite.
- Any production change to `OrgBootstrapRoute` (its cleanup is correct).
- The optional `HelmValuesBuilder` values-file `/tmp` hygiene enhancement
  (separate, out of scope).
- A `docker compose down -v` rebuild — proven irrelevant to all three defects
  (server uses a separate `gdfkube_test` DB; camel uses Testcontainers).
- Introducing `mongodb-memory-server` / per-worker containerized Mongo.

## Decisions

**D1 — RC-1: per-worker DB via `VITEST_POOL_ID` (over serialization or
in-memory Mongo).** In `server/vitest.setup.ts`, derive the database name from
the base `MONGO_URL` plus a `process.env.VITEST_POOL_ID` suffix so each worker
owns an isolated database; keep the existing connect / `deleteMany` / disconnect
lifecycle otherwise unchanged. Chosen over `fileParallelism:false`
(permanently sacrifices parallel speed for the same correctness) and over
`mongodb-memory-server` (new dependency, replica-set setup cost, large blast
radius — disproportionate). One-line-class change to an existing test-infra
file; preserves speed; fully removes the race.

**D2 — RC-2: align model + tests to counts (`default: 0`), not revert to
arrays.** Set `users`/`forms` on `Group.ts` to default `0` (keeping `Mixed` or
narrowing to `Number`), and update `models.test.ts` and `groups.test.ts` to
assert the numeric-count contract. Reverting to `{ type: [String], default: [] }`
would re-introduce model/seed/SPA-type drift (rejected fork, recorded in
brainstorm.md). The tests are corrected to encode the real contract, not merely
silenced.

**D3 — RC-3: scope the assertion to the test's own artifact (test-only).**
Capture the temp directory associated with the exchange under test (exchange
property / returned `Exchange`) and assert that specific path is gone, or use a
per-test `@TempDir` root for the count. `OrgBootstrapRoute` is untouched.

**D4 — Independent, individually-gated fixes.** RC-1/RC-2/RC-3 touch disjoint
files in different languages with no shared state; they may be implemented and
verified in any order or in parallel. Each fix has a dedicated verification
(re-run the affected suite, RC-1/RC-3 twice to prove determinism).

## Risks / Trade-offs

- [RC-1: `VITEST_POOL_ID` unset in some pool configs] → Fall back to a stable
  default suffix (e.g. `'0'`) so a single-worker run still gets a valid,
  isolated DB name; verified by a serialized re-run also being green.
- [RC-1: many per-worker DBs accumulate on the shared `mongo1`] → keep the
  existing `afterAll` disconnect; drop the worker DB in `afterAll` so runs are
  self-cleaning rather than leaving N stray databases.
- [RC-2: changing test assertions could mask a real bug] → Mitigated by D2's
  rule that tests must encode the counts contract (assert numeric default),
  cross-checked against seed data and SPA `Group` type; peer-confirmed near-zero
  runtime blast radius.
- [RC-3: scoping hides a future real route leak] → the route's directory
  cleanup remains asserted, just per-exchange; the broad `/tmp` hygiene concern
  is explicitly tracked as a separate optional enhancement, not silently
  dropped.
- [General: residual flakiness after fixes] → each gate re-runs the suite
  (twice for the flaky ones) to confirm determinism before the change is
  considered done.

## Migration Plan

No runtime migration: production code and APIs are unchanged. Rollout is the
merge of test-infra/test/model-default edits. Rollback is a straight revert of
the change branch with zero data or API impact.

## Open Questions

- None blocking. D2's fork (counts vs arrays) is decided in favor of the counts
  model and recorded for redirection.
