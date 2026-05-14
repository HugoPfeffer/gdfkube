## Context

`HelmValuesBuilder.getChartRef(RequestEvent event)` returns `event.formId` directly (lines 52-54). The chart on disk for the "Cluster Scale Change" form is named `scale-patch`, but the form id is `scale-request`. As a result `HelmRenderRoute` cannot resolve the chart at `/opt/charts/scale-request/`, the Camel route errors out, and the user sees a stuck "Submitted" request with no diagnostic.

Verified (2026-05-14): `ls gdfkube-infra/charts/` returns `cluster-request, infra, namespace-request, scale-patch`. The other two request forms (`cluster-request`, `namespace-request`) already align with their chart directories — only `scale-request` diverges.

Source surfaces for each side of the boundary:
- **Form id `scale-request`** is referenced by the SPA, the `forms.json` seed, the live MongoDB `forms` collection (`_id: "scale-request"`), and audit log entries pointing at past submissions.
- **Chart directory `scale-patch`** is referenced only by `HelmValuesBuilder.getChartRef` (transitively, via `event.formId`) and `HelmRenderRoute`'s filesystem load.

The Camel mount (`application.properties` chart base path) lists the entire `gdfkube-infra/charts/` directory; renaming a subdirectory needs no mount config change. `getReleaseName` derives the Helm release from `vars.clusterName`, not from the chart name, so it is unaffected.

## Goals / Non-Goals

**Goals:**
- Restore the "Cluster Scale Change" pipeline so submissions render and reach ArgoCD.
- Eliminate the form-id ↔ chart-dir drift at its source rather than papering over it with an indirection.
- Add a regression test that catches future drift across all forms in one assertion.
- Keep the OpenSpec `camel-orchestrator-stack` chart-inventory table truthful.

**Non-Goals:**
- Renaming `cluster-request` or `namespace-request` (already aligned).
- Changing Helm chart logic, template content, or the `NodePool` schema.
- Introducing a `formId → chartName` mapping layer.
- Live `_id` rewrite of the `forms` doc in MongoDB.
- Fixing other audit findings beyond I-14 (chart description wording).

## Decisions

### D1: Rename the chart directory, keep the form id
- **Choice**: `git mv gdfkube-infra/charts/scale-patch gdfkube-infra/charts/scale-request` and set `Chart.yaml` `name: scale-request`.
- **Alternatives**:
  - Rename the form id (DB + seed + SPA + audit log queries). Rejected — the `_id` is a Mongo primary key, requires delete+insert on live data, and `scale-request` is a better user-facing label than `scale-patch`.
  - Introduce a `formId → chartName` map in `HelmValuesBuilder`. Rejected — premature abstraction; only one form diverges. The map would still need to stay in sync with disk, replacing one drift source with another.
- **Rationale**: Form id has many referents (SPA, seed, live DB, audit history); chart dir has two (`HelmValuesBuilder`, `HelmRenderRoute`). Rename the side with the smaller blast radius.

### D2: Folded chart description fix into this change
- **Choice**: Update `description:` from "Renders a NodePool patch for scaling cluster worker replicas" to "Renders a NodePool manifest for cluster worker scaling".
- **Alternatives**: File a separate change for audit I-14. Rejected — the file is already being touched and the wording is misleading (template emits a full `NodePool`, not a patch).
- **Rationale**: One commit, one file, zero rebase pain.

### D3: Single parameterized regression test instead of per-form tests
- **Choice**: One JUnit test that loads `forms.json`, iterates every `_id`, and asserts `gdfkube-infra/charts/<id>/Chart.yaml` exists.
- **Alternatives**: Hard-coded test for `scale-request` only. Rejected — wouldn't catch the next form that drifts.
- **Rationale**: Self-extending coverage; each new form is automatically validated.

### D4: No abstraction added to `HelmValuesBuilder.getChartRef`
- **Choice**: Leave `getChartRef` as `return event.formId;`.
- **Rationale**: The whole point of this change is to make the identity mapping correct. Adding logic would invite the next drift.

## Risks / Trade-offs

- **Risk**: Stale `scale-patch` references elsewhere in the repo (test fixtures, dev container scripts, docs) silently point at a now-missing directory.
  → **Mitigation**: Verification step `grep -rn "scale-patch" gdfkube-src/` returns zero hits before the change is considered done.

- **Risk**: An in-flight scale submission gets renamed mid-flight.
  → **Mitigation**: None needed — the path is broken in production today; there is no "in-flight" state to migrate.

- **Risk**: ArgoCD/Helm-related fixtures pin the chart name `scale-patch` somewhere outside the chart directory itself (e.g. ApplicationSet, image-build manifests).
  → **Mitigation**: `grep` sweep covers this; if found, fold into the same change.

- **Risk**: The folded description change (D2) sneaks into a commit that should be a pure rename, making the diff harder to review.
  → **Mitigation**: Separate commits inside the same PR — one rename + name field, one description tweak, one test.

- **Trade-off**: We don't get the future-proofing of an explicit chart-name map. Acceptable today; revisit when a fourth diverging chart appears.

## Migration Plan

1. Rename the chart directory and update `Chart.yaml` (`name`, `description`).
2. Update the `camel-orchestrator-stack` spec table.
3. Add the parameterized regression test.
4. Run `./mvnw -pl gdfkube-src/gdfkube-camel test` — green.
5. Run `grep -rn "scale-patch" gdfkube-src/` — zero hits.
6. Manual smoke test: submit a Scale Change request; confirm `HelmRenderRoute` writes a non-empty `outputDir` and ArgoCD picks up the rendered `NodePool`.
7. **Rollback**: revert the commit. No database state, Kafka offsets, or consumer-group rebalancing involved — the rename is a pure filesystem + code change.

No MongoDB schema changes. No Kafka consumer-group rebalancing. No Helm value defaults changed. The chart `name` field is metadata in `Chart.yaml`; Helm releases are keyed by release name (`vars.clusterName`), which is unaffected.

## Open Questions

None. Plan, verification steps, and rollback path are settled.
