## ADDED Requirements

### Requirement: Every form `_id` SHALL resolve to a chart directory of the same name

The `HelmValuesBuilder.getChartRef(RequestEvent event)` method MUST return `event.formId` unchanged, and for every document in `gdfkube-src/gdfkube-infra/mongodb/seed-data/forms.json`, a chart directory MUST exist at `gdfkube-src/gdfkube-infra/charts/<formId>/` containing a valid `Chart.yaml`. No `formId → chartName` indirection is permitted.

#### Scenario: Every seeded form id has a matching chart directory

- **GIVEN** the seed file `gdfkube-src/gdfkube-infra/mongodb/seed-data/forms.json`
- **WHEN** the parameterized regression test in `HelmValuesBuilderTest` enumerates every `_id` in the seed
- **THEN** for each id `<formId>`, the file `gdfkube-src/gdfkube-infra/charts/<formId>/Chart.yaml` SHALL exist and be loadable as YAML

#### Scenario: A Cluster Scale Change submission renders successfully

- **GIVEN** a `RequestEvent` with `formId = "scale-request"` and a complete `vars.*` payload
- **WHEN** `helm-render` runs
- **THEN** `HelmValuesBuilder.getChartRef` SHALL return `"scale-request"`
- **AND** the helm subprocess SHALL load the chart from `/opt/charts/scale-request/`
- **AND** SHALL exit with code 0
- **AND** `/tmp/<requestId>-out/` SHALL contain at least one rendered `NodePool` manifest

---

## MODIFIED Requirements

### Requirement: Helm chart catalog SHALL provide 5 charts that lint clean

The directory `gdfkube-src/gdfkube-infra/charts/` MUST contain these chart trees, each with `Chart.yaml`, `values.yaml`, `values.schema.json`, and `templates/`:

| Chart | Renders |
|---|---|
| `cluster-request/` | HostedCluster, NodePool, ManagedCluster |
| `namespace-request/` | Namespace |
| `scale-request/` | NodePool manifest for cluster worker scaling |
| `infra/argocd-org/` | AppProject, ApplicationSet |
| `infra/rhacm-org/` | ManagedClusterSet, ManagedClusterSetBinding |

Every chart's templates MUST apply `system.labels` and reference `system.naming.*` from the bean output. The chart directory name MUST match the `formId` it serves (where applicable), so that `HelmValuesBuilder.getChartRef(event)` resolves directly to the on-disk chart with no mapping layer.

#### Scenario: Every chart renders and lints

- **GIVEN** the chart catalog exists
- **WHEN** `helm template <release> gdfkube-src/gdfkube-infra/charts/<chartRef>` is run for each chart
- **THEN** each invocation SHALL exit 0
- **AND** the rendered output piped to `kubectl --dry-run=client -f -` SHALL exit 0

#### Scenario: Chart directory names align with form ids

- **GIVEN** the form ids `cluster-request`, `namespace-request`, `scale-request` from `forms.json`
- **WHEN** the chart catalog is inspected
- **THEN** each form id SHALL have a chart directory at `gdfkube-src/gdfkube-infra/charts/<formId>/`
- **AND** no chart directory named `scale-patch/` SHALL exist
