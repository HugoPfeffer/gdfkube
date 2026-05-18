# Proposal: deploy-platform-to-openshift-argocd

## Why

The gdfkube platform only runs as a local `docker-compose.yml` stack — there are zero
OpenShift manifests for any platform component. The existing ArgoCD/Helm machinery serves
tenant cluster provisioning, not the platform itself. The target OpenShift cluster already
has ArgoCD and expects to be pointed at a GitHub repo to bootstrap the project, so the
platform cannot be deployed there today. Closing this gap delivers a one-command,
GitOps-reconciled platform deployment and unblocks running the full demo on real
OpenShift instead of a developer laptop.

## What Changes

**Platform deployment surface**
- From: platform exists only via `docker-compose.yml`; no Kubernetes/OpenShift manifests.
- To: every compose service is expressed as OpenShift workloads under a new
  `gdfkube-src/gdfkube-infra/platform/` tree, deployed by one ArgoCD app-of-apps tracking
  `https://github.com/HugoPfeffer/gdfkube.git` @ `main-openshift`.
- Reason: enable GitOps deployment on the ArgoCD-only target cluster.
- Impact: non-breaking, additive; no existing runtime code path altered.

**Service ordering**
- From: docker-compose `depends_on` + healthchecks.
- To: ArgoCD sync-waves + readiness/liveness probes + idempotent Jobs.
- Impact: non-breaking; ordering semantics preserved.

**App image delivery**
- From: images built locally by `docker-compose build`.
- To: in-cluster OpenShift BuildConfig + ImageStream; a wave-1 bootstrap Job runs
  `oc start-build` (ArgoCD cannot trigger Builds). One `COPY … /opt/charts` line added to
  `gdfkube-src/gdfkube-camel/Dockerfile.jvm` so the camel image ships the Helm charts
  `HelmTemplateRunner.java:34` expects (replaces the compose host mount).

**Gitea**
- From: `gitea/gitea:1.22` container with a host-shared `gitea-data` volume; bootstrap via
  `gitea` CLI.
- To: official Gitea operator (the only operator; installed by ArgoCD via OLM
  Subscription + OperatorGroup); the three gitea Jobs re-shaped to REST/Secret-based.

**Secrets**
- From: compose env defaults.
- To: committed Secret manifests with obviously-fake demo defaults + `# trufflehog:ignore`;
  runtime tokens generated into Secrets, never committed.

## Capabilities

### New Capabilities
- `openshift-platform-deploy`: the ArgoCD app-of-apps entrypoint, per-component OpenShift
  manifests (StatefulSets/Deployments/Jobs/Services/Routes), kustomize
  `configMapGenerator` wiring of the existing init scripts/seed-data, sync-wave ordering,
  in-cluster build pipeline (ImageStream/BuildConfig + build-bootstrap Job), Gitea-operator
  integration (Subscription/OperatorGroup/CR + re-shaped gitea Jobs), and the committed
  demo-Secrets handling — all required to bootstrap the full platform on an ArgoCD-only
  OpenShift cluster while preserving the existing tenant-provisioning layer.

### Modified Capabilities
- None. No existing spec's requirements change. `org-repos-discovery.yaml`
  (tenant-provisioning) is untouched and continues to consume in-cluster Gitea; the
  `gdfkube-camel/Dockerfile.jvm` edit is packaging-only and does not alter any
  `camel-orchestrator-stack` requirement (charts at `/opt/charts` is already required).

## Impact

**Affected code / artifacts**
- New: `gdfkube-src/gdfkube-infra/platform/**` (app-of-apps, child Applications, kustomize bases).
- One-line edit: `gdfkube-src/gdfkube-infra/charts/.. ` consumed verbatim; `gdfkube-src/gdfkube-camel/Dockerfile.jvm` gains one `COPY` line.
- Re-shaped (logic preserved, transport changed): `gdfkube-src/gdfkube-infra/gitea/{bootstrap.sh,seed-repos.sh,sync-token.sh}` adapted to operator-managed Gitea (API + k8s Secret instead of shared volume + CLI).
- Consumed unchanged via configMapGenerator: `gdfkube-src/gdfkube-infra/{mongodb,kafka,debezium,sonarqube}/*`.

**Blast radius**
- API endpoints changed: **0**.
- Kafka topics changed: **0** — `kafka/init-topics.sh` and `debezium/init-connect-topics.sh` run byte-identical via ConfigMap, producing the same topics (`connect-configs/-offsets/-status` and the `dbz.gdfkube.*` set).
- MongoDB schema changed: **0** — seed/init `.js` and `seed-data/*.json` mounted byte-identical.
- Downstream consumers: the tenant-provisioning ApplicationSet `org-repos-discovery.yaml` is preserved untouched (two-layer model intact); the Camel orchestrator still reaches Gitea at `gitea:3000` (Service / ExternalName alias).
- Runtime services affected: **0** behavior changes; only their deployment mechanism is new.

**Dependency versions (pinned to compose; no conflicts with the stack)**
- `mongo:7.0`, `apache/kafka:3.7.2`, `postgres:15.10-alpine`, `sonarqube:26.4.0.121862-community`, `debezium/connect:2.7.3.Final`, `curlimages/curl:8.10.1` & `8.11.1`, Gitea via the official Gitea operator (catalog channel confirmed at implementation).
- New OpenShift-native deps (no semver pin): OLM Subscription/OperatorGroup, BuildConfig/ImageStream, Route. No conflict with existing stack versions.

**Testing strategy (per affected component)**
- Infra/deploy-only change — **unit and contract tests do not apply** (explicitly noted to satisfy the proposal/verify rules); no Java/TS source logic changes beyond one Dockerfile `COPY`.
- Static: `kustomize build` every `manifests/*` base; `oc apply --dry-run=server` for all manifests + `app-of-apps.yaml`; `pre-commit run --all-files` (trufflehog must pass with `# trufflehog:ignore`).
- Integration (cluster): ArgoCD sync to Healthy; per-workload health endpoints (`/healthz/live` :3000, `/q/health/ready` :8080, mongo `rs.status().ok`, kafka `--list`, sonar `/api/system/status`, gitea `/api/v1/version`); 3 builds Complete; Gitea operator CSV `Succeeded`.
- Idempotency: resync twice — every Job re-runs clean (all init scripts already idempotent).
