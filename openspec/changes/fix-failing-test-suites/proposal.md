## Why

A full rebuild test run is non-deterministic and red: the `gdfkube-itsm`
server suite fails 27–32 tests with a *different* failing set each run, and the
`gdfkube-camel` suite fails one order-dependent test. A test suite that can't
be trusted to be green hides real regressions and blocks confident merges.
Root causes were isolated with controlled experiments and confirmed by
independent peer review, so fixing them now restores a reliable signal at low
risk before the noise masks a genuine defect.

## What Changes

**Server vitest isolation (RC-1)**
- From: all parallel vitest workers share one MongoDB database
  (`gdfkube_test`); a global `beforeEach` `deleteMany({})` in
  `server/vitest.setup.ts` wipes other workers' fixtures mid-test.
- To: each worker connects to its own database, namespaced by
  `process.env.VITEST_POOL_ID`.
- Reason: removes the cross-worker data race while keeping parallel execution.
- Impact: non-breaking; test-infrastructure only.

**Group model defaults (RC-2)**
- From: `server/src/models/Group.ts` declares `users`/`forms` as
  `Schema.Types.Mixed` with no default, so an omitted field is `undefined`;
  two unit tests still assert the legacy `[]` shape.
- To: `users`/`forms` default to `0`, matching the established numeric-counts
  data model (seed data and SPA `Group` type); the two tests assert the counts
  contract.
- Reason: a regression in commit `146f4d7` dropped the default and the tests
  drifted from the real data model.
- Impact: non-breaking at runtime (no code reads these as arrays); corrects a
  test/model/seed drift.

**Camel org-bootstrap cleanup assertion (RC-3)**
- From: `OrgBootstrapIntegrationTest.outputDir_cleanedUpAfterSuccess` counts
  `bootstrap-cultura-*` entries globally in the shared JVM temp dir under
  `@TestInstance(PER_CLASS)`, so it tallies residue from sibling tests.
- To: the assertion is scoped to the temp directory created by the test's own
  exchange (or a per-test temp root).
- Reason: the production cleanup path is correct and previously live-verified;
  the failure is a test-isolation defect, not a product bug.
- Impact: non-breaking; test-only, no production code change.

Out of scope: the green web suite; any `OrgBootstrapRoute` production change;
the optional `HelmValuesBuilder` values-file hygiene enhancement; the
`docker compose down -v` rebuild (not required to reproduce or fix any defect).

## Capabilities

### New Capabilities
- `itsm-server-test-isolation`: the `gdfkube-itsm` server vitest suite must run
  its parallel workers against isolated databases so that fixture setup and
  teardown in one worker cannot affect another.

### Modified Capabilities
- `itsm-groups-collection`: a Group created without explicit `users`/`forms`
  must have well-defined numeric-count defaults consistent with the seed data
  and the frontend `Group` type.
- `org-bootstrap-test-determinism`: the post-success temp-directory cleanup
  assertion must be scoped to artifacts created by the test under evaluation,
  not a global count over a shared temp root.

## Impact

- Code: `gdfkube-src/gdfkube-itsm/server/vitest.setup.ts`;
  `gdfkube-src/gdfkube-itsm/server/src/models/Group.ts`;
  `gdfkube-src/gdfkube-itsm/server/__tests__/models.test.ts`;
  `gdfkube-src/gdfkube-itsm/server/__tests__/groups.test.ts`;
  `gdfkube-src/gdfkube-camel/src/test/java/gov/gdf/camel/routes/OrgBootstrapIntegrationTest.java`.
- APIs: none (no HTTP contract change; `GET/POST /api/itsm/groups` behavior
  unchanged at runtime).
- Dependencies: none added.
- Systems: no demo-stack rebuild required; no production runtime change.
