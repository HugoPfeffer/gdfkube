# ArgoCD

> **Implementation Status:** Partially implemented
> **Source:** Handoff `app.jsx` + `uploads/gitops-platform.md`
> **Last validated:** 2026-05-21

## Specs

- [`argocd-org-stack`](../openspec/specs/argocd-org-stack/spec.md)

## Role in the Pipeline

```
[Gitea: gdfkube-infra]  ──▶ ArgoCD discovery ApplicationSet ──▶ per-org AppProjects + ApplicationSets
[Gitea: gdfkube-{org}]  ──▶ per-org ApplicationSets ──▶ Applications ──▶ HostedCluster / NodePool / ManagedCluster
```

A single ArgoCD instance — the **platform ArgoCD** (`openshift-gitops`) on the hub cluster — owns everything: platform infrastructure, org discovery, per-org AppProjects, and per-org ApplicationSets. It uses automated sync with prune and self-heal. The demo relies heavily on cluster-scoped manifests, and `openshift-gitops` already holds the cluster-scoped permissions to manage them; consolidating on it avoids re-configuring a second ArgoCD operator instance.

## Responsibilities

- Reconcile manifests from Git into the hub cluster.
- Enforce per-org isolation through AppProject scoping.
- Provide the operator-facing approval surface (the "Sync" button).
- **Does NOT** render manifests (Helm/Camel does), pre-create namespaces unsynced (use sync-waves), or notify the portal directly (the portal subscribes to `gdfkube.pipeline.status`, populated by Camel).

## Design

### Tech

- ArgoCD on OpenShift GitOps (Argo Operator).
- Single instance in namespace `openshift-gitops`, on the hub cluster. It owns platform infrastructure and all tenant artifacts.
- API: `argoproj.io/v1alpha1`.

### Repo Wiring

#### Discovery (GitOps-managed)

The discovery ApplicationSet is reconciled by the platform Application `gdfkube-org-discovery`, which syncs everything under `platform/manifests/org-discovery/`. The manifest lives at `gdfkube-src/gdfkube-infra/platform/manifests/org-discovery/org-repos-discovery.yaml`.

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: gdfkube-infra-orgs
  namespace: openshift-gitops
spec:
  generators:
    - git:
        repoURL: http://gitea.gdfkube.svc:3000/gdfkube/gdfkube-orgs.git
        revision: HEAD
        directories:
          - path: orgs/*
  template:
    metadata:
      name: 'gdfkube-infra-{{path.basename}}'
    spec:
      project: default
      source:
        repoURL: http://gitea.gdfkube.svc:3000/gdfkube/gdfkube-orgs.git
        targetRevision: HEAD
        path: '{{path}}'
      destination:
        server: https://kubernetes.default.svc
        namespace: openshift-gitops
      syncPolicy: {}
```

This ApplicationSet renders the per-org AppProject + ApplicationSet pair inside the `openshift-gitops` namespace. Camel's `org-bootstrap` route pushes rendered output into `gdfkube-orgs/orgs/{org}/`.

#### Per-org AppProject (rendered by Camel into `gdfkube-orgs/orgs/{org}/`)

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AppProject
metadata:
  name: saude
  namespace: openshift-gitops
spec:
  description: "Customer org: saude (Secretaria de Saúde)"
  sourceRepos:
    - http://gitea.gdfkube.svc:3000/gdfkube/gdfkube-saude.git
  destinations:
    - namespace: 'hc-saude-*'
      server: https://kubernetes.default.svc
    - namespace: 'ns-saude-*'
      server: https://kubernetes.default.svc
  clusterResourceWhitelist:
    - group: 'hypershift.openshift.io'
      kind: HostedCluster
    - group: 'hypershift.openshift.io'
      kind: NodePool
    - group: 'cluster.open-cluster-management.io'
      kind: ManagedCluster
    - group: ''
      kind: Namespace
  namespaceResourceBlacklist:
    - group: ''
      kind: ResourceQuota                # platform admin owns quotas
    - group: ''
      kind: LimitRange
  roles:
    - name: org-operator
      description: "Sync rights scoped to this AppProject"
      policies:
        - p, proj:saude:org-operator, applications, sync, saude/*, allow
        - p, proj:saude:org-operator, applications, get, saude/*, allow
      groups:
        - saude-operator                  # group claim from auth
```

#### Per-org ApplicationSet

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: appset-saude
  namespace: openshift-gitops
spec:
  generators:
    - git:
        repoURL: http://gitea.gdfkube.svc:3000/gdfkube/gdfkube-saude.git
        revision: HEAD
        directories:
          - path: clusters/*
          - path: namespaces/*
          - path: scale-patches/*
  template:
    metadata:
      name: 'saude-{{path.basename}}'
    spec:
      project: saude
      source:
        repoURL: http://gitea.gdfkube.svc:3000/gdfkube/gdfkube-saude.git
        targetRevision: HEAD
        path: '{{path}}'
      destination:
        server: https://kubernetes.default.svc
      syncPolicy:
        automated:
          prune: true
          selfHeal: true
        syncOptions:
          - CreateNamespace=true
```

### Sync Policy

**All syncs are automated** with prune and self-heal:

- **Platform apps** — the `gdfkube-platform` Helm helper sets `syncPolicy.automated` with prune and selfHeal on every child Application, including `gdfkube-org-discovery`.
- **Tenant workloads** — per-org ApplicationSets generate Applications with `syncPolicy.automated` (prune + selfHeal + `CreateNamespace=true`). When Camel pushes rendered manifests to a tenant repo, `openshift-gitops` syncs them automatically.

The earlier design decision requiring manual sync has been superseded. Automated sync simplifies the demo flow by removing the operator-approval step; real deployments can re-add sync windows or manual gates as needed.

### RBAC (Casbin)

Two-layer enforcement:

1. **AppProject scope** — declarative restriction of allowed source repos and destination namespaces. ArgoCD refuses to create Applications outside the project's scope.
2. **Casbin policies** in `argocd-rbac-cm`:

```
p, role:setic-admin, applications, *, */*, allow
p, role:setic-admin, projects, *, *, allow

# Per-org operator role bound to the matching project
p, role:saude-operator, applications, sync, saude/*, allow
p, role:saude-operator, applications, get,  saude/*, allow
p, role:saude-operator, applications, action/*, saude/*, allow

g, setic-admin@gdfkube.gov.br, role:setic-admin
g, saude-operator-group,        role:saude-operator
```

Demo binds these via the static-user list (the ITSM `admin` becomes `setic-admin`; ITSM `operator`s in the saude group become `saude-operator`). Real auth (OIDC + group claims) is deferred.

### Sync Waves

Manifests use sync-wave annotations so dependencies apply in order:

| Wave | Resource |
|---|---|
| -10 | Namespace (created first) |
| -5 | RBAC, NetworkPolicies |
| 0 | HostedCluster, NodePool |
| 5 | ManagedCluster |
| 10 | ConfigurationPolicy bindings |

## Interfaces

| Direction | Counterpart | Protocol |
|---|---|---|
| Inbound | Gitea | HTTPS clone (read-only) |
| Outbound | Hub Kubernetes API | HTTPS (server-side apply) |
| Inbound | Operator UI | HTTPS (ArgoCD web UI) |

## Operational Concerns

- **Automated sync** — both platform and tenant Applications use prune + selfHeal. No manual "Sync" clicks required for the demo flow.
- **Sync window:** none configured. Operators can sync any time.
- **Self-healing:** enabled via `selfHeal: true` on all automated sync policies. Drift is auto-corrected.
- **Notifications:** out of scope for this iteration; could route to portal SSE in future.

## Decisions Resolved

- Single ArgoCD instance (`openshift-gitops`) owns both platform infrastructure and tenant workloads. A dedicated demo instance (`gdfkube-gitops`) was trialed and rolled back: the demo leans on cluster-scoped manifests and `openshift-gitops` already has those permissions, so a second operator instance added configuration burden without benefit.
- Automated sync (prune + selfHeal) for both platform and tenant workloads — simplifies the demo flow.
- Two-layer isolation: AppProject scope (source repos + destinations) **plus** Casbin RBAC (per-org sync rights).
- Discovery ApplicationSet bootstraps per-org Applications from `gdfkube-orgs/orgs/*`.
- ApplicationSet names use `appset-<org>` prefix (disambiguates from AppProject).
- All git revisions use `HEAD` (survives branch renames).

## Open Questions

- Sync windows / change-freeze enforcement: none configured.
- Notification routing back to the portal: deferred.
- ArgoCD HA topology (replicas, redis sentinel): not specified.

## Migration Notes

For clusters that previously ran the two-instance layout (with the `gdfkube-gitops` demo ArgoCD):

1. Apply the platform app-of-apps: `oc apply -n openshift-gitops -f gdfkube-src/gdfkube-infra/platform/app-of-apps.yaml`
2. Remove the old demo instance and its namespace: `oc delete argocd gdfkube-gitops -n gdfkube-gitops` then `oc delete namespace gdfkube-gitops`.
3. `openshift-gitops` reconciles the `gdfkube-org-discovery` Application, which recreates the discovery ApplicationSet and all per-org AppProjects/ApplicationSets in the `openshift-gitops` namespace automatically.

## References

- [08-git.md](./08-git.md) — repo layout that ApplicationSets traverse.
- [10-rhacm.md](./10-rhacm.md) — RHACM resources synced via ArgoCD.
- [12-security-rbac.md](./12-security-rbac.md) — broader RBAC story including non-ArgoCD layers.
