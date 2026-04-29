<!-- SPEC: monorepo-layout | CAP-001 -->

## ADDED Requirements

### Requirement: REQ-001-01 Monorepo directory tree

The repository SHALL contain a `gdfkube-src/` directory at the repo root with the exact subtree shape defined in §3.1 of `phase-0-foundation.md`: top-level subdirectories `gdfkube-infra/` (with `charts/` and `orgs/` subdirs), `gdfkube-orgs/` (with `charts/` subdir), `camel/`, `node/`, `scripts/`, `tests/`, plus the file siblings `score.node.yaml`, `score.camel.yaml`, `score-compose.yaml`, `connector.json`, `compose.yaml`, `Taskfile.yaml`, `README.md`. Empty subdirectories MUST be preserved with `.gitkeep` placeholders so a fresh clone reproduces the tree.

#### Scenario: SCN-001-01-01 Fresh clone reproduces tree

- **GIVEN** a fresh `git clone` of the repository at the Phase 0 acceptance commit
- **WHEN** the script `find gdfkube-src -mindepth 1 -maxdepth 2 -type d` runs
- **THEN** stdout MUST contain every path from the §3.1 table (`gdfkube-src/gdfkube-infra/charts`, `gdfkube-src/gdfkube-infra/orgs`, `gdfkube-src/gdfkube-orgs/charts`, `gdfkube-src/camel`, `gdfkube-src/node`, `gdfkube-src/scripts`, `gdfkube-src/tests`, `gdfkube-src/gdfkube-itsm`) and exit 0

#### Scenario: SCN-001-01-02 Empty subdir lacks `.gitkeep`

- **GIVEN** a contributor deletes `gdfkube-src/gdfkube-infra/charts/.gitkeep` and commits the change
- **WHEN** the `chart-lint.yaml` CI workflow runs `find gdfkube-src -type d -empty -not -path '*/.git/*'`
- **THEN** the workflow MUST exit non-zero and the failure log MUST list the empty directory

### Requirement: REQ-001-02 Chart-path containment

A `Chart.yaml` file SHALL only exist under one of three roots: `gdfkube-src/gdfkube-infra/charts/`, `gdfkube-src/gdfkube-orgs/charts/`, or `gdfkube-src/gdfkube-orgs/<org>/charts/`. A `Chart.yaml` at any other path MUST cause `chart-lint.yaml` to exit non-zero.

#### Scenario: SCN-001-02-01 Chart in allowed root passes

- **GIVEN** a `Chart.yaml` at `gdfkube-src/gdfkube-infra/charts/example/Chart.yaml`
- **WHEN** `./scripts/chart-lint.sh` runs the layout check
- **THEN** the script MUST exit 0 and emit no layout-violation lines on stderr

#### Scenario: SCN-001-02-02 Chart outside allowed root fails

- **GIVEN** a `Chart.yaml` at `gdfkube-src/camel/Chart.yaml`
- **WHEN** `./scripts/chart-lint.sh` runs the layout check
- **THEN** the script MUST exit non-zero, stderr MUST contain the offending path, and the message MUST cite guardrail G5

### Requirement: REQ-001-03 Canonical label namespace

Every YAML, Markdown, JSON, or shell file under `gdfkube-src/` SHALL use the label namespace `gdfkube.gov/org`. The legacy v1 namespace (the prefix `gdfkube.gov/` followed by the suffix word **g·r·o·u·p**, hereafter referred to as "the legacy v1 group-label") MUST NOT appear anywhere in `gdfkube-src/` except inside files explicitly listed as historical references in `.claude/plans/`. The `chart-lint.sh` script enforces this by grepping for that legacy literal.

#### Scenario: SCN-001-03-01 Canonical label passes lint

- **GIVEN** a manifest containing `gdfkube.gov/org: acme`
- **WHEN** `chart-lint.sh` runs its legacy-label grep against `gdfkube-src/`
- **THEN** the grep MUST exit 1 (no match) and `chart-lint.sh` MUST exit 0

#### Scenario: SCN-001-03-02 Legacy label fails lint

- **GIVEN** a manifest under `gdfkube-src/` introduces the legacy v1 group-label
- **WHEN** the pre-commit guardrail hook or `chart-lint.sh` evaluates the change
- **THEN** the check MUST exit non-zero, the error message MUST cite guardrail G3, and the offending file path and line number MUST be printed

### Requirement: REQ-001-04 Naming and namespace conventions inherited from remix

Manifests authored in any later phase SHALL use the conventions locked in `phase-0-foundation.md` §0.3: HostedCluster `metadata.name = hc-{org}-{cluster}`, HostedCluster namespace `clusters`, ManagedCluster `metadata.name = {cluster}`, ApplicationSet `metadata.name = appset-{org}-{cluster}`, AppProject `metadata.name = {org}`, and clusterset membership label `cluster.open-cluster-management.io/clusterset: {org}`. Phase 0 itself MUST record these conventions in `gdfkube-src/README.md` so later phases can cite them without re-deriving.

#### Scenario: SCN-001-04-01 README documents conventions

- **GIVEN** `gdfkube-src/README.md` exists
- **WHEN** `grep -E 'hc-\{org\}-\{cluster\}|appset-\{org\}-\{cluster\}|gdfkube\.gov/org' gdfkube-src/README.md` runs
- **THEN** every one of the four canonical patterns MUST appear at least once and `grep` MUST exit 0

#### Scenario: SCN-001-04-02 README missing a convention

- **GIVEN** `gdfkube-src/README.md` lacks the `hc-{org}-{cluster}` pattern
- **WHEN** the Phase 0 acceptance script `tests/acceptance/readme-conventions.sh` runs
- **THEN** the script MUST exit non-zero and stderr MUST name each missing convention
