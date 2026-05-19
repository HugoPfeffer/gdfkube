# Spec delta: openshift-platform-deploy

## ADDED Requirements

### Requirement: Single-command app-of-apps bootstrap
The platform SHALL be deployable onto an ArgoCD-only OpenShift cluster by applying exactly
one ArgoCD `Application` entrypoint that sources `https://github.com/HugoPfeffer/gdfkube.git`
at revision `main-openshift`, path `gdfkube-src/gdfkube-infra/platform/apps`, with no
manual step beyond that single `oc apply`.

#### Scenario: Operator bootstraps the platform with one apply
- **GIVEN** an OpenShift cluster with ArgoCD installed in `openshift-gitops` and no gdfkube resources
- **WHEN** the operator runs `oc apply -n openshift-gitops -f .../platform/app-of-apps.yaml`
- **THEN** ArgoCD creates the app-of-apps and all child Applications, and `argocd app wait gdfkube-platform --health` eventually reports Healthy with every platform workload running

#### Scenario: Entrypoint targets the GitHub repo and branch
- **GIVEN** the committed `platform/app-of-apps.yaml`
- **WHEN** its source is inspected
- **THEN** `repoURL` is `https://github.com/HugoPfeffer/gdfkube.git`, `targetRevision` is `main-openshift`, and `path` is `gdfkube-src/gdfkube-infra/platform/apps`

### Requirement: Compose-faithful workload topology
Every `docker-compose.yml` service SHALL have a corresponding OpenShift workload whose
in-cluster Service name and environment variables match the compose service, so
inter-service references resolve unchanged. mongo and kafka SHALL each be deployed as
three single-replica StatefulSets with per-instance Services named `mongo1/2/3` and
`kafka1/2/3` to preserve the hostnames hardcoded in the replica-set init and KRaft quorum
configuration.

#### Scenario: Service names preserve compose DNS
- **GIVEN** the rendered platform manifests
- **WHEN** Services are listed
- **THEN** Services named `mongo1`,`mongo2`,`mongo3`,`kafka1`,`kafka2`,`kafka3`,`gitea`,`sonarqube`,`sonar-db`,`gdfkube-itsm-api`,`gdfkube-camel`,`itsm`,`gdfkube-debezium-connect` exist and resolve the same hostnames the compose env strings use

#### Scenario: Mongo replica set forms using stable DNS
- **GIVEN** the three mongo StatefulSets and the `mongo-init` Job have synced
- **WHEN** `mongosh --eval 'rs.status().ok'` runs against `mongo1`
- **THEN** it returns `1` (replica set `rs0` healthy across `mongo1/2/3`)

### Requirement: Sync-wave ordering reproduces the dependency graph
Child Applications and resources SHALL carry `argocd.argoproj.io/sync-wave` annotations
that reproduce the compose `depends_on`/healthcheck ordering (operator/namespace → secrets
→ builds → stateful + Gitea CR → init Jobs → app tier → SPA). Every init Job SHALL be
idempotent and SHALL re-run cleanly on a subsequent ArgoCD resync.

#### Scenario: Stateful tier is ready before init Jobs run
- **GIVEN** an in-progress initial sync
- **WHEN** wave ordering is observed
- **THEN** `mongo-init`/`kafka-init` Jobs start only after their StatefulSets report Ready, and app-tier Deployments start only after their init Jobs complete

#### Scenario: Re-sync is idempotent
- **GIVEN** a fully synced, Healthy platform
- **WHEN** `argocd app sync gdfkube-platform` is run a second time
- **THEN** all Jobs re-run and complete without error and no resource enters a Degraded state

### Requirement: In-cluster image builds
The three application images (`gdfkube-itsm`, `gdfkube-itsm-api`, `gdfkube-camel`) SHALL
be produced by in-cluster OpenShift BuildConfig + ImageStream from the GitHub repo, with a
sync-wave-1 bootstrap Job that triggers the builds (because ArgoCD cannot start Builds),
and Deployments SHALL roll automatically when a new image is published. The camel image
SHALL contain the Helm charts at `/opt/charts`.

#### Scenario: Cold-start builds complete and apps roll
- **GIVEN** a first-time sync on a cluster with no prebuilt images
- **WHEN** the build-bootstrap Job runs `oc start-build --wait` for the three apps
- **THEN** three Builds reach `Complete`, and `gdfkube-itsm`/`gdfkube-itsm-api`/`gdfkube-camel` Deployments roll out the freshly built ImageStreamTags

#### Scenario: Camel can render charts
- **GIVEN** a running `gdfkube-camel` pod
- **WHEN** `ls /opt/charts` is executed in the container
- **THEN** the chart directories from `gdfkube-src/gdfkube-infra/charts` are present (so `HelmTemplateRunner` can `helm template /opt/charts/...`)

### Requirement: Gitea deployed via the official Gitea operator
Gitea SHALL be deployed exclusively through the official Gitea operator, installed by
ArgoCD via an OLM `Subscription` + `OperatorGroup`, configured by a Gitea CR that maps the
compose configuration (sqlite3, `INSTALL_LOCK=true`, `DISABLE_REGISTRATION=true`,
`ROOT_URL`). No other component SHALL use an operator. The Gitea endpoint SHALL be
reachable as `gitea:3000` from the workload namespace, and the bootstrap/seed/token-sync
steps SHALL operate via the Gitea REST API and Kubernetes Secrets (no shared volume / no
`gitea` CLI).

#### Scenario: Operator installs and Gitea comes up
- **GIVEN** the Gitea operator Subscription synced at wave -10
- **WHEN** OLM resolves it
- **THEN** the Gitea operator CSV reaches `Succeeded` and the Gitea CR produces a running Gitea reachable at `http://gitea:3000/api/v1/version`

#### Scenario: Gitea bootstrap uses REST + Secret
- **GIVEN** Gitea is running
- **WHEN** the `gitea-bootstrap` Job runs
- **THEN** it creates the org and a PAT via the REST API and writes the PAT into a Kubernetes Secret (`gitea-pat`), and `gitea-token-sync` upserts that PAT into `gdfkube.gitea_settings`

### Requirement: Zero-drift init assets
ConfigMaps for init scripts and seed data SHALL be generated (kustomize
`configMapGenerator`) from the existing files under
`gdfkube-src/gdfkube-infra/{mongodb,kafka,debezium,sonarqube}/` so their content is
byte-identical to what the docker-compose stack uses; init script content SHALL NOT be
duplicated into manifests.

#### Scenario: Generated ConfigMap matches source file
- **GIVEN** the rendered kustomize output
- **WHEN** a generated init ConfigMap (e.g. for `init-rs.js`) is compared to its source file
- **THEN** the ConfigMap data equals the source file content with no manual copy

### Requirement: Tenant-provisioning layer preserved
This change SHALL NOT modify `gdfkube-src/gdfkube-infra/argocd/discovery/org-repos-discovery.yaml`
or the tenant charts under `gdfkube-src/gdfkube-infra/charts/`. The `gitea-repo-seed` step
SHALL push `gdfkube-src` into in-cluster Gitea so the existing tenant-provisioning
ApplicationSet continues to function unchanged (two-layer model).

#### Scenario: Tenant ApplicationSet untouched
- **GIVEN** the change diff
- **WHEN** files under `argocd/discovery/` and `charts/` are inspected
- **THEN** they are unchanged except that in-cluster Gitea is seeded with `gdfkube-src`, leaving `org-repos-discovery.yaml` able to reconcile as before

### Requirement: Secret handling without committed plaintext
No verified secret SHALL be committed. Demo credential defaults SHALL be obviously-fake
values carrying a `# trufflehog:ignore` marker, and runtime-generated tokens (Gitea PAT,
SonarQube token) SHALL be stored only in Kubernetes Secrets, never committed.

#### Scenario: trufflehog passes
- **GIVEN** the committed Secret manifests
- **WHEN** `pre-commit run --all-files` executes the trufflehog hook
- **THEN** it reports no verified findings and the demo defaults are suppressed by `# trufflehog:ignore`
