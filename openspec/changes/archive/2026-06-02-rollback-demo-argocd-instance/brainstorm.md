# Brainstorm: rollback-demo-argocd-instance

> Decisions were gathered interactively (plan-mode `AskUserQuestion`) and recorded here from those answers.

## Problem

The `add-demo-argocd-instance` change (archived 2026-05-21) stood up a second ArgoCD instance (`gdfkube-gitops`) to own tenant artifacts. In practice the demo's workloads are mostly cluster-scoped (HyperShift + RHACM), and the main `openshift-gitops` instance already holds the cluster-scoped permissions. Standing up and matching a second operator instance's RBAC/source-namespace config is disproportionate overhead for a demo. Goal: roll back to a single `openshift-gitops` instance.

## Options considered

- **A — `git revert` the four commits.** Rejected: `b555a75` also introduced the in-cluster Gitea DNS URL (a good fix worth keeping), and a revert would collide with the later `org-provision-via-request-pipeline` merge. Surgical edits are cleaner.
- **B — surgical edits, keep good fixes.** Chosen. Delete the second-instance definition, re-point discovery + per-org templates to `openshift-gitops`, keep the in-cluster Gitea URL.

## Decisions (from `AskUserQuestion`)

1. **Discovery wiring** → *Keep GitOps-managed on the main instance.* Re-point the discovery ApplicationSet to `openshift-gitops` via a renamed platform Application (`gdfkube-org-discovery`) rather than restoring the pre-feature hand-applied file. Avoids reintroducing manual toil.
2. **Per-org sync policy** → *Keep automated sync.* Only the namespace flips `gdfkube-gitops` → `openshift-gitops`; the automated `syncPolicy` (prune/selfHeal/CreateNamespace) stays.
3. **Workflow** → *Full OpenSpec change* — proposal/design/tasks + delta specs, and update the published specs.

## Open questions

- None blocking. Cluster-side cleanup of an already-deployed `gdfkube-gitops` instance is a manual migration step, documented in `design.md` D3 and `docs/09-argocd.md` Migration Notes.
