## ADDED Requirements

### Requirement: Server vitest workers SHALL use isolated databases

The `gdfkube-itsm` server vitest suite SHALL connect each parallel worker to a
distinct MongoDB database so that one worker's fixture setup or collection
teardown cannot affect another worker's data. The per-worker database name MUST
be derived from the base `MONGO_URL` plus the worker identity
(`process.env.VITEST_POOL_ID`), with a deterministic fallback when that
variable is absent so a single-worker run still receives a valid isolated
database.

#### Scenario: Parallel workers do not share a database

- **WHEN** the server suite runs with the default vitest pool (parallel
  workers) and two workers each seed and assert their own fixtures
- **THEN** each worker reads only its own seeded documents
- **AND** no worker observes `E11000` duplicate-key errors, empty result sets,
  or missing documents caused by another worker's `deleteMany`

#### Scenario: Repeated full runs are deterministic

- **WHEN** `npm test` is run twice consecutively in the server package with
  default parallelism
- **THEN** both runs report the same result with zero failures

#### Scenario: Single-worker run still isolated

- **WHEN** the suite runs serialized (no `VITEST_POOL_ID` in the environment)
- **THEN** the setup resolves a valid, deterministic database name via the
  fallback
- **AND** the suite still connects, runs, and passes

#### Scenario: Worker databases are self-cleaning

- **WHEN** a worker finishes its tests
- **THEN** its `afterAll` disconnects the connection and drops its per-worker
  database so repeated runs do not accumulate stray databases on `mongo1`
