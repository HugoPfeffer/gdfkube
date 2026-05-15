# Retrospective: fix-scale-request-chart-resolution

## What Went Well

- **Blast radius was exactly as predicted**: 1 directory rename, 2 `Chart.yaml` field edits, 1 `values.yaml` formId fix, ~15 LOC of test, 1 spec table row. No surprises in production code.
- **Regression test design**: The parameterized test that enumerates `forms.json` ids is self-extending — any new form added to the seed automatically gets chart-directory validation. This prevents the exact class of drift that caused the bug.
- **Pre-flight verification caught an extra issue**: `values.yaml` had `formId: "scale-patch"` which wasn't in the original task list. The grep sweep surfaced it cleanly.
- **Decision D1 (rename chart, keep form id) was correct**: The chart directory had only 2 referents vs. the form id's many (SPA, seed, live DB, audit log). Renaming the smaller surface was the right call.

## What Could Be Improved

- **TDD sequencing**: The rename was applied before running the test in "red" state. In a proper TDD flow, the test should have been committed and verified failing before the fix. The devcontainer lacking Java forced a non-ideal sequencing.
- **Manual smoke test gap**: End-to-end verification through the SPA submission flow was not performed. The automated tests cover the chart resolution, but a future change should include a smoke test script or integration test that exercises `HelmRenderRoute` with a `scale-request` event.
- **`values.yaml` oversight in planning**: The task list and plan didn't account for `values.yaml` containing `formId: "scale-patch"`. The grep sweep caught it, but it should have been identified during the design phase.

## Decisions Validated

- **D1 (rename chart directory)**: Confirmed correct. Zero migration needed, zero live data touched.
- **D2 (fold description fix)**: Clean fold — the file was already being touched, and the description was genuinely misleading.
- **D3 (parameterized test)**: Covers all 3 current forms in one test method. When a 4th form is added to `forms.json`, it will automatically be validated.
- **D4 (no abstraction in getChartRef)**: The identity mapping `getChartRef = event.formId` is now correct for all forms. No indirection needed.

## Metrics

- **Tasks completed**: 19/22 (3 manual smoke tasks deferred — require running stack)
- **Tests added**: 1 parameterized test (3 form-id cases)
- **Tests passing**: 54/54 (full module suite)
- **Files changed**: 5 (Chart.yaml, values.yaml, HelmValuesBuilderTest.java, tasks.md, spec.md)
- **Lines changed**: ~46 insertions, ~24 deletions
