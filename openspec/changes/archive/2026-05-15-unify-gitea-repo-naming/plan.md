# Unify Gitea Repo Naming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `HelmValuesBuilder.getRepoName(groupId)` the single source of truth for the per-org Gitea repo name (`gdfkube-<groupId>`), consumed by both `RepoBootstrapRoute` and `OrgBootstrapRoute`, and drop the unused `groupRepo` parameter from `HelmValuesBuilder.buildForOrg`.

**Architecture:** Add a one-line helper method on the existing `HelmValuesBuilder` CDI bean. Inject `HelmValuesBuilder` into `RepoBootstrapRoute` (already injected in `OrgBootstrapRoute`). Replace three inline `"gdfkube-" + groupId` / `giteaOwner + "-" + org` compositions with helper calls. Tests are written first (RED) for each behavior change and proven to fail under the current code before the implementation is made (GREEN). No chart, manifest, or spec-doc edits — `applicationset.yaml` already matches the canonical form.

**Tech Stack:** Quarkus 3.16.3, Apache Camel 4.6.0, Java 21, JUnit 5, Mockito, Maven.

**File Structure:**
- Modify: `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/bean/HelmValuesBuilder.java` — add `getRepoName`, drop `groupRepo` arg from `buildForOrg`.
- Modify: `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/RepoBootstrapRoute.java` — inject `HelmValuesBuilder`, use helper on lines 49–50 and 56.
- Modify: `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/OrgBootstrapRoute.java` — drop `groupRepo` local (line 102), use helper on lines 112, 115, 146.
- Modify: `gdfkube-src/gdfkube-camel/src/test/java/gov/gdf/camel/bean/HelmValuesBuilderTest.java` — add `getRepoName` test; drop second arg from `buildForOrg` call (line 178).
- Modify: `gdfkube-src/gdfkube-camel/src/test/java/gov/gdf/camel/routes/OrgBootstrapIntegrationTest.java` — adjust mocks / assertions for the new `buildForOrg(String)` signature and assert canonical `gdfkube-<group>` in `gitRepoBootstrapper.ensure` calls.
- (No changes to charts, specs/docs, or non-camel modules.)

---

## Task 1: Add `HelmValuesBuilder.getRepoName(String)` helper

**Files:**
- Test: `gdfkube-src/gdfkube-camel/src/test/java/gov/gdf/camel/bean/HelmValuesBuilderTest.java`
- Modify: `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/bean/HelmValuesBuilder.java` (insert after line 66, before `buildForOrg` at line 68)

- [ ] **Step 1: Write the failing tests**

In `HelmValuesBuilderTest.java`, after the existing `getReleaseName_stringOverload_appendsBootstrap` test (around line 226), append:

```java
@Test
void getRepoName_returnsCanonicalGdfkubePrefixedName() {
    assertEquals("gdfkube-cultura", builder.getRepoName("cultura"));
}

@Test
void getRepoName_acceptsHyphenatedGroupIds() {
    assertEquals("gdfkube-sec-educ", builder.getRepoName("sec-educ"));
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./mvnw -pl gdfkube-src/gdfkube-camel test -Dtest=HelmValuesBuilderTest#getRepoName_returnsCanonicalGdfkubePrefixedName+getRepoName_acceptsHyphenatedGroupIds`
Expected: COMPILE FAILURE — `getRepoName` does not exist on `HelmValuesBuilder`.

- [ ] **Step 3: Add the helper method**

In `HelmValuesBuilder.java`, insert between line 66 (closing brace of `getReleaseName(String groupId)`) and line 68 (signature of `buildForOrg`):

```java

    public String getRepoName(String groupId) {
        return "gdfkube-" + groupId;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./mvnw -pl gdfkube-src/gdfkube-camel test -Dtest=HelmValuesBuilderTest#getRepoName_returnsCanonicalGdfkubePrefixedName+getRepoName_acceptsHyphenatedGroupIds`
Expected: PASS (both).

- [ ] **Step 5: Commit**

```bash
git add gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/bean/HelmValuesBuilder.java \
        gdfkube-src/gdfkube-camel/src/test/java/gov/gdf/camel/bean/HelmValuesBuilderTest.java
git commit -m "add HelmValuesBuilder.getRepoName helper for per-org gitea repo name"
```

---

## Task 2: Drop the dead `groupRepo` parameter from `buildForOrg`

**Files:**
- Modify: `gdfkube-src/gdfkube-camel/src/test/java/gov/gdf/camel/bean/HelmValuesBuilderTest.java` (line 178)
- Modify: `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/bean/HelmValuesBuilder.java` (line 68)

- [ ] **Step 1: Update the existing test to call the single-arg signature**

In `HelmValuesBuilderTest.java`, line 178, change:

```java
        String path = builder.buildForOrg("cultura", "gdfkube-cultura");
```

to:

```java
        String path = builder.buildForOrg("cultura");
```

- [ ] **Step 2: Run the test to verify it fails to compile**

Run: `./mvnw -pl gdfkube-src/gdfkube-camel test -Dtest=HelmValuesBuilderTest#buildForOrg_writesCanonicalValues`
Expected: COMPILE FAILURE — `buildForOrg(String)` does not exist; only `buildForOrg(String, String)`.

- [ ] **Step 3: Change the method signature in `HelmValuesBuilder.java`**

At line 68, change:

```java
    public String buildForOrg(String groupId, String groupRepo) throws IOException {
```

to:

```java
    public String buildForOrg(String groupId) throws IOException {
```

The body uses neither `groupRepo` nor any value derived from it — no further edits inside the method body. Verify by re-reading lines 68–99: no occurrence of `groupRepo`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `./mvnw -pl gdfkube-src/gdfkube-camel test -Dtest=HelmValuesBuilderTest#buildForOrg_writesCanonicalValues`
Expected: PASS.

- [ ] **Step 5: Run the full HelmValuesBuilderTest suite**

Run: `./mvnw -pl gdfkube-src/gdfkube-camel test -Dtest=HelmValuesBuilderTest`
Expected: PASS (all tests; the signature change is compatible with the test you just edited and no other test touches `buildForOrg`).

- [ ] **Step 6: Commit**

```bash
git add gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/bean/HelmValuesBuilder.java \
        gdfkube-src/gdfkube-camel/src/test/java/gov/gdf/camel/bean/HelmValuesBuilderTest.java
git commit -m "drop dead groupRepo parameter from HelmValuesBuilder.buildForOrg"
```

---

## Task 3: Flip `RepoBootstrapRoute` to use the helper

**Files:**
- Modify: `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/RepoBootstrapRoute.java` (lines 26–34 injection block; lines 49–50; line 56)

This task has no dedicated unit test — `RepoBootstrapRoute` is exercised end-to-end. The compile-time injection wiring and the manual grep in Task 5 verify correctness; the full integration suite in Task 6 closes the loop.

- [ ] **Step 1: Inject `HelmValuesBuilder` into the route**

In `RepoBootstrapRoute.java`, add an import after line 11 (`import gov.gdf.camel.model.RequestEvent;`):

```java
import gov.gdf.camel.bean.HelmValuesBuilder;
```

Add an `@Inject` field after the existing `StageUpdater` injection (after line 33, before line 35's `@Override`):

```java

    @Inject
    HelmValuesBuilder helmValuesBuilder;
```

- [ ] **Step 2: Replace the inline composition at lines 49–50**

Change lines 49–50:

```java
                String org = event.requesterGroupName;
                String repoName = giteaOwner + "-" + org;
```

to:

```java
                String org = event.requesterGroupName;
                String repoName = helmValuesBuilder.getRepoName(org);
```

No edit to line 56 needed: `Map.of("repo", giteaOwner + "/" + repoName)` already uses the local `repoName`, which now flows from the helper.

- [ ] **Step 3: Compile and run the module's existing tests**

Run: `./mvnw -pl gdfkube-src/gdfkube-camel test -Dtest='Repo*'`
Expected: PASS for any existing `Repo*Test` classes; no NEW failures introduced by the change. (Behavior is byte-identical when `giteaOwner == "gdfkube"`, which is the test default.)

- [ ] **Step 4: Commit**

```bash
git add gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/RepoBootstrapRoute.java
git commit -m "RepoBootstrapRoute: use HelmValuesBuilder.getRepoName for per-org repo name"
```

---

## Task 4: Update `OrgBootstrapIntegrationTest` mocks/assertions for the new `buildForOrg` signature

**Files:**
- Modify: `gdfkube-src/gdfkube-camel/src/test/java/gov/gdf/camel/routes/OrgBootstrapIntegrationTest.java`

The integration test currently expects `buildForOrg` to be called with two arguments and may also stub it. The new signature breaks compilation until the test is updated. The test should also assert the canonical `gdfkube-<groupId>` repo name reaches `gitRepoBootstrapper.ensure`.

- [ ] **Step 1: Locate the affected lines**

Run: `grep -n "buildForOrg\|gitRepoBootstrapper" gdfkube-src/gdfkube-camel/src/test/java/gov/gdf/camel/routes/OrgBootstrapIntegrationTest.java`

For each `buildForOrg(...)` occurrence:
- If it's a Mockito stub like `when(helmValuesBuilder.buildForOrg(anyString(), anyString())).thenReturn(...)`, change to `when(helmValuesBuilder.buildForOrg(anyString())).thenReturn(...)`.
- If it's a verification like `verify(helmValuesBuilder).buildForOrg(eq("cultura"), eq("gdfkube-cultura"))`, change to `verify(helmValuesBuilder).buildForOrg(eq("cultura"))`.

For each `gitRepoBootstrapper.ensure` verification involving a per-org repo:
- Ensure the second argument literal is `"gdfkube-<groupId>"` (canonical form). If the test currently relies on `eq(giteaOwner + "-cultura")`, change to `eq("gdfkube-cultura")`.

- [ ] **Step 2: Compile to confirm the test surfaces the signature issues**

Run: `./mvnw -pl gdfkube-src/gdfkube-camel test-compile`
Expected: COMPILE PASS after the edits in Step 1; before the edits, COMPILE FAILURE on the `buildForOrg` call sites.

- [ ] **Step 3: Run the integration test (it still expects the OLD inline composition until Task 5 lands the route change)**

Run: `./mvnw -pl gdfkube-src/gdfkube-camel test -Dtest=OrgBootstrapIntegrationTest`
Expected: Tests may still PASS at this point because `OrgBootstrapRoute` line 146 still passes a two-arg call site that no longer compiles. **Therefore: do not commit this task in isolation; pair Task 4 with Task 5 in a single commit.**

(If `mvnw test-compile` failed in Step 2 because `OrgBootstrapRoute.java` itself fails to compile against the new `buildForOrg(String)` signature, that is expected — proceed directly to Task 5 before recompiling.)

---

## Task 5: Flip `OrgBootstrapRoute` to use the helper everywhere

**Files:**
- Modify: `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/OrgBootstrapRoute.java` (lines 101–102, 111–112, 114–115, 146)

- [ ] **Step 1: Drop the local `groupRepo` variable at lines 101–102**

Change lines 101–102:

```java
        String groupId = node.path("_id").asText();
        String groupRepo = node.path("repo").asText("gdfkube-" + groupId);
```

to:

```java
        String groupId = node.path("_id").asText();
```

Rationale: `groupRepo` is no longer threaded into `buildForOrg`, and the helper replaces the literal compositions elsewhere. Reading `node.path("repo")` purely informationally is left to the separate `harden-org-bootstrap-route` change per the proposal's out-of-scope list — but the variable assignment itself is removed here because nothing in this file uses it after the next steps.

- [ ] **Step 2: Replace the inline composition in the per-org `ensure` call at lines 111–112**

Change:

```java
        boolean perOrgCreated = gitRepoBootstrapper.ensure(
                giteaOwner, "gdfkube-" + groupId, "GitOps manifests for " + groupId);
```

to:

```java
        boolean perOrgCreated = gitRepoBootstrapper.ensure(
                giteaOwner, helmValuesBuilder.getRepoName(groupId), "GitOps manifests for " + groupId);
```

- [ ] **Step 3: Replace the inline composition in the audit emit at lines 114–115**

Change:

```java
            auditInterceptor.emit(ROUTE_ID, groupId, 0, "create-repo",
                    Map.of("repo", giteaOwner + "/gdfkube-" + groupId));
```

to:

```java
            auditInterceptor.emit(ROUTE_ID, groupId, 0, "create-repo",
                    Map.of("repo", giteaOwner + "/" + helmValuesBuilder.getRepoName(groupId)));
```

- [ ] **Step 4: Drop the `groupRepo` arg from the `buildForOrg` call at line 146**

Change:

```java
            String valuesPath = helmValuesBuilder.buildForOrg(groupId, groupRepo);
```

to:

```java
            String valuesPath = helmValuesBuilder.buildForOrg(groupId);
```

- [ ] **Step 5: Run the integration test**

Run: `./mvnw -pl gdfkube-src/gdfkube-camel test -Dtest=OrgBootstrapIntegrationTest`
Expected: PASS — the route now matches the test stubs/verifications from Task 4 and the new helper-driven flow.

- [ ] **Step 6: Commit Tasks 4 + 5 together**

```bash
git add gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/OrgBootstrapRoute.java \
        gdfkube-src/gdfkube-camel/src/test/java/gov/gdf/camel/routes/OrgBootstrapIntegrationTest.java
git commit -m "OrgBootstrapRoute: use HelmValuesBuilder.getRepoName, drop groupRepo arg"
```

---

## Task 6: Verify the single-source-of-truth invariant via grep

**Files:** (read-only checks)

- [ ] **Step 1: Confirm `"gdfkube-" + …` survives only inside the helper**

Run: `grep -rn '"gdfkube-" *+' gdfkube-src/gdfkube-camel/src/main/java/`
Expected: Exactly one match, in `HelmValuesBuilder.java`, inside the `getRepoName` method body.

If any other match exists, fix it (it's a missed inline composition) before proceeding.

- [ ] **Step 2: Confirm the old `giteaOwner + "-" …` form is gone**

Run: `grep -rn 'giteaOwner *+ *"-"' gdfkube-src/gdfkube-camel/src/main/java/`
Expected: Zero matches.

If anything matches, that's a leftover from the old `RepoBootstrapRoute` composition or a new occurrence; fix it before proceeding.

---

## Task 7: Full test sweep, chart sanity, pre-commit, final commit

**Files:** (verification only; no source edits)

- [ ] **Step 1: Run the full Camel module test suite**

Run: `./mvnw -pl gdfkube-src/gdfkube-camel test`
Expected: BUILD SUCCESS; all tests green.

- [ ] **Step 2: Confirm the `argocd-org` chart is unchanged and still renders the canonical name**

Run: `helm template demo gdfkube-src/gdfkube-infra/charts/infra/argocd-org --set meta.org=saude | grep -c 'gdfkube-saude.git'`
Expected: Output is a positive integer (≥ 1). This proves we did NOT accidentally touch the chart while doing the route work.

- [ ] **Step 3: Run pre-commit**

Run: `pre-commit run --all-files`
Expected: PASS (trufflehog + any other configured hooks). No secrets introduced.

- [ ] **Step 4: Final commit (if anything remains uncommitted)**

If Steps 1–3 surfaced fixes, commit them now:

```bash
git status
git add <files>
git commit -m "<imperative description of the fix>"
```

If nothing is uncommitted, skip this step — Tasks 1, 2, 3, and 4+5 already produced commits.

---

## Self-Review Checklist (run before handing off)

- **Spec coverage** (`openspec/changes/unify-gitea-repo-naming/specs/camel-orchestrator-stack/spec.md`):
  - ADDED "HelmValuesBuilder SHALL be the single source of truth …" → covered by Tasks 1 + 6 (grep invariant).
  - MODIFIED "HelmValuesBuilder SHALL produce values for org-bootstrap charts" (new single-arg signature) → covered by Task 2 + Task 4 stub update.
  - MODIFIED "org-bootstrap SHALL idempotently provision …" (step 1 and step 7 wording, audit `repo` field) → covered by Task 5 Steps 1–4 and the audit-scenario assertions added in Task 4.
- **Placeholders**: none — every step shows the exact code change and exact command.
- **Type consistency**: `getRepoName` signature `String → String` is used identically in Tasks 1, 3, 5, and 6. `buildForOrg` becomes single-arg in Task 2 and is invoked as such in Tasks 4 and 5.

## Out of Scope (per proposal)

- Removing the `node.path("repo")` read from the group document entirely from `processGroupEvent` (folded into the separate `harden-org-bootstrap-route` change). This plan removes only the local `groupRepo` variable assignment that the unify-naming change directly invalidates; any broader cleanup of the route's reading patterns is the next change's job.
- Renaming existing Gitea repos for in-flight demo orgs (operational runbook, no-op for the demo where `giteaOwner == "gdfkube"`).
- Making the `gdfkube-` prefix configurable.
- Chart edits — `applicationset.yaml` already matches the canonical form.
