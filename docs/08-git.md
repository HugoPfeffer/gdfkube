# Git

> **Implementation Status:** Implemented
> **Source:** Handoff `app.jsx` (two-repo model, repo topology) + handoff `uploads/gitops-platform.md`
> **Last validated:** 2026-05-14

## Specs

- [`gitea-stack`](../openspec/specs/gitea-stack/spec.md)

## Role in the Pipeline

```
[Camel git-push] ──JGit──▶ [Gitea repo: gdfkube-{org}] ──▶ [ArgoCD]
[Camel git-push] ──JGit──▶ [Gitea repo: gdfkube-infra] ──▶ [ArgoCD]
[Camel repo-bootstrap] ──Gitea API──▶ [creates gdfkube-{org} on first request]
```

Git is the GitOps source of truth. Camel writes; ArgoCD reads. Customers
never see these repos directly.

## Responsibilities

- Persist rendered manifests for ArgoCD to reconcile.
- Maintain platform configuration (AppProjects, ClusterSets, RBAC) under a separate platform repo.
- Provide repo auto-creation on the first request from a new org.
- **Does NOT** apply manifests, validate them, or hold any non-rendered intent.

## Design

### Provider

- **Gitea** is the only provider, hosted in-cluster at `https://gitea-gitea.apps.gdfkube.gov`.
- Wrapped by a pluggable **`GitProvider`** interface so a future PRD can add GitHub or GitLab without touching Camel routes.

### `GitProvider` Interface (Java, in Camel app)

```java
public interface GitProvider {
  /** Returns true if the repo already exists. Idempotent. */
  boolean repoExists(String owner, String name);

  /** Create a new empty repo. Idempotent: returns immediately if it already exists. */
  void createRepo(String owner, String name, RepoOptions opts);

  /** Clone or pull into a local directory. Returns the working tree path. */
  Path cloneOrPull(String owner, String name, String branch);

  /** Add files, commit with the given message and author, push. */
  void commitAndPush(Path workingTree, List<Path> files, String message, GitAuthor author);
}
```

The Camel app binds one bean implementing `GitProvider`. Initial implementation: `GiteaGitProvider` (uses Gitea REST API for `repoExists`/`createRepo`, JGit for the rest).

### Two-Repo Model

| Repo | Owner | Lifecycle | Watcher |
|---|---|---|---|
| `gdfkube-infra` | `gdfkube` (single platform org) | created once, edited rarely | ArgoCD discovery ApplicationSet |
| `gdfkube-{org}` | `gdfkube` | auto-created by Camel `repo-bootstrap` on first org request | per-org ApplicationSets |

### `gdfkube-infra` Layout

```
gdfkube-infra/
├── argocd/
│   ├── discovery/
│   │   └── org-repos-discovery.yaml         # bootstrap ApplicationSet that finds all gdfkube-{org} repos
│   └── orgs/
│       ├── saude/
│       │   ├── appproject.yaml              # rendered by Camel from charts/infra/argocd-org
│       │   └── applicationset.yaml
│       ├── educacao/...
│       └── transportes/...
├── rhacm/
│   └── orgs/
│       ├── saude/
│       │   ├── managedclusterset.yaml       # rendered by Camel from charts/infra/rhacm-org
│       │   └── managedclustersetbinding.yaml
│       └── ...
├── rbac/
│   ├── setic-platform-admin.yaml            # ClusterRole, hand-authored once
│   └── setic-operator.yaml
└── charts/                                  # consumed by Camel via initContainer
    └── ... (see 07-helm.md)
```

### `gdfkube-{org}` Layout

```
gdfkube-saude/
├── clusters/
│   └── hc-saude-vacinacao/
│       ├── hostedcluster.yaml
│       ├── nodepool.yaml
│       └── managedcluster.yaml
├── namespaces/
│   └── ns-saude-app1/
│       └── namespace.yaml
├── scale-patches/
│   └── hc-saude-vacinacao-scale-1/
│       └── nodepool-patch.yaml
└── baseline/
    └── overlays/
        ├── dev/
        ├── staging/
        └── prod/
```

Directory names are deterministic — they double as the unique key. ArgoCD ApplicationSet directory generators discover `clusters/*/`, `namespaces/*/`, `scale-patches/*/`.

### Bootstrap Flow

When a new org submits its first request:

1. Camel `request-router` calls `git-push`.
2. `git-push` attempts `cloneOrPull("gdfkube", "gdfkube-saude", "main")`.
3. JGit returns 404 / "repository not found".
4. Camel routes to `repo-bootstrap`.
5. `repo-bootstrap` calls `GitProvider.createRepo("gdfkube", "gdfkube-saude", { defaultBranch: "main", autoInit: true })`.
6. The provider returns immediately if the repo already exists (idempotent — concurrent first-requests from the same org are safe).
7. Control returns to `git-push`, which retries the clone, writes files, commits, pushes.

### Branch Model

- Single `main` branch per repo. No feature branches in the demo.
- Camel commits directly to `main` with a service-account author.
- All sync gating happens at ArgoCD (manual sync), not via PR review.

### Commit Author

```
gdfkube-camel <camel@gdfkube.gov.br>
```

Each commit captures the originating `requestId` in the message body so audit and Git history align.

### Auth

- Gitea service-account token, stored as a Kubernetes Secret in `gdfkube-camel` namespace, mounted as env vars `GITEA_TOKEN` (for API) and used by JGit via HTTPS basic auth (`username = camel`, `password = $GITEA_TOKEN`).
- ArgoCD has its own read-only Gitea credential (separate token).

## Interfaces

| Direction | Counterpart | Protocol |
|---|---|---|
| Inbound | Camel | JGit (HTTPS), Gitea API (HTTPS) |
| Outbound | ArgoCD | HTTPS (read-only clone) |

## Operational Concerns

- **Gitea is a hard dependency.** The "any Git remote" framing in the handoff is dropped. Future work could add GitHub support behind the same `GitProvider` interface.
- **Repo permissions:** repos are created private under the `gdfkube` org. Only the Gitea service accounts for Camel and ArgoCD have access. Operators interact only via the portal.
- **Concurrent commits:** with single-replica Camel, no contention. Multi-replica needs per-org locking (see open questions in [06-camel.md](./06-camel.md)).

## Decisions Resolved

- Pluggable `GitProvider` interface. Gitea is the first and only implementation.
- Two-repo model: `gdfkube-infra` (platform) + per-org `gdfkube-{org}` (customer manifests).
- Auto-create per-org repo on first request (idempotent).
- Single `main` branch; commits land directly. Sync approval lives at ArgoCD.
- Drop the "any Git remote" claim — document Gitea coupling explicitly.

## Open Questions

- Webhook from Gitea to ArgoCD for instant refresh, vs ArgoCD's poll interval? Not specified.
- Repo lifecycle on org deprecation (archive vs delete)? Not specified.
- Backup of Gitea data — out of scope here.

## References

- [06-camel.md](./06-camel.md) — `git-push` and `repo-bootstrap` routes.
- [07-helm.md](./07-helm.md) — what gets written to `clusters/*/`.
- [09-argocd.md](./09-argocd.md) — what reads from these repos.
