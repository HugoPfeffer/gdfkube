## Design Summary

A clean rebuild test run surfaced three independent defects across the
`gdfkube-itsm` server suite and the `gdfkube-camel` suite. The web suite
(394/394) is green and out of scope. Each defect was root-caused with
controlled experiments and independently confirmed by peer review:

- **RC-1 (server, flaky, ~25–30 tests):** Vitest runs test files in parallel
  worker processes (vitest 2.1.9 default pool = `forks`); all workers share one
  MongoDB database `gdfkube_test`; the global `beforeEach` in
  `server/vitest.setup.ts` does `deleteMany({})` over *all* collections. One
  worker's wipe destroys another worker's freshly-seeded fixtures mid-test.
  Evidence: identical commands produced 32 vs 27 failures with different
  failing sets; `--no-file-parallelism` collapsed failures to 2.
- **RC-2 (server, deterministic, 2 tests):** `server/src/models/Group.ts`
  regressed in commit `146f4d7` — `users`/`forms` changed from
  `{ type: [String], default: [] }` to `Schema.Types.Mixed` (no default), so
  omitted fields are `undefined` not `[]`. The data model intentionally moved
  to **numeric counts** (`groups.json` seeds `"users": 8`; SPA `Group` type is
  `users: number`), so the two failing tests carry stale `[]` expectations.
  Runtime blast radius is near-zero (one cosmetic admin-table cell).
- **RC-3 (camel, flaky/order-dependent, 1 test):**
  `OrgBootstrapIntegrationTest.outputDir_cleanedUpAfterSuccess` counts
  `bootstrap-cultura-*` entries *globally* in the shared JVM `java.io.tmpdir`
  under `@TestInstance(PER_CLASS)` with no per-test temp root, so it tallies
  residue from sibling tests / prior runs. The route's success-path directory
  cleanup is correct and was previously live-verified; this is a test-isolation
  defect, not a product bug.

The three fixes are independent (different languages, files, no shared state)
and individually low-risk.

## Alternatives Considered

### Option A: Targeted per-defect fixes (chosen)
- **Approach**: RC-1 → suffix the test DB name with `process.env.VITEST_POOL_ID`
  in the existing `server/vitest.setup.ts` (per-worker DB isolation, keeps
  parallel speed). RC-2 → align `Group.ts` to the counts model
  (`Schema.Types.Mixed` + `default: 0`) and update the two stale test
  assertions. RC-3 → scope the camel assertion to the temp dir created by the
  test's own exchange (test-only).
- **Pros**: Minimal surface; each touches the one file that owns the defect;
  no new dependencies; preserves parallel test performance; no production code
  change for RC-3; aligns model + seed + frontend type for RC-2.
- **Cons**: RC-2 edits test expectations (must be done carefully to encode the
  real contract, not silence the test).
- **Why not chosen**: It *is* chosen.

### Option B: Serialize the server suite
- **Approach**: Set `fileParallelism: false` (or `pool:'forks',
  poolOptions.forks.singleFork`) in `server/vitest.config.ts` to fix RC-1.
- **Pros**: One-line config; trivially correct for RC-1.
- **Cons**: Sacrifices parallel test execution speed permanently; masks rather
  than isolates the shared-state design; still leaves RC-2 and RC-3.
- **Why not chosen**: Per-worker DB (Option A) removes the race *and* keeps
  parallelism; serialization is a performance regression for the same outcome.

### Option C: Ephemeral in-memory / containerized DB per worker
- **Approach**: Replace the shared `mongo1` connection with
  `mongodb-memory-server` or a Testcontainers Mongo per worker.
- **Pros**: Total isolation; tests no longer depend on the running stack.
- **Cons**: New dependency and significant test-infra rework; replica-set
  features (`?replicaSet=rs0`, transactions) need extra setup; larger blast
  radius and slower cold start; contradicts "change existing over add new".
- **Why not chosen**: Disproportionate to the defect; Option A achieves
  isolation with a one-line change to existing infrastructure.

## Agreed Approach

**Option A.** Three surgical, independent fixes, each confined to the file that
owns the defect, with a verification gate per fix. RC-1 gets per-worker DB
isolation via `VITEST_POOL_ID` (removes the race, keeps parallelism). RC-2
aligns the `Group` model and its two tests to the established numeric-counts
contract. RC-3 is a test-only scoping fix; `OrgBootstrapRoute` is left
untouched because its success-path cleanup is already correct.

## Key Decisions

- RC-2 fixes toward the **counts** model (`default: 0`), not back to arrays —
  the array shape contradicts the current seed data and SPA `Group` type;
  reverting would reintroduce drift. (Recorded fork: `default: []` would
  satisfy the tests untouched but re-create model/seed/type drift — rejected.)
- RC-3 is **test-only**. An optional, separately-scoped hygiene enhancement
  (move the `HelmValuesBuilder` values-file `deleteIfExists` into the route's
  `.onCompletion()`) is explicitly out of scope for this change.
- The web suite is untouched (already green).
- `docker compose down -v` + rebuild is **not required** to reproduce or fix
  any defect: the server suite uses a separate `gdfkube_test` DB and camel uses
  Testcontainers; none depend on the demo stack's volumes.

## Open Questions

- None blocking. The single fork (RC-2 `default: 0` vs `default: []`) is
  decided in favor of the counts model and documented for redirection.
