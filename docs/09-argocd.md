# ArgoCD

> **Implementation Status:** Partially implemented
> **Source:** Handoff `app.jsx` + `uploads/gitops-platform.md`
> **Last validated:** 2026-05-15

## Specs

- [`argocd-org-stack`](../openspec/changes/realize-gitops-provisioning-templates/specs/argocd-org-stack/spec.md)

## Role in the Pipeline

```
[Gitea: gdfkube-infra]  ──▶ ArgoCD discovery ApplicationSet ──▶ per-org AppProjects + ApplicationSets
[Gitea: gdfkube-{org}]  ──▶ per-org ApplicationSets ──▶ Applications ──▶ HostedCluster / NodePool / ManagedCluster
```

ArgoCD is the only thing that talks to the Kubernetes API in the
provisioning path. Manual sync gates every change; auto-sync is disabled.

## Responsibilities

- Reconcile manifests from Git into the hub cluster.
- Enforce per-org isolation through AppProject scoping.
- Provide the operator-facing approval surface (the "Sync" button).
- **Does NOT** render manifests (Helm/Camel does), pre-create namespaces unsynced (use sync-waves), or notify the portal directly (the portal subscribes to `gdfkube.pipeline.status`, populated by Camel).

## Design

### Tech

- ArgoCD on OpenShift GitOps (Argo Operator).
- Single instance in namespace `openshift-gitops`, on the hub cluster.
- API: `argoproj.io/v1alpha1`.

### Repo Wiring

#### Discovery (one-time bootstrap)

Hand-applied once: `gdfkube-src/gdfkube-infra/argocd/discovery/org-repos-discovery.yaml`.

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: gdfkube-infra-orgs
  namespace: openshift-gitops
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
        namespace: openshift-gitops
      syncPolicy: {}                      # no auto-sync
```

This ApplicationSet renders the per-org AppProject + ApplicationSet pair. Camel's `org-bootstrap` route pushes rendered output into `gdfkube-orgs/orgs/{org}/`.

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
  namespace: openshift-gitops
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
      syncPolicy: {}                      # no auto-sync
```

### Sync Policy

**All syncs are manual.** No `automated:` block on either repo:

- `gdfkube-infra` Applications require manual sync — adding a new org is a deliberate platform action.
- `gdfkube-{org}` Applications require manual sync — operator reviews the diff before provisioning a hosted cluster.

The handoff's "ArgoCD self-syncs when Camel pushes to gdfkube-infra" claim is **rejected**. Both repos are gated.

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

- **Diff review** is a deliberate workflow step — operators see the manifest set per Application before clicking Sync.
- **Sync window:** none configured. Operators can sync any time.
- **Self-healing:** disabled (no auto-sync, no auto-prune). Drift remediation is manual.
- **Notifications:** out of scope for this iteration; could route to portal SSE in future.

## Decisions Resolved

- All sync is manual (both `gdfkube-infra` and `gdfkube-{org}`).
- Two-layer isolation: AppProject scope (source repos + destinations) **plus** Casbin RBAC (per-org sync rights).
- Single ArgoCD instance in `openshift-gitops`. No multi-tenancy via separate ArgoCDs.
- Discovery ApplicationSet bootstraps per-org Applications from `gdfkube-orgs/orgs/*`.
- ApplicationSet names use `appset-<org>` prefix (disambiguates from AppProject).
- All git revisions use `HEAD` (survives branch renames).

## Open Questions

- Sync windows / change-freeze enforcement: none configured.
- Notification routing back to the portal: deferred.
- ArgoCD HA topology (replicas, redis sentinel): not specified.

## References

- [08-git.md](./08-git.md) — repo layout that ApplicationSets traverse.
- [10-rhacm.md](./10-rhacm.md) — RHACM resources synced via ArgoCD.
- [12-security-rbac.md](./12-security-rbac.md) — broader RBAC story including non-ArgoCD layers.
