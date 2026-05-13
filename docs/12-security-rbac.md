# Security & RBAC

> **Implementation Status:** Planned
> **Source:** Handoff `app.jsx` + `uploads/gitops-platform.md`
> **Last validated:** 2026-05-05

## Role in the Pipeline

This is a cross-cutting doc, not a pipeline stage. It pulls together the
identity, authorization, and secret-distribution layers that constrain what
each component is allowed to do.

## Personas

| Persona | ITSM role | Where they act | What they can do |
|---|---|---|---|
| **Org operator** | `operator` | Portal | Submit requests for their own org. View their org's requests. Cannot approve. |
| **SETIC platform admin** | `admin` | Portal, ArgoCD UI, hub kubectl, RHACM | Approve any request. Manage forms, users, groups. Sync ArgoCD Applications. Read all clusters. |

Roles are declared in `gdfkube-src/gdfkube-itsm/src/types.ts:3` and are
exactly `operator | admin`. The demo hardcodes two real users (saude
operator + setic admin); real auth is deferred (see
[01-itsm-portal.md](./01-itsm-portal.md),
[02-express-api.md](./02-express-api.md)).

> **Future state — not yet implemented.** A non-admin approver role (for
> per-form-type signoff) and a machine-identity service role were
> considered but are explicitly out of scope until real auth lands.

## Authorization Layers

```
┌──────────────────────────────────────────────────────────┐
│  Portal (UI gating)                                      │  ← cosmetic; never authoritative
├──────────────────────────────────────────────────────────┤
│  Express API (request gating)                            │  ← static-user binding for demo
├──────────────────────────────────────────────────────────┤
│  ArgoCD AppProject + Casbin RBAC                         │  ← per-org sync rights
├──────────────────────────────────────────────────────────┤
│  Hub Kubernetes RBAC (ClusterRole/RoleBinding)           │  ← who can read RHACM/HyperShift CRs
├──────────────────────────────────────────────────────────┤
│  RHACM ConfigurationPolicy compliance                    │  ← what gets distributed where
└──────────────────────────────────────────────────────────┘
```

Each layer is independent. The portal does not "trust upstream"; Express
re-validates. ArgoCD does not trust the portal; it enforces AppProject scope
and Casbin policies regardless.

## ClusterRoles (hand-authored, in `gdfkube-infra/rbac/`)

### `setic-platform-admin`

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: setic-platform-admin
rules:
  - apiGroups: ["hypershift.openshift.io"]
    resources: ["hostedclusters", "nodepools"]
    verbs: ["*"]
  - apiGroups: ["cluster.open-cluster-management.io"]
    resources: ["managedclusters", "managedclustersets", "managedclustersetbindings", "placements"]
    verbs: ["*"]
  - apiGroups: ["policy.open-cluster-management.io"]
    resources: ["policies", "configurationpolicies", "placementbindings"]
    verbs: ["*"]
  - apiGroups: ["argoproj.io"]
    resources: ["applications", "applicationsets", "appprojects"]
    verbs: ["*"]
  - apiGroups: [""]
    resources: ["namespaces", "secrets"]
    verbs: ["get", "list", "watch"]
```

Bound to setic admins via `ClusterRoleBinding`. The demo binds the ITSM `admin` user statically.

### `setic-operator`

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: setic-operator
rules:
  - apiGroups: ["argoproj.io"]
    resources: ["applications"]
    verbs: ["get", "list", "watch", "patch"]                # patch = sync action
    resourceNames: []                                        # narrowed by AppProject roles
  - apiGroups: ["hypershift.openshift.io"]
    resources: ["hostedclusters", "nodepools"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["cluster.open-cluster-management.io"]
    resources: ["managedclusters"]
    verbs: ["get", "list", "watch"]
```

Bound per-org via `RoleBinding` referencing the ClusterRole — narrows resources to that org's namespaces. Combined with AppProject's `saude-operator` Casbin rules ([09-argocd.md](./09-argocd.md)), this gives org operators read access on the hub plus sync rights on their AppProject only.

## Per-Org Isolation Boundary

| Resource | Scope mechanism |
|---|---|
| Git repo | One `gdfkube-{org}` per org. Gitea ACL restricts read access to that org's operators (future work). |
| ArgoCD AppProject | `sourceRepos` whitelist + `destinations` namespace globs (`hc-saude-*`, `ns-saude-*`). |
| ArgoCD Casbin | `role:saude-operator` can `sync` only `saude/*` Applications. |
| RHACM ManagedClusterSet | Exclusive label-based set per org. |
| Kubernetes RBAC | RoleBinding scoped to `hc-{org}-*` namespaces. |

A single user mistake or token leak in one layer is not enough to cross orgs:
ArgoCD AppProject would still reject a sync targeting another org's
namespace; AppProject misconfig would still be blocked by Kubernetes RBAC; etc.

## Secret Distribution

Three secret families, each with its own distribution path.

### 1. Pull-secret + sshkey (per hosted cluster)

- **Source:** `open-cluster-management/kubevirt-secret` (one canonical secret authored by SETIC).
- **Distribution:** RHACM `ConfigurationPolicy` ([10-rhacm.md](./10-rhacm.md)).
- **Target:** `hc-{org}-{cluster}` namespace; secret names `pull-secret` (type `kubernetes.io/dockerconfigjson`) and `sshkey` (type `Opaque`, key `id_rsa.pub`).
- **Rotation:** edit the source secret; ConfigurationPolicy reapplies everywhere.

### 2. Customer kubeconfig (post-provisioning)

- **Source:** generated by the hypershift-addon when the hosted control plane reaches Ready. Stored as a Secret in the `hc-{org}-{cluster}` namespace on the hub.
- **Distribution:** out-of-band — the operator downloads it from the portal once the request is `ready`. Portal calls Express, which reads the Secret via the Camel service account, and streams it back.
- **Rotation:** out of scope for the demo.

### 3. Service-account credentials (Camel → Mongo, Camel → Gitea, ArgoCD → Gitea)

- Standard Kubernetes Secrets in each component's namespace.
- Mounted as env vars or files at startup.
- Rotation: out of scope for the demo.

## Trufflehog & Secret Hygiene

- Pre-commit hook (project-wide): `trufflehog filesystem` blocks pushing real-looking credentials.
- CI workflow: `trufflehog.yml` scans on push, PR, and weekly schedule.
- Test fixtures use obviously-fake values + `# trufflehog:ignore` annotations.

(Already enforced today — see `.claude/rules/no-secrets-in-code.md` and `CLAUDE.md`.)

## Network Boundary (informational)

- All pipeline components (Mongo, Kafka, Camel, Gitea, ArgoCD, RHACM, HyperShift) live on the hub cluster. No public exposure beyond:
  - Portal (operator-facing) — Route
  - Gitea (admin-facing) — Route, used by Camel and ArgoCD
  - Hosted-cluster API servers — LoadBalancer per cluster (KubeVirt service publishing)
- Internal traffic is in-cluster ClusterIP; mTLS where supported (Strimzi, RHACM channels).

## Decisions Resolved

- Two ClusterRoles: `setic-platform-admin`, `setic-operator`. Authored once in `gdfkube-infra/rbac/`.
- Per-org isolation enforced at five layers (Git, AppProject, Casbin, ManagedClusterSet, Kubernetes RBAC).
- ArgoCD enforcement = AppProject scope + Casbin policies (two layers, not just one).
- Demo auth is a static user list. Real auth (Keycloak / OIDC) is deferred to a future PRD.
- Approval requires SETIC platform admin. Demo: ITSM `admin` user — single signoff.

## Open Questions

- Real auth integration: Keycloak vs OAuth-proxy vs OpenShift OAuth — not yet decided.
- Audit-log retention beyond 30d for compliance: not specified.
- Per-org Gitea ACL when operators eventually get direct read access: not specified.
- Kubeconfig revocation flow when an operator leaves an org: not specified.

## References

- [01-itsm-portal.md](./01-itsm-portal.md), [02-express-api.md](./02-express-api.md) — identity binding in the demo.
- [09-argocd.md](./09-argocd.md) — AppProject + Casbin layer.
- [10-rhacm.md](./10-rhacm.md) — ConfigurationPolicy and ClusterSet membership.
- [11-hypershift.md](./11-hypershift.md) — secret consumption by the hosted cluster.
