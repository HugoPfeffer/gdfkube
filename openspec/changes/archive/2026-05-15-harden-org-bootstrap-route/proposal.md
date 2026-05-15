## Why

`OrgBootstrapRoute` shipped with `auto-provision-org-resources-from-group-events` works on the golden path but a post-merge audit (verified 2026-05-14 against `OrgBootstrapRoute.java`) found four robustness gaps plus one dead parameter: the `outputDir` scratch directory leaks under `/tmp` per event; `dedupCache.put` runs before helm/git work succeeds, so a transient failure silently suppresses the next legitimate retry for up to 60s; events arriving with neither `__op` nor `op` headers are mis-treated as creates; `/tmp/<groupId>-…` paths collide on concurrent redeliveries; and `HelmValuesBuilder.buildForOrg` carries a `groupRepo` argument it never reads. Fixing these now keeps the route honest before `strengthen-org-bootstrap-tests` codifies the failure-path behavior into tests.

## What Changes

**`outputDir` cleanup**
- From: scratch directory `"/tmp/" + groupId + "-bootstrap-out"` is never deleted; only the values file is cleaned up in `finally`.
- To: `.onCompletion()` walks and deletes the directory tree (mirrors `HelmRenderRoute.java:48-63`); `processGroupEvent` sets `exchange.setProperty("outputDir", outputDir)` so the completion handler can read it back even on exception.
- Reason: avoid `/tmp` leak under repeated events and DLQ replays.
- Impact: non-breaking; observable only via `ls /tmp/bootstrap-*` being empty after normal runs.

**Dedup-after-success**
- From: `dedupCache.put(groupId, …)` runs at line 109, before helm render and `commitAndPush`.
- To: the `containsKey` check stays at line 105, but the `put` moves to immediately after `gitProvider.commitAndPush(...)` and before the `bootstrap` audit emit.
- Reason: a failed exchange currently poisons the cache for 60s; failed events must remain retriable.
- Impact: observable behavior change on the failure path. Trade-off documented in brainstorm.md (crash between commit and audit replays helm render, but `missing.isEmpty()` short-circuits at line 140).

**`op == null` rejection**
- From: missing `__op` and `op` headers fall through to `accepted = true` (treated as create).
- To: missing headers set `accepted = false`, log WARN with the body, drop without retry (parallel to the existing `op == "d"` branch).
- Reason: malformed Debezium messages should not silently provision orgs.
- Impact: observable behavior change for malformed inputs; the golden path is unaffected because real CDC envelopes always carry `__op` or `op`.

**Drop dead `groupRepo` arg**
- From: `helmValuesBuilder.buildForOrg(String groupId, String groupRepo)` and `OrgBootstrapRoute.java:102` reads `node.path("repo").asText("gdfkube-" + groupId)`.
- To: `buildForOrg(String groupId)`; the route no longer reads `node.path("repo")`. The canonical repo name comes from `helmValuesBuilder.getRepoName(groupId)` introduced by `unify-gitea-repo-naming`.
- Reason: `groupRepo` is unused inside `HelmValuesBuilder.java:68-99`; the parameter is dead. Sequenced after `unify-gitea-repo-naming` provides the canonical helper.
- Impact: non-breaking; updates `HelmValuesBuilderTest.java` signature.

**Scoped temp paths**
- From: `"/tmp/" + groupId + "-bootstrap-out"` (route) and `"/tmp/" + groupId + "-bootstrap-values.yaml"` (builder).
- To: `Files.createTempDirectory("bootstrap-" + groupId + "-")` (route) and `Files.createTempFile("bootstrap-" + groupId + "-", ".yaml")` (builder).
- Reason: concurrent redeliveries for the same `groupId` collide on disk; `REPO_LOCKS` only guards the git work tree, not the helm-render output.
- Impact: non-breaking; per-process unique paths.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `camel-orchestrator-stack`: tighten the `org-bootstrap` requirement set — add cleanup, dedup-after-success, `op==null` rejection, scoped temp paths, and remove the dead `groupRepo` argument from `HelmValuesBuilder.buildForOrg`.

## Impact

- **Code**: `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/OrgBootstrapRoute.java` (~30 LOC delta); `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/bean/HelmValuesBuilder.java` (signature change + temp-file API).
- **Tests**: `HelmValuesBuilderTest.java` (signature update); `OrgBootstrapRouteTest.java` / `PipelineIntegrationTest.java` need a new scenario verifying `dedupCache` stays empty after a helm-render failure (this scenario is the seed for `strengthen-org-bootstrap-tests`).
- **APIs / wire format**: no change to Kafka topics, MongoDB collections, or HTTP endpoints. `dlq.gdfkube.groups` still receives exception flows; `op==null` events do NOT go to DLQ — they are dropped at the route head and the offset is committed.
- **Dependencies**: no new libraries. Uses existing `java.nio.file.Files` APIs already pulled in by `HelmRenderRoute`.
- **Downstream consumers**: `dlq-handler` (no change), `audit-sink` (no change — `bootstrap` audit emits unchanged on the golden path).
- **Sequencing**: blocked by `unify-gitea-repo-naming`; blocks `strengthen-org-bootstrap-tests`.
- **Testing strategy**:
  - Unit: `HelmValuesBuilderTest` updates to new `buildForOrg(String)` signature; new test for `Files.createTempFile` path shape.
  - Integration: `PipelineIntegrationTest` adds (a) helm-failure-clears-cache, (b) `op==null` dropped without commit, (c) outputDir cleanup post-completion.
  - Contract: none affected.
