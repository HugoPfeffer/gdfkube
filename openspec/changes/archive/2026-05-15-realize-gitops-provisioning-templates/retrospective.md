## Retrospective

**Change:** realize-gitops-provisioning-templates
**Schema:** superpowers-bridge
**Date:** 2026-05-15

### What went well

- **Decision ledger eliminated ambiguity**: The D1 ledger in `design.md` resolved 14 doc⇄template conflicts upfront. Only 5 required user confirmation; the rest had objectively clear rulings. This prevented mid-implementation design pivots.
- **OQ1 caught early**: Inspecting the actual Camel `OrgBootstrapRoute` before implementation revealed it pushes to `gdfkube-orgs/orgs/<org>/` (not `gdfkube-infra/argocd/orgs/`). Fixing the discovery target before writing code saved a rework cycle.
- **Values/schema lockstep worked**: Updating all `values.yaml` + `values.schema.json` files in one commit (Task 2) meant subsequent template changes never hit schema validation failures.
- **Helm `template` + `grep` assertions**: Using `helm template | grep -E` as a lightweight render-assert gave instant feedback without needing a running cluster. Every template change was verified within seconds.
- **Existing test infrastructure sufficient**: `HelmValuesBuilderTest` from the `strengthen-org-bootstrap-tests` change provided the exact scaffold needed for the new label and naming tests — no new test boilerplate required.

### What was challenging

- **Escaped RHACM template delimiters**: The ConfigurationPolicy uses `{{ "{{" }}` to emit literal `{{ }}` through Helm. Getting the double-escape right required careful attention to avoid Helm interpreting the inner delimiters.
- **Maven test runtime**: The full Camel test suite takes ~4 minutes (including Quarkus startup/shutdown). Running only `HelmValuesBuilderTest` (5s) was essential for TDD-style iteration.
- **Pre-existing test flakiness**: `OrgBootstrapIntegrationTest.outputDir_cleanedUpAfterSuccess` fails intermittently due to temp-dir race conditions. This is not caused by our change but makes the "full green suite" verification gate report 1 failure.
- **Doc reconciliation scope**: Three docs (09/10/11) with embedded YAML that needed careful alignment to the templates — updating inline YAML in markdown is tedious and error-prone compared to the actual Helm templates.

### Decisions made during implementation

1. **Discovery scans `gdfkube-orgs` repo** (OQ1): The Camel `org-bootstrap` route pushes to `gdfkube-orgs/orgs/<org>/`, not to `gdfkube-infra`. The discovery ApplicationSet was adjusted to match the actual push target.
2. **Chart-owned `gdfkube-policies` Namespace** (OQ2): `rhacm-org` emits the Namespace with sync-wave -10, ensuring it exists before the Placement, Policy, and PlacementBinding that reference it.
3. **scale-request namespace aligned**: Changed from hardcoded `clusters` to `{{ .Values.system.naming.namespace }}` to match the cluster-request's per-cluster namespace (H1).
4. **10-label schema in values.yaml**: Default values include all 10 canonical labels for standalone render testing, even though only 6 are emitted by `buildForOrg` (the org-bootstrap path).

### Lessons for future changes

- **Always verify the actual route code for OQs**: The plan assumed `gdfkube-infra/argocd/orgs/` but the real push target was `gdfkube-orgs/orgs/`. Reading the source before implementing is essential for discovery/path-dependent work.
- **ConfigurationPolicy RHACM templates need double-escape documentation**: A comment in the template file prevents future maintainers from "fixing" the `{{ "{{" }}` syntax.
- **Pre-archive spec backlinks use change-relative paths**: After archive, these need updating to `openspec/specs/` paths. The `fix-spec-doc-drift` badge lifecycle handles this — no manual intervention needed.
- **The `OrgBootstrapIntegrationTest` temp-dir flakiness should be addressed**: A dedicated change to add `@AfterEach` temp-dir cleanup or reduce parallelism would prevent false negatives in future verification gates.

### Follow-up items

- Sync delta specs (`argocd-org-stack`, `rhacm-org-stack`, `hypershift-cluster-stack`) to `openspec/specs/` during archive.
- Update doc spec backlinks from `openspec/changes/…/specs/` to `openspec/specs/` post-archive.
- Address `OrgBootstrapIntegrationTest.outputDir_cleanedUpAfterSuccess` flakiness in a separate change.
