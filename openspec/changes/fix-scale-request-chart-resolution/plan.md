# fix-scale-request-chart-resolution Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development
> to implement this plan task-by-task.

**Goal:** Restore the "Cluster Scale Change" submission path by aligning the chart directory name with the form id, and add a regression test that prevents future drift across all forms.

**Architecture:** `HelmValuesBuilder.getChartRef(event)` returns `event.formId` (`scale-request`); the chart on disk is currently `scale-patch`. Rename the directory + `Chart.yaml.name` so the identity mapping holds. A single parameterized JUnit test enumerates `forms.json` ids and asserts each chart directory exists.

**Tech Stack:** Apache Camel, Quarkus, Helm, JUnit 5 parameterized tests.

---

## Task 1: Pre-flight verification

- [ ] **Step 1:** From repo root, run `ls gdfkube-src/gdfkube-infra/charts/`. Confirm output contains `scale-patch` and does NOT contain `scale-request`. If `scale-request` already exists, stop — the change has already been partially applied.
- [ ] **Step 2:** Run `grep -rn "scale-patch" gdfkube-src/ .devcontainer/ openspec/ 2>/dev/null | tee /tmp/scale-patch-refs-before.txt`. Save the file as the baseline for the post-change sweep.
- [ ] **Step 3:** Run `grep -n '"_id"' gdfkube-src/gdfkube-infra/mongodb/seed-data/forms.json`. Confirm one row reads `"_id": "scale-request"`.
- [ ] **Step 4:** No commit — diagnostic only.

## Task 2: Add the failing regression test (TDD red)

- [ ] **Step 1:** Run `find gdfkube-src/gdfkube-camel/src/test -name "HelmValuesBuilderTest*" 2>&1`. Note the path (or note it is missing).
- [ ] **Step 2:** If the file is missing, locate `HelmValuesBuilder.java` to derive the matching test package: `find gdfkube-src/gdfkube-camel/src/main -name "HelmValuesBuilder.java"`. Mirror its package under `src/test/java/`.
- [ ] **Step 3:** Add a test method using the following shape (adapt package + imports to the project conventions you find in adjacent test files):

  ```java
  @ParameterizedTest(name = "form id {0} has a chart directory")
  @MethodSource("seededFormIds")
  void everySeededFormIdResolvesToAChartDirectory(String formId) {
      Path chart = Path.of("gdfkube-src/gdfkube-infra/charts", formId, "Chart.yaml");
      assertTrue(Files.exists(chart),
          "Missing chart for formId=" + formId + " at " + chart);
  }

  static Stream<String> seededFormIds() throws IOException {
      Path seed = Path.of("gdfkube-src/gdfkube-infra/mongodb/seed-data/forms.json");
      JsonNode root = new ObjectMapper().readTree(Files.readString(seed));
      return StreamSupport.stream(root.spliterator(), false)
          .map(n -> n.get("_id").asText());
  }
  ```

  - Resolve the working directory: if the Maven build runs from the module dir (`gdfkube-camel/`), prefix the paths with `../gdfkube-infra/...` instead. Verify by reading `pom.xml` or any existing test that loads a sibling-module file.
- [ ] **Step 4:** Run `./mvnw -pl gdfkube-src/gdfkube-camel test -Dtest=HelmValuesBuilderTest`. The test SHALL fail on the `scale-request` parameterization (red).
- [ ] **Step 5:** Commit: `git add gdfkube-src/gdfkube-camel/src/test/...HelmValuesBuilderTest.java && git commit -m "test: assert every forms.json id has a chart dir (red)"`.

## Task 3: Rename the chart directory

- [ ] **Step 1:** Run `git mv gdfkube-src/gdfkube-infra/charts/scale-patch gdfkube-src/gdfkube-infra/charts/scale-request`.
- [ ] **Step 2:** Edit `gdfkube-src/gdfkube-infra/charts/scale-request/Chart.yaml`. Change `name: scale-patch` → `name: scale-request`. Leave version, apiVersion, and other fields alone.
- [ ] **Step 3:** Commit: `git add -A && git commit -m "rename scale-patch chart to scale-request to match form id"`.

## Task 4: Fold in the description fix (audit I-14)

- [ ] **Step 1:** Edit `gdfkube-src/gdfkube-infra/charts/scale-request/Chart.yaml`. Change `description: Renders a NodePool patch for scaling cluster worker replicas` → `description: Renders a NodePool manifest for cluster worker scaling`.
- [ ] **Step 2:** Commit: `git add gdfkube-src/gdfkube-infra/charts/scale-request/Chart.yaml && git commit -m "scale-request: clarify chart description (template renders full NodePool)"`.

## Task 5: Make the test green

- [ ] **Step 1:** Run `./mvnw -pl gdfkube-src/gdfkube-camel test -Dtest=HelmValuesBuilderTest`. SHALL pass for all parameterizations.
- [ ] **Step 2:** Run the full module suite `./mvnw -pl gdfkube-src/gdfkube-camel test`. SHALL pass.
- [ ] **Step 3:** No commit (the rename + test commits already cover this).

## Task 6: Sweep for stale references

- [ ] **Step 1:** Run `grep -rn "scale-patch" gdfkube-src/`. SHALL return zero hits.
- [ ] **Step 2:** Run `grep -rn "scale-patch" .devcontainer/ 2>/dev/null`. Address any non-historical hit.
- [ ] **Step 3:** Run `grep -rn "scale-patch" openspec/ 2>/dev/null`. Expect a hit only at `openspec/specs/camel-orchestrator-stack/spec.md:148` (handled by Task 7's archive step), and inside this change directory itself (proposal.md, design.md, etc.) — those are intentional, leave them.
- [ ] **Step 4:** If a stray reference is found in test fixtures or `application.properties`, update it now and commit: `git add <files> && git commit -m "drop stale scale-patch references"`.

## Task 7: Confirm the spec delta is in place

- [ ] **Step 1:** Re-read `openspec/changes/fix-scale-request-chart-resolution/specs/camel-orchestrator-stack/spec.md` and confirm the MODIFIED requirement uses the exact existing header `Helm chart catalog SHALL provide 5 charts that lint clean` (case-sensitive). The archive step relies on this header match.
- [ ] **Step 2:** Confirm the table row for the renamed chart reads `| \`scale-request/\` | NodePool manifest for cluster worker scaling |`.
- [ ] **Step 3:** No commit — the file is already part of the change directory tracked above.

## Task 8: Manual smoke verification

- [ ] **Step 1:** Bring up the local stack per the project devcontainer instructions.
- [ ] **Step 2:** From the SPA, submit a "Cluster Scale Change" request with valid `vars.*` (cluster name, replica count).
- [ ] **Step 3:** Tail the `gdfkube-camel` logs and confirm `helm-render` exits 0 and writes `/tmp/<requestId>-out/` with at least one `NodePool` YAML.
- [ ] **Step 4:** If logs show a chart-load error, stop and re-check Task 3 — the rename did not propagate to the running container's mounted volume; rebuild the image or reload the chart mount.
- [ ] **Step 5:** No commit — verification only. Record the `requestId` in the PR description as evidence.

## Task 9: Pre-commit and PR

- [ ] **Step 1:** Run `pre-commit run --all-files`. SHALL pass (trufflehog must not flag anything).
- [ ] **Step 2:** Push the branch and open a PR. Title: `fix(scale-request): align chart directory with form id`. Body references this OpenSpec change `fix-scale-request-chart-resolution` and audit finding C-2.
- [ ] **Step 3:** When merged, run the OpenSpec verify + retrospective + archive flow (`/opsx:apply` for verify; archive separately).
