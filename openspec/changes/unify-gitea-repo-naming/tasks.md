## 1. Helper method (RED → GREEN)

- [x] 1.1 In `gdfkube-src/gdfkube-camel/src/test/java/.../bean/HelmValuesBuilderTest.java`, add a `getRepoName` test asserting `getRepoName("cultura") == "gdfkube-cultura"` (and a second case e.g. `getRepoName("sec-educ") == "gdfkube-sec-educ"`). Run the test and confirm it fails (method does not exist yet).
- [x] 1.2 Add `public String getRepoName(String groupId) { return "gdfkube-" + groupId; }` to `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/bean/HelmValuesBuilder.java`. Re-run the test from 1.1 and confirm green.

## 2. Drop the `groupRepo` parameter from `buildForOrg`

- [x] 2.1 Update the existing `HelmValuesBuilderTest.buildForOrg_*` tests to call `buildForOrg("cultura")` (single arg). Run them — they will fail to compile until 2.2 lands.
- [x] 2.2 In `HelmValuesBuilder.java`, change `public ... buildForOrg(String groupId, String groupRepo)` → `public ... buildForOrg(String groupId)`. Remove any reference to the dropped parameter inside the body (the audit at line 68 confirmed it was unused). Re-run `./mvnw -pl gdfkube-src/gdfkube-camel test -Dtest=HelmValuesBuilderTest` — green.

## 3. Flip `RepoBootstrapRoute` to use the helper

- [x] 3.1 In `RepoBootstrapRouteTest` (or `RepoBootstrapIntegrationTest`, whichever asserts the `repoName` argument to `gitRepoBootstrapper.ensure`), set `app.system.gitea-owner=gdf` (non-default) and assert the route calls `gitRepoBootstrapper.ensure("gdf", "gdfkube-<org>", ...)` — NOT `"gdf-<org>"`. Run; expect failure with the current `giteaOwner + "-" + org` composition.
- [x] 3.2 Inject `HelmValuesBuilder` into `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/RepoBootstrapRoute.java` (mirror the existing injection pattern in `OrgBootstrapRoute`). Replace lines 49–50:
  - From: `String org = event.requesterGroupName; String repoName = giteaOwner + "-" + org;`
  - To:   `String org = event.requesterGroupName; String repoName = helmValuesBuilder.getRepoName(org);`
  Re-run the test from 3.1 — green.

## 4. Flip `OrgBootstrapRoute` to use the helper and drop the local `groupRepo`

- [x] 4.1 Update `OrgBootstrapIntegrationTest` to:
  (a) drop the second arg from any `helmValuesBuilder.buildForOrg(...)` assertion,
  (b) assert `gitRepoBootstrapper.ensure(giteaOwner, "gdfkube-<groupId>", ...)` for the produced `<groupId>` under a non-default `giteaOwner`,
  (c) assert the emitted audit event's `repo` field equals `"<giteaOwner>/gdfkube-<groupId>"`.
- [x] 4.2 In `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/OrgBootstrapRoute.java`:
  - Delete the local `String groupRepo = node.path("repo").asText("gdfkube-" + groupId);` (line 102).
  - Replace `"gdfkube-" + groupId` at lines 111 and 114 with `helmValuesBuilder.getRepoName(groupId)`.
  - Replace the inline `"repo", giteaOwner + "/gdfkube-" + groupId` audit field with `"repo", giteaOwner + "/" + helmValuesBuilder.getRepoName(groupId)`.
  - Drop the `groupRepo` argument from the `helmValuesBuilder.buildForOrg(groupId, groupRepo)` call at line 146 — leaves `helmValuesBuilder.buildForOrg(groupId)`.
  Re-run `./mvnw -pl gdfkube-src/gdfkube-camel test -Dtest=OrgBootstrapIntegrationTest` — green.

## 5. Verify single-source-of-truth invariant

- [x] 5.1 `grep -rn '"gdfkube-" *+' gdfkube-src/gdfkube-camel/src/main/java/` — the only match SHALL be the body of `HelmValuesBuilder.getRepoName`. If anything else matches, fix it before proceeding.
- [x] 5.2 `grep -rn 'giteaOwner *+ *"-"' gdfkube-src/gdfkube-camel/src/main/java/` — SHALL return zero matches.

## 6. Full test sweep

- [x] 6.1 `./mvnw -pl gdfkube-src/gdfkube-camel test` — entire Camel module green.
- [x] 6.2 Render `argocd-org` chart manually: `helm template demo gdfkube-src/gdfkube-infra/charts/infra/argocd-org --set meta.org=saude | grep 'gdfkube-saude.git'` — SHALL match exactly one line (unchanged behavior, sanity check that we did NOT touch the chart).

## 7. Pre-commit & commit

- [x] 7.1 `pre-commit run --all-files` — green (trufflehog and any other configured hooks).
- [x] 7.2 Commit the change with an imperative message, e.g. `unify per-org gitea repo naming via HelmValuesBuilder.getRepoName`.
