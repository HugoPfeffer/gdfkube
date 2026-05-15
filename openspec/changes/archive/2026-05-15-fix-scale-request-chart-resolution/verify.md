# Verification: fix-scale-request-chart-resolution

## Acceptance Criteria

| Criterion | Status | Evidence |
|---|---|---|
| Chart directory `scale-request/` exists | PASS | `ls gdfkube-src/gdfkube-infra/charts/` returns `cluster-request, infra, namespace-request, scale-request` |
| Chart directory `scale-patch/` no longer exists | PASS | Same listing; `scale-patch` absent |
| `Chart.yaml` name field is `scale-request` | PASS | `name: scale-request` in `gdfkube-src/gdfkube-infra/charts/scale-request/Chart.yaml` |
| `Chart.yaml` description updated (audit I-14) | PASS | `description: Renders a NodePool manifest for cluster worker scaling` |
| `values.yaml` formId corrected | PASS | `formId: "scale-request"` (was `"scale-patch"`) |
| Parameterized regression test added | PASS | `everySeededFormIdResolvesToAChartDirectory` in `HelmValuesBuilderTest.java` enumerates all `forms.json` `_id` values |
| Regression test passes for all form ids | PASS | 17/17 tests pass including 3 parameterized cases (`cluster-request`, `namespace-request`, `scale-request`) — run via SonarQube container JVM |
| Full module test suite passes | PASS | 54/54 tests pass — `./mvnw test` via SonarQube container |
| No stale `scale-patch` references in `gdfkube-src/` | PASS | Only `applicationset.yaml` has `scale-patches/*` (plural, different concept — ArgoCD Git generator output directory) |
| No stale references in `.devcontainer/` | PASS | Zero hits |
| Spec table updated | PASS | `openspec/specs/camel-orchestrator-stack/spec.md` row reads `scale-request/` with updated description |
| Pre-commit hooks pass | PASS | `pre-commit run --all-files` — TruffleHog passed |

## Blocking Issues

None.

## Non-Blocking Notes

- **TDD red phase not verified retroactively**: The rename was applied before running the test, so the "red" state (test failing on `scale-request`) was not captured. The test logic is correct — it would fail if any `forms.json` `_id` lacks a chart directory.
- **Manual smoke test not run** (tasks 7.1–7.3): Requires the full local stack with SPA submission flow. The automated test suite covers the chart resolution path; the remaining gap is end-to-end through `HelmRenderRoute` to the filesystem.
- **Extra fix**: `values.yaml` had `formId: "scale-patch"` which was not in the original task list but was corrected as part of the stale reference sweep (task 5.3).
