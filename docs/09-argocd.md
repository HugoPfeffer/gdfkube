# ArgoCD

> **Implementation Status:** Partially implemented
> **Source:** Handoff `app.jsx` + `uploads/gitops-platform.md`
> **Last validated:** 2026-05-21

## Specs

- [`argocd-org-stack`](../openspec/specs/argocd-org-stack/spec.md)
- [`argocd-demo-instance`](../openspec/specs/argocd-demo-instance/spec.md)

## Role in the Pipeline

```
[Gitea: gdfkube-infra]  ──▶ ArgoCD discovery ApplicationSet ──▶ per-org AppProjects + ApplicationSets
[Gitea: gdfkube-{org}]  ──▶ per-org ApplicationSets ──▶ Applications ──▶ HostedCluster / NodePool / ManagedCluster
```

Two ArgoCD instances collaborate. The **platform ArgoCD** (`openshift-gitops`) manages infrastructure and bootstraps the **demo ArgoCD** (`gdfkube-gitops`). The demo instance owns all tenant workloads — org discovery, AppProjects, and per-org ApplicationSets. Both instances use automated sync with prune and self-heal.

## Responsibilities

- Reconcile manifests from Git into the hub cluster.
- Enforce per-org isolation through AppProject scoping.
- Provide the operator-facing approval surface (the "Sync" button).
- **Does NOT** render manifests (Helm/Camel does), pre-create namespaces unsynced (use sync-waves), or notify the portal directly (the portal subscribes to `gdfkube.pipeline.status`, populated by Camel).

## Design

### Tech

- ArgoCD on OpenShift GitOps (Argo Operator).
- Platform instance in namespace `openshift-gitops`, on the hub cluster.
- Demo instance `gdfkube-gitops` in namespace `gdfkube-gitops`, bootstrapped by the platform ArgoCD as child Application `gdfkube-argocd-demo`.
- API: `argoproj.io/v1alpha1`.

### Repo Wiring

#### Discovery (GitOps-managed)

The discovery ApplicationSet is reconciled by the platform Application `gdfkube-argocd-demo`, which syncs everything under `platform/manifests/argocd-demo/`. The manifest lives at `gdfkube-src/gdfkube-infra/platform/manifests/argocd-demo/org-repos-discovery.yaml`.

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: gdfkube-infra-orgs
  namespace: gdfkube-gitops
spec:
  generators:
    - git:
        repoURL: https://gitea-gitea.apps.gdfkube.gov/gdfkube/gdfkube-orgs.git
        revision: HEAD
        directories:
          - path: orgs/*
  template:
    metadata:
      name: 'gdfkube-infra-{{path.basename}}'
    spec:
      project: default
      source:
        repoURL: https://gitea-gitea.apps.gdfkube.gov/gdfkube/gdfkube-orgs.git
        targetRevision: HEAD
        path: '{{path}}'
      destination:
        server: https://kubernetes.default.svc
        namespace: gdfkube-gitops
      syncPolicy: {}
```

This ApplicationSet renders the per-org AppProject + ApplicationSet pair inside the `gdfkube-gitops` namespace. Camel's `org-bootstrap` route pushes rendered output into `gdfkube-orgs/orgs/{org}/`.

#### Per-org AppProject (rendered by Camel into `gdfkube-orgs/orgs/{org}/`)

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AppProject
metadata:
  name: saude
  namespace: gdfkube-gitops
spec:
  description: "Customer org: saude (Secretaria de Saúde)"
  sourceRepos:
    - https://gitea-gitea.apps.gdfkube.gov/gdfkube/gdfkube-saude.git
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
  namespace: gdfkube-gitops
spec:
  generators:
    - git:
        repoURL: https://gitea-gitea.apps.gdfkube.gov/gdfkube/gdfkube-saude.git
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
        repoURL: https://gitea-gitea.apps.gdfkube.gov/gdfkube/gdfkube-saude.git
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

- **Platform apps** (`openshift-gitops`) — the `gdfkube-platform` Helm helper sets `syncPolicy.automated` with prune and selfHeal on every child Application, including `gdfkube-argocd-demo`.
- **Tenant workloads** (`gdfkube-gitops`) — per-org ApplicationSets generate Applications with `syncPolicy.automated` (prune + selfHeal + `CreateNamespace=true`). When Camel pushes rendered manifests to a tenant repo, the demo ArgoCD syncs them automatically.

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

- Dual ArgoCD instances: platform (`openshift-gitops`) for infrastructure, demo (`gdfkube-gitops`) for tenant workloads. The platform instance bootstraps the demo instance via `gdfkube-argocd-demo`.
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

For clusters that previously ran the demo with the single-instance layout:

1. Apply the platform app-of-apps: `oc apply -n openshift-gitops -f gdfkube-src/gdfkube-infra/platform/app-of-apps.yaml`
2. Remove stale tenant resources from the old namespace: `oc delete application,appproject,applicationset -n openshift-gitops -l gdfkube.io/managed=true`
3. The demo ArgoCD (`gdfkube-gitops`) will recreate all tenant artifacts in its own namespace automatically.

## References

- [08-git.md](./08-git.md) — repo layout that ApplicationSets traverse.
- [10-rhacm.md](./10-rhacm.md) — RHACM resources synced via ArgoCD.
- [12-security-rbac.md](./12-security-rbac.md) — broader RBAC story including non-ArgoCD layers.
