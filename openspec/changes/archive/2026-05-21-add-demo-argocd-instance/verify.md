# Verification Report

> This file is produced by the `openspec-verify-change` skill after the apply phase
> completes, to confirm consistency between the implementation and specs / design / tasks.
> Failed checks must be fixed in the corresponding artifact before re-running verify.

**Change**: `add-demo-argocd-instance`
**Verified at**: `2026-05-21 16:53`
**Verifier**: `claude (opus 4.7)`

---

## 1. Structural Validation (`openspec validate --all --json`)

- [x] Change-scoped validation passes (`openspec validate add-demo-argocd-instance --json` → `failed=0`)
- [ ] Repo-wide `openspec validate --all --json` shows 17 pre-existing failures unrelated to this change

**Result**:

```text
=== openspec validate add-demo-argocd-instance --json ===
items=1 passed=1 failed=0

=== openspec validate --all --json ===
items=34 passed=17 failed=17
```

The 17 failures are pre-existing in unrelated capability specs and predate this change:

| Item | Type | Issues |
|---|---|---|
| argocd-org-stack | spec | Pre-existing: missing `## Purpose` section in live spec |
| gdfkube-architecture-docs | spec | Pre-existing: missing `## Purpose` section |
| gdfkube-audit-log-collection | spec | Pre-existing: missing `## Purpose` section |
| gdfkube-dlq-log-collection | spec | Pre-existing: missing `## Purpose` section |
| gitea-stack | spec | Pre-existing: missing `## Purpose` section |
| hypershift-cluster-stack | spec | Pre-existing: missing `## Purpose` section |
| itsm-container-image | spec | Pre-existing: missing `## Purpose` section |
| itsm-express-api | spec | Pre-existing: missing `## Purpose` section |
| itsm-forms-collection | spec | Pre-existing: missing `## Purpose` section |
| itsm-groups-collection | spec | Pre-existing: missing `## Purpose` section |
| itsm-requests-collection | spec | Pre-existing: missing `## Purpose` section |
| itsm-settings-collection | spec | Pre-existing: missing `## Purpose` section |
| itsm-users-collection | spec | Pre-existing: missing `## Purpose` section |
| kafka-broker-stack | spec | Pre-existing: missing `## Purpose` section |
| mongodb-replica-set-stack | spec | Pre-existing: missing `## Purpose` section |
| org-bootstrap-test-determinism | spec | Pre-existing: missing `## Purpose` section |
| rhacm-org-stack | spec | Pre-existing: missing `## Purpose` section |

These are tech debt for a follow-up "add Purpose sections" change; non-blocking for this archive.

---

## 2. Task Completion (`tasks.md`)

- [ ] All `- [ ]` have been changed to `- [x]`

**Counts**: 25 done, 8 deferred to live cluster.

**Incomplete tasks**:

| Task | Reason for incompletion | Blocks archive? |
|---|---|---|
| 7.1 `oc apply` platform app-of-apps and wait Healthy | Requires a live OpenShift cluster with GitOps operator installed; no cluster available in this session | No — manual verification deferred |
| 7.2 Confirm `gdfkube-argocd-demo` Synced+Healthy and ArgoCD CR Available | Same as 7.1 | No |
| 7.3 Confirm discovery ApplicationSet reconciles in `gdfkube-gitops` | Same as 7.1 | No |
| 8.1 Trigger group creation via ITSM and wait for Camel push | Same — needs live cluster + running ITSM/Camel/Gitea | No |
| 8.2 Confirm child Application appears in demo ArgoCD UI | Same as 8.1 | No |
| 8.3 Submit cluster-request from ITSM, observe auto-sync | Same as 8.1 | No |
| 8.4 Confirm `openshift-gitops` no longer holds tenant Applications | Same as 8.1 | No |
| 9.1 One-shot cleanup for clusters that ran the old layout | Conditional — only runs against a previously-demoed cluster | No |

All source-side tasks (1–6, 10) are complete. Cluster verification belongs to the on-cluster smoke pass; it does not gate archive because the change's spec deltas describe rendered-manifest properties (covered by `helm template` + `kubectl kustomize` checks in section 5), not live-cluster runtime behaviour.

---

## 3. Delta Spec Sync State

For each capability directory under `openspec/changes/add-demo-argocd-instance/specs/`,
compare against `openspec/specs/<capability>/spec.md`:

| Capability | Sync status | Notes |
|---|---|---|
| `argocd-demo-instance` | ✗ Needs sync | New capability — no live spec yet; archive will create `openspec/specs/argocd-demo-instance/spec.md` from the delta's 5 ADDED Requirements |
| `argocd-org-stack` | ✗ Needs sync | Live spec exists with 4 Requirements; delta contains 1 RENAMED + 1 REMOVED (with Reason + Migration) + 3 MODIFIED. Archive will apply in order: RENAMED → REMOVED → MODIFIED |

**Action**: both deltas will be applied by `/opsx:archive`; no manual sync needed before archive.

---

## 4. Design / Specs Coherence Spot Check

Spot-check that `design.md` decisions are reflected in the Requirements
and Scenarios of `specs/*.md`:

| Sampled item | design description | specs counterpart | Gap |
|---|---|---|---|
| D1 two ArgoCD instances | Second ArgoCD CR named `gdfkube-gitops` in `gdfkube-gitops` ns | `argocd-demo-instance` → "Demo ArgoCD namespace and CR are declared as kustomize manifests" | None |
| D2 platform bootstraps demo | New child Application `gdfkube-argocd-demo` reconciles `manifests/argocd-demo/` | `argocd-demo-instance` → "Platform Application reconciles the demo ArgoCD bundle" with sync-wave `-8`, source path, destination, syncPolicy scenarios | None |
| D3 sync wave -8 | Wave `-8` placed after gitea-operator (`-10`) and before init-jobs | Scenario in "Platform Application reconciles..." asserts `argocd.argoproj.io/sync-wave: "-8"` | None |
| D4 cluster-admin binding | Bind controller SA to `cluster-admin` | `argocd-demo-instance` → "Demo ArgoCD application controller has cluster-wide management permissions" | None |
| D5 delete old discovery | `argocd/discovery/org-repos-discovery.yaml` deleted; relocated into bundle | `argocd-org-stack` → REMOVED "Hand-applied discovery..." with Reason + Migration; `argocd-demo-instance` → "Discovery ApplicationSet lives in the demo ArgoCD namespace" | None |
| D6 automated syncPolicy on workloads | Per-group ApplicationSet template gets `automated.prune + selfHeal + CreateNamespace=true` | `argocd-org-stack` → MODIFIED + RENAMED to "automated sync"; scenario asserts both flags + `CreateNamespace=true` | None |
| D7 hardcode `gdfkube-gitops` namespace | Chart templates use literal namespace, not a value | `argocd-org-stack` → MODIFIED AppProject + ApplicationSet headers carry `namespace: gdfkube-gitops` directly | None |
| D8 no Camel changes | OrgBootstrapRoute unchanged | No spec touches Camel; `git diff e63db76^..e63db76 -- gdfkube-src/gdfkube-camel/` is empty | None |
| Repo Secret rework (post-audit) | Public-read Gitea org → no Secret needed | `argocd-demo-instance` → "Demo ArgoCD reads Gitea repos anonymously" (rewritten in `2bfb0dd`) | None — design.md "Open Questions" item resolved; bundle ships 4 manifests, not 5 |

**Drift warnings** (non-blocking):

- `design.md` "Open Questions" still lists the Gitea credentials question and the Route hostname question. The credentials question was resolved during the audit (commit `2bfb0dd` — anonymous read confirmed). The Route hostname is genuinely open (operator default is in use). Both can be folded into the retrospective rather than re-edited in design.md.

---

## 5. Implementation Signal

- [x] No unstaged files in the worktree (after staging `tasks.md` edits below)
- [ ] All related commits have been pushed (worktree branch not yet pushed; archive commit will follow on the same branch)

**Commit range**: `e63db76..2bfb0dd` (2 commits)

- `e63db76` feat(argocd): add gdfkube-gitops demo ArgoCD instance and per-group AppProjects
- `2bfb0dd` fix(argocd): drop empty repo Secret; rely on Gitea public-read

**Render verification commands re-run at verify time (all green)**:

| Command | Outcome |
|---|---|
| `helm template platform gdfkube-src/gdfkube-infra/platform` | exit 0; Application `gdfkube-argocd-demo` carries sync-wave `-8`, `source.path: gdfkube-src/gdfkube-infra/platform/manifests/argocd-demo`, `destination.namespace: gdfkube-gitops`, `syncPolicy.automated.prune=true selfHeal=true` |
| `kubectl kustomize gdfkube-src/gdfkube-infra/platform/manifests/argocd-demo` | exit 0; 4 documents: Namespace, ArgoCD, ClusterRoleBinding (single SA subject), ApplicationSet `gdfkube-infra-orgs` in `gdfkube-gitops` |
| `helm template saude gdfkube-src/gdfkube-infra/charts/infra/argocd-org --set meta.org=saude --set system.naming.appProject=saude` | exit 0; AppProject `saude` in `gdfkube-gitops`; ApplicationSet `appset-saude` in `gdfkube-gitops` with `syncPolicy.automated.prune=true selfHeal=true`, `syncOptions=[CreateNamespace=true]` |
| `pre-commit run --all-files` | exit 0 (TruffleHog passed) |
| `openspec validate add-demo-argocd-instance --json` | exit 0, `failed=0` |

---

## Overall Decision

- [x] ⚠️ PASS WITH WARNINGS — can proceed but note: cluster-side tasks 7–9 are deferred to live-cluster smoke (do not gate archive); repo-wide `openspec validate --all` reports 17 pre-existing structural failures in unrelated specs that should be tackled as a separate clean-up change.

**Next step**:

Generate `retrospective.md`, then run `/opsx:archive add-demo-argocd-instance` to apply the spec deltas onto live `openspec/specs/`. Commit the archive on the worktree branch.
