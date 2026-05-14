## Why

Two Camel routes compose the per-org Gitea repo name two different ways: `RepoBootstrapRoute` uses `giteaOwner + "-" + org`, while `OrgBootstrapRoute` and the ArgoCD `applicationset.yaml` use `"gdfkube-" + groupId`. They agree only while `giteaOwner == "gdfkube"`; the first non-default owner produces a split-brain where ArgoCD reads from one repo and Camel writes to another. Centralizing the rule in a single helper removes the drift before it surfaces in production. Source of truth for this finding: `tmp/unified-audit-findings.md` C-1 + M-1.

## What Changes

**Repo-name composition**
- From: `RepoBootstrapRoute` composes `giteaOwner + "-" + org` inline; `OrgBootstrapRoute` composes `"gdfkube-" + groupId` inline (with a `node.path("repo")` override).
- To: Both routes call a single `HelmValuesBuilder.getRepoName(String groupId)` helper returning `"gdfkube-" + groupId`.
- Reason: Eliminate the cross-route naming drift (C-1). The `gdfkube-` prefix is a brand constant, not an owner-derived value.
- Impact: Non-breaking. The two compositions are identical in the demo (`giteaOwner == "gdfkube"`); the helper makes that identity invariant going forward.

**`HelmValuesBuilder.buildForOrg` signature**
- From: `buildForOrg(String groupId, String groupRepo)` — `groupRepo` is read in but never used.
- To: `buildForOrg(String groupId)` — caller no longer threads a redundant repo name through.
- Reason: M-1 — the parameter is dead. The repo name is derivable from `groupId` via the new helper.
- Impact: Breaking signature change limited to one internal caller (`OrgBootstrapRoute`) and two tests (`HelmValuesBuilderTest`, `OrgBootstrapIntegrationTest`).

**Audit-log `repo` field**
- From: `Map.of("repo", giteaOwner + "/gdfkube-" + groupId)` (inline composition in `OrgBootstrapRoute`).
- To: `Map.of("repo", giteaOwner + "/" + helmValuesBuilder.getRepoName(groupId))`.
- Reason: Same single-source-of-truth principle. Audit consumers see the same string in the demo.
- Impact: Non-breaking; payload field unchanged.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `camel-orchestrator-stack`: tighten the contract for per-org repo naming. Add a requirement that `HelmValuesBuilder.getRepoName(String groupId)` is the single source of truth for the per-org Gitea repo name and that `RepoBootstrapRoute` and `OrgBootstrapRoute` consume it. Update the existing `HelmValuesBuilder` requirement to take `buildForOrg(String groupId)` (drop the unused `groupRepo` parameter).

## Impact

- **Code**: `gdfkube-src/gdfkube-camel/.../bean/HelmValuesBuilder.java` (add helper, change signature); `gdfkube-src/gdfkube-camel/.../routes/RepoBootstrapRoute.java` (inject `HelmValuesBuilder`, call helper); `gdfkube-src/gdfkube-camel/.../routes/OrgBootstrapRoute.java` (replace inline compositions, drop local `groupRepo`, drop `groupRepo` from `buildForOrg` call).
- **Tests**: `HelmValuesBuilderTest.java` (add `getRepoName` coverage, update `buildForOrg` invocations); `OrgBootstrapIntegrationTest.java` (update `buildForOrg` invocations); add an integration assertion that both routes call `gitRepoBootstrapper.ensure(giteaOwner, "gdfkube-<org>", ...)` for the same `<org>`.
- **Charts/manifests**: None. `gdfkube-src/gdfkube-infra/charts/infra/argocd-org/applicationset.yaml` already references `gdfkube-{{ .Values.meta.org }}.git` (canonical form).
- **Docs/specs**: One delta in `openspec/specs/camel-orchestrator-stack/spec.md`. No `docs/` edits — existing docs already use `gdfkube-{groupId}`.
- **Kafka / MongoDB / Helm values**: No topic, schema, or chart-values changes. No consumer-group rebalance.
- **Dependencies**: No new dependencies. No version changes.
- **Operational**: Existing Gitea repos do not need renaming — for the demo `giteaOwner == "gdfkube"` so the produced names are unchanged. A future non-default owner is the only scenario where this change becomes observable, and it produces the correct, single name on both sides.
- **Blocks**: `harden-org-bootstrap-route` (also edits `OrgBootstrapRoute.processGroupEvent`). Sequence this change first so the two don't conflict on the same lines.
