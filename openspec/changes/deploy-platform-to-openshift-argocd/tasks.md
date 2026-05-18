# Tasks: deploy-platform-to-openshift-argocd

## 1. Scaffolding & app-of-apps entrypoint

- [x] 1.1 Create `gdfkube-src/gdfkube-infra/platform/` tree: `app-of-apps.yaml`, `apps/`, `manifests/{namespace,builds,mongo,kafka,sonar,gitea,init-jobs,apps,secrets}/`
- [x] 1.2 Write `manifests/namespace/` (workload namespace `gdfkube`; gitea-operator namespace if required) with sync-wave -10
- [x] 1.3 Write `app-of-apps.yaml` (ArgoCD Application: repoURL `https://github.com/HugoPfeffer/gdfkube.git`, targetRevision `main-openshift`, path `gdfkube-src/gdfkube-infra/platform/apps`, directory generator mirroring the `org-repos-discovery.yaml` idiom)
- [x] 1.4 Write each `apps/*.yaml` child Application skeleton with its `argocd.argoproj.io/sync-wave` annotation per the wave table in design.md
- [x] 1.5 `kustomize build` the namespace base; confirm it renders

## 2. Secrets & RBAC

- [x] 2.1 Write `manifests/secrets/` Secret manifests (gitea-admin, sonar-db, sonar-admin) with obviously-fake demo defaults + `# trufflehog:ignore` on every value line; wave -5
- [x] 2.2 Add empty/placeholder Secrets for runtime tokens (`gitea-pat`, `sonar-token`) populated by Jobs, not committed with real values
- [x] 2.3 Add ServiceAccount + Role/RoleBinding granting `build.openshift.io` `builds`/`buildconfigs/instantiate` for the build-bootstrap Job; document the ArgoCD controller OLM RBAC assumption
- [ ] 2.4 `pre-commit run --all-files` — trufflehog must pass with the ignore markers

## 3. In-cluster builds (+ the one source edit)

- [x] 3.1 Add `COPY --chown=185 gdfkube-src/gdfkube-infra/charts /opt/charts` to `gdfkube-src/gdfkube-camel/Dockerfile.jvm`; ensure BuildConfig context = repo root
- [x] 3.2 Write ImageStreams + BuildConfigs (Docker strategy) for `gdfkube-itsm`, `gdfkube-itsm-api`, `gdfkube-camel` (git source = the GitHub repo @ main-openshift; correct contextDir/dockerfilePath each) — wave 0
- [x] 3.3 Write the wave-1 build-bootstrap Job running `oc start-build --wait` for the three apps (idempotent; uses the SA from 2.3)
- [x] 3.4 Add `image.openshift.io/triggers` annotations on the three Deployments so they roll on new ImageStreamTags
- [x] 3.5 `kustomize build` the builds base; `oc apply --dry-run=server`

## 4. Stateful tier

- [x] 4.1 Write `manifests/mongo/`: 3 single-replica StatefulSets `mongo1/2/3` (`mongo:7.0`, `mongod --replSet rs0 --bind_ip_all`), PVC per pod, matching ClusterIP Service each; wave 5
- [x] 4.2 Write `manifests/kafka/`: 3 single-replica StatefulSets `kafka1/2/3` (`apache/kafka:3.7.2`, KRaft, fixed `KAFKA_CLUSTER_ID`, drop host-only `HOST://9092` listener), PVC each, Service each (19092+9093); wave 5
- [x] 4.3 Write `manifests/sonar/` sonar-db StatefulSet+Service (`postgres:15.10-alpine`, PVC, env from Secret); wave 5; add SCC/`fsGroup`/`runAsUser` handling
- [x] 4.4 Add readiness/liveness probes mirroring the compose healthchecks for mongo/kafka/sonar-db
- [x] 4.5 `kustomize build` + `oc apply --dry-run=server` for mongo/kafka/sonar bases

## 5. Init Jobs — mongo/kafka/connect

- [x] 5.1 `configMapGenerator` for `mongodb/init-rs.js`, `seed-collections.js`+`seed-data/*`, `init-camel-collections.js` (zero-drift, reference existing files)
- [x] 5.2 Write Jobs `mongo-init` (wave 10), `mongo-seed` + `mongo-collections-init` (wave 11), `restartPolicy: OnFailure`, `sync-options: Replace=true`
- [x] 5.3 `configMapGenerator` + Jobs for `kafka-init` and `gdfkube-connect-topics-init` (wave 12)
- [x] 5.4 `kustomize build` init-jobs base; verify generated ConfigMap content equals source files

## 6. Gitea operator + CR + gitea Jobs

- [ ] 6.1 Confirm operator: `oc get packagemanifest -n openshift-marketplace | grep -i gitea`; capture package/channel and `oc explain gitea.spec` *(requires cluster access — deferred to deploy time)*
- [x] 6.2 Write `apps/05-gitea-operator.yaml`: OperatorGroup + Subscription (community-operators), wave -10
- [x] 6.3 Write Gitea CR mapping compose config (sqlite3, INSTALL_LOCK, DISABLE_REGISTRATION, ROOT_URL→Route, admin from Secret); wave 5
- [x] 6.4 Add `gitea` Service/`ExternalName` alias in `gdfkube` if the operator runs Gitea in its own namespace (so `http://gitea:3000` resolves)
- [x] 6.5 Re-shape `gitea/bootstrap.sh` to a REST-only Job (org + PAT via API, write PAT to `gitea-pat` Secret); wave 15
- [x] 6.6 Re-shape `gitea/seed-repos.sh` to a Job that `git clone`s GitHub `main-openshift` and pushes `gdfkube-src` into in-cluster Gitea; wave 16
- [x] 6.7 Re-shape `gitea/sync-token.sh` to a `mongo:7.0` Job reading PAT from `gitea-pat` Secret, upserting `gdfkube.gitea_settings`; wave 16
- [x] 6.8 `kustomize build` + dry-run gitea base; verify tenant `org-repos-discovery.yaml` is unmodified

## 7. SonarQube + Debezium-connect + bootstrap/init Jobs

- [x] 7.1 Write sonarqube StatefulSet+Service+Route (3 PVCs, keep `SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true`, JVM opts, SCC handling); wave 13
- [x] 7.2 Write `gdfkube-debezium-connect` Deployment+Service (`debezium/connect:2.7.3.Final`, env unchanged); wave 14
- [x] 7.3 `configMapGenerator` + Jobs for `debezium/register-connector.sh`+`connector-config.json` (`gdfkube-debezium-init`, wave 16) and `sonarqube/bootstrap.sh` (`sonar-bootstrap`, wave 16, token → `sonar-token` Secret)
- [x] 7.4 `kustomize build` + dry-run sonar/debezium bases

## 8. App tier + Routes

- [x] 8.1 Write `gdfkube-itsm-api` Deployment+Service (env `MONGO_URL`, `KAFKA_BOOTSTRAP_SERVERS`, probe `/healthz/live` :3000); wave 50
- [x] 8.2 Write `gdfkube-camel` Deployment+Service (env `KAFKA_BOOTSTRAP_SERVERS`, `MONGODB_URI`, `APP_SYSTEM_GITEA_EXTERNAL_URL=http://gitea:3000`, `APP_SYSTEM_GITEA_OWNER`, probe `/q/health/ready` :8080); wave 50
- [x] 8.3 Write `itsm` SPA Deployment+Service+Route (:8080); wave 55
- [x] 8.4 Add Routes for ITSM SPA (and optionally api/camel/sonarqube/gitea per the operator)
- [x] 8.5 `kustomize build` + dry-run apps base

## 9. End-to-end verification & integration

- [x] 9.1 `for d in .../platform/manifests/*; do kustomize build "$d"; done` all green; `oc apply --dry-run=server` all bases + `app-of-apps.yaml`
- [ ] 9.2 `pre-commit run --all-files`; commit and `git push origin main-openshift`
- [ ] 9.3 Apply the app-of-apps; `argocd app sync gdfkube-platform --prune`; `argocd app wait --health --timeout 1800` *(requires cluster access)*
- [ ] 9.4 Verify: Gitea operator CSV `Succeeded`; 3 Builds `Complete`; all StatefulSets/Deployments/Jobs healthy *(requires cluster access)*
- [ ] 9.5 Functional checks: itsm-api `/healthz/live`, camel `/q/health/ready`, mongo `rs.status().ok`, kafka topic `--list`, sonar `/api/system/status`, gitea `/api/v1/version`, ITSM Route reachable *(requires cluster access)*
- [ ] 9.6 Idempotency: second `argocd app sync` — all Jobs re-run clean, nothing Degraded *(requires cluster access)*
- [ ] 9.7 Confirm tenant-provisioning ApplicationSet still reconciles against in-cluster Gitea (two-layer model intact) *(requires cluster access)*
