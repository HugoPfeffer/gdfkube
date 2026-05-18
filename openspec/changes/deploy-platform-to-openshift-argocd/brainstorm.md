# Brainstorm: deploy-platform-to-openshift-argocd

## Design Summary

The gdfkube platform currently exists **only as a local `docker-compose.yml` stack**.
The target OpenShift cluster already has ArgoCD installed (`openshift-gitops`) and expects
to be pointed at a GitHub repo to bootstrap the project. This change creates the missing
**platform-deploy layer**: every docker-compose service is translated to OpenShift
manifests, deployed by a single ArgoCD app-of-apps that tracks
`https://github.com/HugoPfeffer/gdfkube.git` (branch `main-openshift`).

A **two-layer model** is preserved: GitHub bootstraps the *platform*; the platform's
in-cluster Gitea continues to serve the *tenant-provisioning* repos consumed by the
existing, untouched `org-repos-discovery.yaml` ApplicationSet. docker-compose
`depends_on`/healthcheck ordering is reproduced with ArgoCD **sync-waves + readiness
probes + idempotent Jobs**. `compose service name == k8s Service name` everywhere, so all
inter-service env vars carry over unchanged.

## Alternatives Considered

### Option A: Full platform stack as plain containers + Gitea operator (CHOSEN)
- **Approach**: Translate all docker-compose services to StatefulSets/Deployments/Jobs/Services/Routes; Gitea via the official Gitea operator (the only operator); in-cluster OpenShift builds for the three app images; one ArgoCD app-of-apps from GitHub.
- **Pros**: Faithful to the existing topology (lowest conceptual drift); self-contained (no external registry, ArgoCD self-bootstraps the one operator); honours the user's stated Gitea-operator policy.
- **Cons**: Large surface (~9 workloads, ~10 init Jobs, builds, secrets); ArgoCD can't trigger Builds (needs a bootstrap Job); demo-grade committed Secrets.
- **Why chosen**: Directly matches the user's explicit decisions and is the fastest path to a working cluster deploy without re-architecting onto operators.

### Option B: Operator-managed infra (Strimzi/MongoDB/Sonar operators + Gitea operator)
- **Approach**: Use OLM operators for Kafka (Strimzi), MongoDB, SonarQube, Debezium (KafkaConnect), plus Gitea.
- **Pros**: Production-grade lifecycle management, day-2 ops, less hand-written YAML for stateful tiers.
- **Cons**: Large re-architecture away from the docker-compose topology; many catalog/CRD unknowns; slower; more drift from the source-of-truth compose file.
- **Why not chosen**: User explicitly rejected operators for everything except Gitea ("scrap operators, deploy as-is in container form").

### Option C: App workloads only / GitOps control plane only
- **Approach**: Deploy just Camel+ITSM (assume infra external), or only the existing tenant-provisioning layer re-pointed at GitHub.
- **Pros**: Much smaller scope.
- **Cons**: Does not deliver a runnable platform on a bare ArgoCD-only cluster.
- **Why not chosen**: User chose the full platform stack.

## Agreed Approach

Option A. New deploy tree at `gdfkube-src/gdfkube-infra/platform/` (`app-of-apps.yaml`
entrypoint → child Applications under `apps/` carrying sync-waves → kustomize bases under
`manifests/`). Init scripts/seed-data become ConfigMaps via kustomize
`configMapGenerator` referencing the **existing** files (zero copy, zero drift). The only
source edit: one `COPY … /opt/charts` line in `gdfkube-camel/Dockerfile.jvm` to ship the
charts that `HelmTemplateRunner.java:34` expects. Implementation is phased by sync-wave
within this single OpenSpec change.

## Key Decisions

1. **Scope**: full platform stack — every docker-compose service translated to OpenShift.
2. **Infra strategy**: plain containerized workloads; **no** operators for Kafka, MongoDB, Debezium, SonarQube.
3. **Gitea**: the **only** operator — official Gitea operator, installed by ArgoCD via OLM Subscription + OperatorGroup.
4. **App images**: `gdfkube-camel`, `gdfkube-itsm`, `gdfkube-itsm-api` built **in-cluster** (BuildConfig + ImageStream from the GitHub repo); no external registry. A wave-1 bootstrap Job runs `oc start-build` since ArgoCD cannot trigger Builds.
5. **Repo/branch**: `https://github.com/HugoPfeffer/gdfkube.git`, `main-openshift` (`origin` remote confirmed present, pushed at `dfecf09`).
6. **DNS preservation**: 3 separate single-replica StatefulSets each for mongo/kafka (matching Services `mongo1/2/3`, `kafka1/2/3`) so rs-init and KRaft quorum-voter hostnames are unchanged.
7. **Ordering**: ArgoCD sync-waves + probes + idempotent Jobs replace compose `depends_on`.
8. **Secrets**: committed Secret manifests with obviously-fake demo defaults + `# trufflehog:ignore` (sanctioned CLAUDE.md pattern); runtime tokens generated into Secrets, never committed.
9. **Two-layer model**: tenant-provisioning ApplicationSet `org-repos-discovery.yaml` stays untouched and keeps consuming in-cluster Gitea.

## Open Questions

Resolved during implementation (do not block proposal):

1. Gitea operator package/channel/CRD shape — confirm via `oc get packagemanifest` + `oc explain gitea.spec`.
2. `gitea` Service cross-namespace resolution — add ExternalName alias if the operator installs Gitea in its own namespace.
3. `gitea-repo-seed` egress — runtime `git clone` from github.com needs cluster egress; air-gapped fallback = seed from BuildConfig context.
4. SonarQube/postgres SCC — decide custom SCC / `anyuid` SA or `fsGroup`/`runAsUser` overrides (`vm.max_map_count` already mitigated via `SONAR_ES_BOOTSTRAP_CHECKS_DISABLE`).
5. ArgoCD RBAC — must allow creating Subscriptions/OperatorGroups; build-bootstrap Job SA needs `builds/instantiate`.
6. StorageClass — PVCs need the cluster's RWO StorageClass; parameterize in kustomize (default to cluster default).
7. Build-trigger gap — cold start covered by the bootstrap Job; later rebuilds need `oc start-build` (accepted limitation).
