## 1. Pre-flight verification

- [ ] 1.1 Run `ls gdfkube-src/gdfkube-infra/charts/` and confirm `scale-patch/` exists and `scale-request/` does not.
- [ ] 1.2 Run `grep -rn "scale-patch" gdfkube-src/` and capture the full list of references for after-the-fact comparison.
- [ ] 1.3 Confirm `gdfkube-src/gdfkube-infra/mongodb/seed-data/forms.json` contains `_id: "scale-request"`.

## 2. Add the failing regression test (TDD red)

- [ ] 2.1 Locate the existing `HelmValuesBuilderTest` under `gdfkube-src/gdfkube-camel/src/test/java/`. If absent, create it next to `HelmValuesBuilder`.
- [ ] 2.2 Add a `@ParameterizedTest` source-method that loads `gdfkube-src/gdfkube-infra/mongodb/seed-data/forms.json`, parses it, and yields every `_id`.
- [ ] 2.3 The test asserts `Files.exists(Path.of("gdfkube-src/gdfkube-infra/charts", id, "Chart.yaml"))` for each id.
- [ ] 2.4 Run `./mvnw -pl gdfkube-src/gdfkube-camel test -Dtest=HelmValuesBuilderTest` — the test SHALL fail on `scale-request` (red).

## 3. Rename the chart directory

- [ ] 3.1 `git mv gdfkube-src/gdfkube-infra/charts/scale-patch gdfkube-src/gdfkube-infra/charts/scale-request`.
- [ ] 3.2 In `gdfkube-src/gdfkube-infra/charts/scale-request/Chart.yaml`, change `name: scale-patch` → `name: scale-request`.
- [ ] 3.3 In the same file, change `description: Renders a NodePool patch for scaling cluster worker replicas` → `description: Renders a NodePool manifest for cluster worker scaling` (folds in audit I-14).

## 4. Make the test green

- [ ] 4.1 Re-run `./mvnw -pl gdfkube-src/gdfkube-camel test -Dtest=HelmValuesBuilderTest` — SHALL pass.
- [ ] 4.2 Run the full module test suite `./mvnw -pl gdfkube-src/gdfkube-camel test` — SHALL pass.

## 5. Sweep for stale references

- [ ] 5.1 Run `grep -rn "scale-patch" gdfkube-src/` — SHALL return zero hits.
- [ ] 5.2 Run `grep -rn "scale-patch" .devcontainer/ openspec/ tmp/ 2>/dev/null` and address any non-historical references (skip `tmp/unified-audit-findings.md` if present — that's the audit source).
- [ ] 5.3 If a stale reference is found in test fixtures or `application.properties`, update it within the same change.

## 6. Update the OpenSpec capability spec

- [ ] 6.1 In `openspec/specs/camel-orchestrator-stack/spec.md` line 148, change `| \`scale-patch/\` | NodePool replica patch |` → `| \`scale-request/\` | NodePool manifest for cluster worker scaling |`. (This delta is described under MODIFIED Requirements in `specs/camel-orchestrator-stack/spec.md`; archiving the change applies it.)

## 7. Manual smoke verification

- [ ] 7.1 Start the local stack and submit a "Cluster Scale Change" request from the SPA.
- [ ] 7.2 Confirm `helm-render` writes a non-empty `/tmp/<requestId>-out/` containing a `NodePool` manifest.
- [ ] 7.3 Confirm the request reaches ArgoCD (or the configured downstream) without the previous chart-load error.

## 8. Pre-commit and finalize

- [ ] 8.1 Run `pre-commit run --all-files` — SHALL pass.
- [ ] 8.2 Stage the changes as: (a) `git mv` + `Chart.yaml` rename commit, (b) description tweak commit, (c) regression test commit. Single PR.
- [ ] 8.3 PR description references this OpenSpec change `fix-scale-request-chart-resolution` and the original audit finding C-2.
