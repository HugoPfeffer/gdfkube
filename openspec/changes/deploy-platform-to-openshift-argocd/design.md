# Design: deploy-platform-to-openshift-argocd

## Context

The platform runs only via `docker-compose.yml` (~9 services + ~10 one-shot init
containers). The target OpenShift cluster has ArgoCD pre-installed (`openshift-gitops`)
and bootstraps by being pointed at a GitHub repo. The existing ArgoCD/Helm assets
(`argocd/discovery/org-repos-discovery.yaml`, `charts/infra/argocd-org`) belong to the
**tenant-provisioning** layer and consume in-cluster Gitea — they are not a platform
deploy and must remain untouched. Constraints: solo dev; trufflehog pre-commit hook;
CLAUDE.md values simplicity, no maintained helper scripts, and driftless manifests;
implementation flows through this single OpenSpec change.

Two-layer bootstrap (the non-obvious interaction worth a diagram):

```
GitHub (HugoPfeffer/gdfkube @ main-openshift)
   │  oc apply app-of-apps.yaml  (one command)
   ▼
ArgoCD app-of-apps ──> child Applications (sync-waves) ──> platform workloads
   │                                                          │
   │ gitea-repo-seed Job clones GitHub, pushes gdfkube-src ──▶ in-cluster Gitea
   ▼                                                          │
in-cluster Gitea  ◀── existing org-repos-discovery ApplicationSet (UNCHANGED)
                       continues serving the tenant-provisioning layer
```

## Goals / Non-Goals

**Goals**
- One ArgoCD app-of-apps, sourced from GitHub, deploys the entire platform on a bare
  ArgoCD-only OpenShift cluster.
- Faithful translation of the compose topology (lowest drift): same Service names, same
  env, same init scripts (consumed verbatim via kustomize `configMapGenerator`).
- ArgoCD sync-waves + probes + idempotent Jobs reproduce compose ordering.
- Gitea via the official Gitea operator (the only operator), installed by ArgoCD.
- In-cluster image builds; no external registry.
- Preserve the tenant-provisioning layer exactly.

**Non-Goals**
- No operatorization of Kafka/MongoDB/Debezium/SonarQube.
- No production secrets management (Sealed/External Secrets) — demo defaults only; flagged
  as the #1 hardening follow-up.
- No HA/scaling/resource-tuning beyond compose parity.
- No change to tenant-provisioning charts/ApplicationSets or to application source logic
  (only one `COPY` line in `Dockerfile.jvm`).
- No live-cluster validation here (the cluster is remote; verification is operator-run).

## Decisions

**D1 — Plain workloads, not operators (except Gitea).** Alternative: Strimzi/MongoDB/Sonar
operators. Chosen plain StatefulSets/Deployments because it mirrors compose 1:1 (least
drift, fastest), per explicit user decision. Trade-off: no day-2 operator lifecycle;
acceptable for a demo platform.

**D2 — 3 single-replica StatefulSets each for mongo/kafka** (Services `mongo1/2/3`,
`kafka1/2/3`). Alternative: one StatefulSet replicas=3 with a headless Service. Chosen
per-instance because `init-rs.js` and `KAFKA_CONTROLLER_QUORUM_VOTERS` hardcode
`mongoN`/`kafkaN:9093`; per-instance Services preserve that DNS with zero script edits
(zero drift). Trade-off: 3 objects instead of 1; worth it to keep scripts byte-identical.

**D3 — Charts baked into the camel image.** Alternative: runtime ConfigMap or initContainer
git-clone. Chosen `COPY gdfkube-src/gdfkube-infra/charts /opt/charts` in `Dockerfile.jvm`
(build context = repo root) because charts (≈124K) ship with the code that consumes them
(`HelmTemplateRunner.java:34`), no runtime network/Gitea dependency at camel start, no
extra maintained machinery (CLAUDE.md no-drift rule). Trade-off: build context widens to
repo root.

**D4 — Build-bootstrap Job for cold start.** ArgoCD cannot trigger OpenShift Builds.
Alternatives: GitHub webhook (needs external config, breaks single-command) or manual
`oc start-build` (breaks single-command). Chosen a wave-1 Job (SA with
`builds/instantiate`) running `oc start-build --wait` ×3. Trade-off: later code rebuilds
still need `oc start-build` (documented, accepted).

**D5 — Init scripts as kustomize `configMapGenerator` over existing files.** Alternative:
copy script contents into manifests. Chosen generator referencing
`gdfkube-src/gdfkube-infra/{mongodb,kafka,debezium,sonarqube}/*` so the ConfigMap content
is the same file the compose stack uses — eliminates drift by construction.

**D6 — Sync-wave ordering replaces `depends_on`.** Waves: operator/ns (-10) → secrets (-5)
→ builds (0) → build-Job (1) → stateful + Gitea CR (5) → init Jobs (10–16) → apps (50) →
SPA (55). Health gating via probes + Job completion reproduces
`service_healthy`/`service_completed_successfully`.

**D7 — Demo Secrets committed with `# trufflehog:ignore`.** Alternative: Sealed/External
Secrets. Chosen committed fake defaults to keep "single command" true; runtime tokens
(Gitea PAT, Sonar token) generated into Secrets, never committed. Trade-off: not
production-safe — explicitly flagged.

## Risks / Trade-offs

- **Gitea operator CRD/channel unknown** → confirm `oc get packagemanifest`/`oc explain gitea.spec` at implementation; finalize Subscription+CR against the real CRD before that phase's verification gate.
- **`gitea` Service may be in the operator's namespace** → add an `ExternalName` Service named `gitea` in the workload namespace so `http://gitea:3000` stays valid.
- **gitea-repo-seed needs github.com egress** → if air-gapped, fall back to seeding from the BuildConfig source context instead of runtime clone.
- **SonarQube/postgres not `restricted-v2`-clean** → bind a custom SCC/`anyuid` SA or set `fsGroup`/`runAsUser`; `vm.max_map_count` already mitigated by `SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true`.
- **ArgoCD RBAC for OLM/Builds** → controller must create Subscriptions/OperatorGroups; build-Job SA needs `builds/instantiate` (ship the Role/RoleBinding).
- **StorageClass name varies per cluster** → parameterize in kustomize, default to cluster default RWO.
- **Single-replica broker pods + RWO PVC** → reschedule must reattach the same PVC; rely on a StorageClass that supports reattach.
- **Demo Secrets in a public repo** → production must migrate to managed secrets (top hardening item).

## Migration Plan

Greenfield deploy onto a fresh cluster — no in-place data migration.
- **MongoDB schema**: none. PVCs start empty; `mongo-init` creates rs0; seed scripts are
  byte-identical to compose. No schema migration concern.
- **Kafka consumer-group rebalancing**: N/A — new cluster, fixed
  `KAFKA_CLUSTER_ID=ghD8_7zXTOW9WdFd5VvQAg`, topics recreated by `kafka-init`; no existing
  consumers to rebalance.
- **Helm value changes**: none — tenant charts under `charts/` are unchanged; Camel renders
  them at runtime exactly as before; no `values.yaml`/`values.schema.json` edits.
- **Rollback**: `argocd app delete gdfkube-platform --cascade` removes all platform
  resources; the tenant layer and GitHub repo are unaffected (additive change, revert the
  commit to fully back out).
- **Deploy**: push manifests to `main-openshift`; `oc apply` the app-of-apps; `argocd app
  sync --prune`; verify per the verify artifact.

## Open Questions

Tracked as implementation-time confirmations (do not block): Gitea operator
package/channel/CRD shape; `gitea` cross-namespace Service strategy; cluster egress for
`gitea-repo-seed`; SonarQube/postgres SCC choice; ArgoCD OLM/Build RBAC; cluster
StorageClass name.
