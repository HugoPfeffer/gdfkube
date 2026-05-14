## Why

Every "Cluster Scale Change" submission silently fails. `HelmValuesBuilder.getChartRef(event)` returns the form id `scale-request`, but the chart on disk is `gdfkube-infra/charts/scale-patch/`. `HelmRenderRoute` cannot resolve the chart, the pipeline dies after the SPA shows "Submitted", and the user sees a stuck request with no diagnostic. The other two forms (`cluster-request`, `namespace-request`) align cleanly — only this one diverges, and that drift must be eliminated at its source.

## What Changes

**Chart directory and metadata**
- From: `gdfkube-infra/charts/scale-patch/` with `Chart.yaml` `name: scale-patch`
- To: `gdfkube-infra/charts/scale-request/` with `Chart.yaml` `name: scale-request`
- Reason: align chart name with the form id that drives `getChartRef`.
- Impact: non-breaking — the path was unreachable in production today.

**Chart description (audit I-14, folded in)**
- From: `description: Renders a NodePool patch for scaling cluster worker replicas`
- To: `description: Renders a NodePool manifest for cluster worker scaling`
- Reason: the template emits a full `NodePool`, not a patch.
- Impact: documentation-only.

**Regression test**
- Add a parameterized test in `gdfkube-camel` that enumerates every `_id` in `gdfkube-infra/mongodb/seed-data/forms.json` and asserts a matching directory exists under `gdfkube-infra/charts/`.
- Reason: prevent the next chart from drifting silently.
- Impact: new test only; no production code change beyond the rename.

**Spec table**
- Update `camel-orchestrator-stack` chart-inventory row from `scale-patch/` to `scale-request/`.

## Capabilities

### New Capabilities
_None._

### Modified Capabilities
- `camel-orchestrator-stack`: chart-inventory requirement updated so the table lists `scale-request/` (matching the form id that `HelmValuesBuilder.getChartRef` returns) and adds an explicit requirement that every `forms.json` `_id` resolves to a chart directory of the same name.

## Impact

- **Affected code**:
  - `gdfkube-src/gdfkube-infra/charts/scale-patch/` → renamed to `scale-request/` (single `git mv`).
  - `gdfkube-src/gdfkube-infra/charts/scale-request/Chart.yaml` — `name:` and `description:` fields.
  - `gdfkube-src/gdfkube-camel/src/test/java/.../HelmValuesBuilderTest.java` — new parameterized test (~15 LOC).
- **Unaffected** (verified): `HelmValuesBuilder.getChartRef`, `HelmRenderRoute`, `getReleaseName`, `application.properties` chart mount path, SPA, `forms.json` seed `_id` values, MongoDB live `forms` doc.
- **Specs**: `openspec/specs/camel-orchestrator-stack/spec.md` chart-inventory table.
- **Kafka topics / APIs / consumers**: none.
- **Dependencies**: none added or pinned.
- **Testing strategy**:
  - Unit: parameterized JUnit test enumerates `forms.json` ids vs. chart dirs.
  - Integration: existing `HelmRenderRoute` test path covers chart resolution; no new integration test needed.
  - Manual smoke: submit a Scale Change request and confirm `HelmRenderRoute` produces a non-empty `outputDir`.
- **Migration**: none — no in-flight scale submissions exist (the path is broken today). Form id stays `scale-request`, so audit log and live MongoDB `forms` doc are untouched.
- **Blast radius**: 1 directory rename, 2 `Chart.yaml` field edits, ~15 LOC of test, 1 spec table row.
