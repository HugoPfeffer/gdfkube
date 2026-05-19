# OpenShift Platform Deploy via ArgoCD — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the entire gdfkube platform onto an ArgoCD-only OpenShift cluster via one app-of-apps sourced from GitHub.

**Architecture:** Each `docker-compose.yml` service becomes an OpenShift workload under `gdfkube-src/gdfkube-infra/platform/`, organized as kustomize bases referenced by per-group ArgoCD child Applications carrying `sync-wave` annotations. Init scripts are mounted via kustomize `configMapGenerator` over the existing files (zero drift). Gitea is the only operator (OLM). App images build in-cluster.

**Tech Stack:** OpenShift (ArgoCD/openshift-gitops, OLM, BuildConfig/ImageStream, Routes, SCC), Kustomize, MongoDB 7.0, Apache Kafka 3.7.2 (KRaft), Debezium 2.7.3, SonarQube community, Gitea operator.

**Artifacts:** specs `specs/openshift-platform-deploy/spec.md`; rationale in `design.md`; checklist in `tasks.md`. The "test" for YAML is `kustomize build` + `oc apply --dry-run=server` (no unit tests apply — infra-only).

**Conventions for every task:** all paths are repo-relative to the worktree root. `PLATFORM=gdfkube-src/gdfkube-infra/platform`. Validation command pattern: `kustomize build $PLATFORM/manifests/<base>`. Server dry-run requires `oc login` (operator-run; if `oc` absent locally, hand the command to the user per CLAUDE.md). Commit after each task on branch `main-openshift`.

---

## Task 1: Scaffolding, namespaces, app-of-apps entrypoint

**Files:**
- Create: `gdfkube-src/gdfkube-infra/platform/manifests/namespace/namespace.yaml`
- Create: `gdfkube-src/gdfkube-infra/platform/manifests/namespace/kustomization.yaml`
- Create: `gdfkube-src/gdfkube-infra/platform/app-of-apps.yaml`
- Create: `gdfkube-src/gdfkube-infra/platform/apps/00-namespace.yaml`

- [ ] **Step 1: Create the namespace manifest**

`platform/manifests/namespace/namespace.yaml`:
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: gdfkube
  labels:
    gdfkube.io/managed: "true"
```

- [ ] **Step 2: Create the namespace kustomization**

`platform/manifests/namespace/kustomization.yaml`:
```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - namespace.yaml
```

- [ ] **Step 3: Create the app-of-apps entrypoint**

`platform/app-of-apps.yaml` (single Application; child Apps live in `apps/`, discovered by directory generator — mirrors `gdfkube-src/gdfkube-infra/argocd/discovery/org-repos-discovery.yaml`):
```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: gdfkube-platform
  namespace: openshift-gitops
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: default
  source:
    repoURL: https://github.com/HugoPfeffer/gdfkube.git
    targetRevision: main-openshift
    path: gdfkube-src/gdfkube-infra/platform/apps
    directory:
      recurse: true
  destination:
    server: https://kubernetes.default.svc
    namespace: openshift-gitops
  syncPolicy:
    automated: { prune: true, selfHeal: true }
    syncOptions: [CreateNamespace=false]
```

- [ ] **Step 4: Create the first child Application (namespace, wave -10)**

`platform/apps/00-namespace.yaml`:
```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: gdfkube-namespace
  namespace: openshift-gitops
  annotations:
    argocd.argoproj.io/sync-wave: "-10"
spec:
  project: default
  source:
    repoURL: https://github.com/HugoPfeffer/gdfkube.git
    targetRevision: main-openshift
    path: gdfkube-src/gdfkube-infra/platform/manifests/namespace
  destination:
    server: https://kubernetes.default.svc
    namespace: gdfkube
  syncPolicy:
    automated: { prune: true, selfHeal: true }
```

- [ ] **Step 5: Validate rendering**

Run: `kustomize build gdfkube-src/gdfkube-infra/platform/manifests/namespace`
Expected: emits the `Namespace/gdfkube` document, exit 0.

- [ ] **Step 6: Commit**

```bash
git add gdfkube-src/gdfkube-infra/platform
git commit -m "platform: scaffold app-of-apps and namespace"
```

---

## Task 2: Secrets, ServiceAccount, build RBAC

**Files:**
- Create: `platform/manifests/secrets/{secrets.yaml,kustomization.yaml}`
- Create: `platform/manifests/builds/rbac.yaml`
- Create: `platform/apps/05-secrets.yaml`

- [ ] **Step 1: Create demo Secret manifests**

`platform/manifests/secrets/secrets.yaml` (defaults equal the compose demo values; obviously-fake; `# trufflehog:ignore` per `.claude/rules/no-secrets-in-code.md`):
```yaml
apiVersion: v1
kind: Secret
metadata: { name: gitea-admin, namespace: gdfkube }
type: Opaque
stringData:
  username: gdfkube-admin
  password: admin            # trufflehog:ignore
  email: admin@gdfkube.local
---
apiVersion: v1
kind: Secret
metadata: { name: sonar-db, namespace: gdfkube }
type: Opaque
stringData:
  username: sonar
  password: sonar            # trufflehog:ignore
  database: sonar
---
apiVersion: v1
kind: Secret
metadata: { name: sonar-admin, namespace: gdfkube }
type: Opaque
stringData:
  password: "GdfKube-S0nar!" # trufflehog:ignore
---
# Runtime-populated; created empty, filled by Jobs (never committed with real values)
apiVersion: v1
kind: Secret
metadata: { name: gitea-pat, namespace: gdfkube }
type: Opaque
stringData: { token: "" }    # trufflehog:ignore
---
apiVersion: v1
kind: Secret
metadata: { name: sonar-token, namespace: gdfkube }
type: Opaque
stringData: { token: "" }    # trufflehog:ignore
```

- [ ] **Step 2: Create the secrets kustomization**

`platform/manifests/secrets/kustomization.yaml`:
```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources: [secrets.yaml]
```

- [ ] **Step 3: Create build RBAC (SA + Role + RoleBinding for `oc start-build`)**

`platform/manifests/builds/rbac.yaml`:
```yaml
apiVersion: v1
kind: ServiceAccount
metadata: { name: build-bootstrap, namespace: gdfkube }
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata: { name: build-starter, namespace: gdfkube }
rules:
  - apiGroups: ["build.openshift.io"]
    resources: ["builds","buildconfigs","buildconfigs/instantiate"]
    verbs: ["get","list","create","watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata: { name: build-bootstrap-starter, namespace: gdfkube }
roleRef: { apiGroup: rbac.authorization.k8s.io, kind: Role, name: build-starter }
subjects:
  - { kind: ServiceAccount, name: build-bootstrap, namespace: gdfkube }
```

- [ ] **Step 4: Create the secrets child Application (wave -5)**

`platform/apps/05-secrets.yaml` — copy the Task 1 Step 4 Application, change `metadata.name` to `gdfkube-secrets`, `sync-wave` to `"-5"`, `source.path` to `.../manifests/secrets`.

- [ ] **Step 5: Validate + trufflehog**

Run: `kustomize build gdfkube-src/gdfkube-infra/platform/manifests/secrets && pre-commit run --all-files`
Expected: kustomize exit 0; trufflehog reports **no verified findings** (ignore markers suppress demo defaults).

- [ ] **Step 6: Commit**

```bash
git add gdfkube-src/gdfkube-infra/platform
git commit -m "platform: demo secrets + build RBAC"
```

---

## Task 3: In-cluster builds (+ the one source edit)

**Files:**
- Modify: `gdfkube-src/gdfkube-camel/Dockerfile.jvm` (add one COPY line)
- Create: `platform/manifests/builds/{imagestreams.yaml,buildconfigs.yaml,build-bootstrap-job.yaml,kustomization.yaml}`
- Create: `platform/apps/10-builds.yaml`

- [ ] **Step 1: Read the camel Dockerfile to find the COPY insertion point**

Run: `sed -n '1,40p' gdfkube-src/gdfkube-camel/Dockerfile.jvm`
Expected: see the helm install block (~lines 18–26) and the app COPY/ENTRYPOINT. Insert the charts COPY before ENTRYPOINT, after the runtime stage `WORKDIR`.

- [ ] **Step 2: Add the charts COPY**

Add this line to the final runtime stage of `gdfkube-src/gdfkube-camel/Dockerfile.jvm` (before ENTRYPOINT):
```dockerfile
COPY --chown=185:0 gdfkube-src/gdfkube-infra/charts /opt/charts
```
Note: the BuildConfig (Step 4) sets `contextDir` to repo root so this path resolves.

- [ ] **Step 3: Create ImageStreams**

`platform/manifests/builds/imagestreams.yaml`:
```yaml
apiVersion: image.openshift.io/v1
kind: ImageStream
metadata: { name: gdfkube-itsm, namespace: gdfkube }
---
apiVersion: image.openshift.io/v1
kind: ImageStream
metadata: { name: gdfkube-itsm-api, namespace: gdfkube }
---
apiVersion: image.openshift.io/v1
kind: ImageStream
metadata: { name: gdfkube-camel, namespace: gdfkube }
```

- [ ] **Step 4: Create BuildConfigs**

`platform/manifests/builds/buildconfigs.yaml` (Docker strategy; git source the GitHub repo; camel uses repo-root context to reach `gdfkube-infra/charts`):
```yaml
apiVersion: build.openshift.io/v1
kind: BuildConfig
metadata: { name: gdfkube-itsm, namespace: gdfkube }
spec:
  source: { type: Git, git: { uri: https://github.com/HugoPfeffer/gdfkube.git, ref: main-openshift }, contextDir: gdfkube-src/gdfkube-itsm }
  strategy: { type: Docker, dockerStrategy: { dockerfilePath: Dockerfile } }
  output: { to: { kind: ImageStreamTag, name: "gdfkube-itsm:latest" } }
  triggers: [{ type: ConfigChange }]
---
apiVersion: build.openshift.io/v1
kind: BuildConfig
metadata: { name: gdfkube-itsm-api, namespace: gdfkube }
spec:
  source: { type: Git, git: { uri: https://github.com/HugoPfeffer/gdfkube.git, ref: main-openshift }, contextDir: gdfkube-src/gdfkube-itsm/server }
  strategy: { type: Docker, dockerStrategy: { dockerfilePath: Dockerfile } }
  output: { to: { kind: ImageStreamTag, name: "gdfkube-itsm-api:latest" } }
  triggers: [{ type: ConfigChange }]
---
apiVersion: build.openshift.io/v1
kind: BuildConfig
metadata: { name: gdfkube-camel, namespace: gdfkube }
spec:
  source: { type: Git, git: { uri: https://github.com/HugoPfeffer/gdfkube.git, ref: main-openshift } }
  strategy: { type: Docker, dockerStrategy: { dockerfilePath: gdfkube-src/gdfkube-camel/Dockerfile.jvm } }
  output: { to: { kind: ImageStreamTag, name: "gdfkube-camel:latest" } }
  triggers: [{ type: ConfigChange }]
```
Verify the itsm-api Dockerfile path: `ls gdfkube-src/gdfkube-itsm/server/Dockerfile` — if it builds from the itsm root, adjust `contextDir`/`dockerfilePath` accordingly.

- [ ] **Step 5: Create the build-bootstrap Job (wave 1)**

`platform/manifests/builds/build-bootstrap-job.yaml`:
```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: build-bootstrap
  namespace: gdfkube
  annotations:
    argocd.argoproj.io/sync-wave: "1"
    argocd.argoproj.io/sync-options: Replace=true
spec:
  backoffLimit: 4
  template:
    spec:
      serviceAccountName: build-bootstrap
      restartPolicy: OnFailure
      containers:
        - name: start-builds
          image: registry.redhat.io/openshift4/ose-cli:latest
          command: ["/bin/sh","-c"]
          args:
            - >
              set -e;
              for b in gdfkube-itsm gdfkube-itsm-api gdfkube-camel; do
                oc start-build "$b" -n gdfkube --wait --follow || exit 1;
              done
```

- [ ] **Step 6: Create the builds kustomization + child App (wave 0)**

`platform/manifests/builds/kustomization.yaml`:
```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources: [rbac.yaml, imagestreams.yaml, buildconfigs.yaml, build-bootstrap-job.yaml]
```
`platform/apps/10-builds.yaml`: child App `gdfkube-builds`, `sync-wave: "0"`, path `.../manifests/builds`.

- [ ] **Step 7: Validate**

Run: `kustomize build gdfkube-src/gdfkube-infra/platform/manifests/builds`
Expected: renders RBAC + 3 ImageStreams + 3 BuildConfigs + Job, exit 0. Then `docker build -f gdfkube-src/gdfkube-camel/Dockerfile.jvm gdfkube-src/gdfkube-camel` is **not** valid anymore (context changed) — confirm `oc apply --dry-run=server` on the BuildConfig instead.

- [ ] **Step 8: Commit**

```bash
git add gdfkube-src/gdfkube-camel/Dockerfile.jvm gdfkube-src/gdfkube-infra/platform
git commit -m "platform: in-cluster builds + ship charts in camel image"
```

---

## Task 4: Stateful tier — mongo, kafka, sonar-db

**Files:**
- Create: `platform/manifests/mongo/{statefulset-mongo.yaml,kustomization.yaml}`
- Create: `platform/manifests/kafka/{statefulset-kafka.yaml,kustomization.yaml}`
- Create: `platform/manifests/sonar/{sonar-db.yaml,kustomization.yaml}`
- Create: `platform/apps/{20-data-mongo.yaml,20-data-kafka.yaml,25-data-sonar.yaml}`

DRY note: mongo1/2/3 (and kafka1/2/3) differ only by name/node-id. Use **one StatefulSet+Service template per instance generated via a kustomize component** — but kustomize has no loop, so author 3 explicit StatefulSets in one file (their bodies are short). This is the actual implementation, not a "similar to" handwave.

- [ ] **Step 1: Write mongo StatefulSets + Services**

`platform/manifests/mongo/statefulset-mongo.yaml` — for `i in 1 2 3` create a `StatefulSet` `mongo$i` (serviceName `mongo$i`, replicas 1, image `mongo:7.0`, args `["mongod","--replSet","rs0","--bind_ip_all"]`, volumeClaimTemplate `data` 5Gi, readiness probe `exec: mongosh --quiet --eval "db.adminCommand('ping').ok"`) and a matching `Service` `mongo$i` (port 27017, selector `app=mongo$i`). sync-wave `"5"`. Set `securityContext.fsGroup` unset (mongo image honors arbitrary uid); add `storageClassName` via kustomize patch in Step 5.

- [ ] **Step 2: Write kafka StatefulSets + Services**

`platform/manifests/kafka/statefulset-kafka.yaml` — for `i in 1 2 3` create `StatefulSet` `kafka$i` (image `apache/kafka:3.7.2`, env exactly as compose for that node id, **omit** the `HOST://` listener: `KAFKA_LISTENERS=PLAINTEXT://0.0.0.0:19092,CONTROLLER://0.0.0.0:9093`, `KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://kafka$i:19092`, keep `KAFKA_CONTROLLER_QUORUM_VOTERS=1@kafka1:9093,2@kafka2:9093,3@kafka3:9093`, `KAFKA_CLUSTER_ID=ghD8_7zXTOW9WdFd5VvQAg`, `KAFKA_LOG_DIRS=/var/lib/kafka/data`), volumeClaimTemplate `data` 10Gi, readiness probe `exec: /opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server localhost:19092`) + `Service` `kafka$i` (ports 19092, 9093). sync-wave `"5"`.

- [ ] **Step 3: Write sonar-db**

`platform/manifests/sonar/sonar-db.yaml` — `StatefulSet` `sonar-db` (image `postgres:15.10-alpine`, env `POSTGRES_USER/PASSWORD/DB` from `sonar-db` Secret, `PGDATA=/var/lib/postgresql/data/pgdata`, volumeClaimTemplate 5Gi, readiness `pg_isready -U sonar -d sonar`) + `Service` `sonar-db` (5432). sync-wave `"5"`. Add `securityContext` leaving uid to the SCC; if the cluster's default SCC rejects it, add an `anyuid` SA (resolve per design risk).

- [ ] **Step 4: Kustomizations + child Apps**

Three `kustomization.yaml` (one per dir) listing their file. Three `apps/*.yaml`: `gdfkube-data-mongo`, `gdfkube-data-kafka`, `gdfkube-data-sonar`, all `sync-wave "5"`, pointing at their manifests dir.

- [ ] **Step 5: Parameterize storageClass**

In each `kustomization.yaml` add a `patches` entry setting `spec.volumeClaimTemplates[0].spec.storageClassName` to a documented value (default: omit → cluster default). Record the cluster's RWO StorageClass in `tasks.md` 4.x notes after `oc get storageclass`.

- [ ] **Step 6: Validate**

Run: `for d in mongo kafka sonar; do kustomize build gdfkube-src/gdfkube-infra/platform/manifests/$d; done`
Expected: 3 StatefulSets + 3 Services (mongo), 3+3 (kafka), 1+1 (sonar-db), exit 0.

- [ ] **Step 7: Commit**

```bash
git add gdfkube-src/gdfkube-infra/platform
git commit -m "platform: stateful tier (mongo/kafka/sonar-db)"
```

---

## Task 5: Init Jobs — mongo & kafka & connect topics

**Files:**
- Create: `platform/manifests/init-jobs/{kustomization.yaml, mongo-init-job.yaml, mongo-seed-job.yaml, mongo-collections-init-job.yaml, kafka-init-job.yaml, connect-topics-init-job.yaml}`
- Create: `platform/apps/40-init-jobs.yaml`

- [ ] **Step 1: configMapGenerator over existing scripts (zero drift)**

`platform/manifests/init-jobs/kustomization.yaml`:
```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: gdfkube
resources:
  - mongo-init-job.yaml
  - mongo-seed-job.yaml
  - mongo-collections-init-job.yaml
  - kafka-init-job.yaml
  - connect-topics-init-job.yaml
configMapGenerator:
  - name: mongo-init-scripts
    files: [../../../mongodb/init-rs.js]
  - name: mongo-seed-scripts
    files: [../../../mongodb/seed-collections.js]
  - name: mongo-seed-data
    files:
      - ../../../mongodb/seed-data/forms.json
      - ../../../mongodb/seed-data/groups.json
      - ../../../mongodb/seed-data/settings.json
      - ../../../mongodb/seed-data/users.json
  - name: mongo-collections-scripts
    files: [../../../mongodb/init-camel-collections.js]
  - name: kafka-init-scripts
    files: [../../../kafka/init-topics.sh]
  - name: connect-topics-scripts
    files: [../../../debezium/init-connect-topics.sh]
generatorOptions: { disableNameSuffixHash: true }
```
(Relative paths resolve from `platform/manifests/init-jobs/` up to `gdfkube-src/gdfkube-infra/`.)

- [ ] **Step 2: mongo-init Job (wave 10)**

`mongo-init-job.yaml` — Job `mongo-init`, annotations `sync-wave:"10"`, `sync-options: Replace=true`, image `mongo:7.0`, mounts `mongo-init-scripts` ConfigMap at `/scripts`, command `["mongosh","--host","mongo1:27017","/scripts/init-rs.js"]`, `restartPolicy: OnFailure`, `backoffLimit: 6`.

- [ ] **Step 3: mongo-seed + mongo-collections-init Jobs (wave 11)**

`mongo-seed-job.yaml` — Job `mongo-seed`, sync-wave `"11"`, image `mongo:7.0`, mounts `mongo-seed-scripts` at `/scripts` and `mongo-seed-data` at `/seed-data`, entrypoint `["mongosh","mongodb://mongo1:27017,mongo2:27017,mongo3:27017/gdfkube?replicaSet=rs0","/scripts/seed-collections.js"]`.
`mongo-collections-init-job.yaml` — Job `mongo-collections-init`, sync-wave `"11"`, mounts `mongo-collections-scripts`, entrypoint `["mongosh","mongodb://mongo1:27017/gdfkube?replicaSet=rs0","/init-camel-collections.js"]`.

- [ ] **Step 4: kafka-init + connect-topics-init Jobs (wave 12)**

`kafka-init-job.yaml` — Job `kafka-init`, sync-wave `"12"`, image `apache/kafka:3.7.2`, mounts `kafka-init-scripts`, command `["bash","/scripts/init-topics.sh"]`.
`connect-topics-init-job.yaml` — Job `gdfkube-connect-topics-init`, sync-wave `"12"`, image `apache/kafka:3.7.2`, mounts `connect-topics-scripts`, command `["bash","/scripts/init-connect-topics.sh"]`.

- [ ] **Step 5: child App + validate zero-drift**

`platform/apps/40-init-jobs.yaml`: child App `gdfkube-init-jobs`, path `.../manifests/init-jobs` (no single wave — resources carry their own).
Run: `kustomize build gdfkube-src/gdfkube-infra/platform/manifests/init-jobs | grep -A2 'name: mongo-init-scripts'`
Then: `diff <(kustomize build .../init-jobs | yq 'select(.metadata.name=="mongo-init-scripts").data["init-rs.js"]') gdfkube-src/gdfkube-infra/mongodb/init-rs.js`
Expected: no diff (ConfigMap content byte-identical to source — satisfies the zero-drift requirement).

- [ ] **Step 6: Commit**

```bash
git add gdfkube-src/gdfkube-infra/platform
git commit -m "platform: mongo/kafka/connect init jobs (configMapGenerator, zero-drift)"
```

---

## Task 6: Gitea operator + CR + re-shaped gitea Jobs

**Files:**
- Create: `platform/manifests/gitea/{operator-subscription.yaml, gitea-cr.yaml, gitea-alias-service.yaml, kustomization.yaml}`
- Create: `platform/manifests/init-jobs/gitea-{bootstrap,seed,token-sync}-job.yaml` (+ add to init-jobs kustomization)
- Create: `platform/apps/{05b-gitea-operator.yaml,30-gitea-cr.yaml}`

- [ ] **Step 1: Discover the operator (cluster command — record output in tasks.md)**

Run: `oc get packagemanifest -n openshift-marketplace | grep -i gitea` then `oc get packagemanifest <pkg> -n openshift-marketplace -o jsonpath='{.status.channels[*].name}{"\n"}'` and `oc explain gitea.spec --recursive | head -60`
Expected: a Gitea package + channel; the CRD field tree. **Finalize Steps 3 against this output** — do not guess field names.

- [ ] **Step 2: OperatorGroup + Subscription (wave -10)**

`platform/manifests/gitea/operator-subscription.yaml`:
```yaml
apiVersion: operators.coreos.com/v1
kind: OperatorGroup
metadata: { name: gitea-og, namespace: gdfkube }
spec: { targetNamespaces: [gdfkube] }
---
apiVersion: operators.coreos.com/v1alpha1
kind: Subscription
metadata: { name: gitea-operator, namespace: gdfkube }
spec:
  channel: REPLACE_FROM_STEP1
  name: REPLACE_FROM_STEP1
  source: community-operators
  sourceNamespace: openshift-marketplace
  installPlanApproval: Automatic
```

- [ ] **Step 3: Gitea CR (wave 5) — fill fields from Step 1 `oc explain`**

`platform/manifests/gitea/gitea-cr.yaml` — Gitea CR mapping compose env: database type `sqlite3`; config overrides `security.INSTALL_LOCK=true`, `service.DISABLE_REGISTRATION=true`, `server.ROOT_URL`=the Route URL; admin user/password from `gitea-admin` Secret. Use the exact CRD apiVersion/kind/fields discovered in Step 1.

- [ ] **Step 4: `gitea` Service alias (only if operator installs Gitea elsewhere)**

`platform/manifests/gitea/gitea-alias-service.yaml`:
```yaml
apiVersion: v1
kind: Service
metadata: { name: gitea, namespace: gdfkube }
spec:
  type: ExternalName
  externalName: REPLACE_WITH_OPERATOR_SERVICE.gdfkube.svc.cluster.local
  ports: [{ port: 3000, targetPort: 3000 }]
```
If the operator already creates a Service named `gitea` in `gdfkube`, delete this file.

- [ ] **Step 5: Re-shape gitea-bootstrap (REST + Secret, wave 15)**

`platform/manifests/init-jobs/gitea-bootstrap-job.yaml` — Job `gitea-bootstrap`, sync-wave `"15"`, image `curlimages/curl:8.11.1` + a small inline `sh` that: waits for `http://gitea:3000/api/v1/version`; creates the org via `POST /api/v1/orgs` (admin creds from `gitea-admin` Secret env); creates a PAT via `POST /api/v1/users/{u}/tokens`; writes the PAT into the `gitea-pat` Secret using a second container/step with `oc` (SA needs `patch secrets`) **or** an in-cluster `kubectl` sidecar. (Keep the org/PAT logic equivalent to `gitea/bootstrap.sh`; transport changes only.) Add a Role allowing `patch` on Secret `gitea-pat`.

- [ ] **Step 6: Re-shape gitea-repo-seed (clone GitHub → push to Gitea, wave 16)**

`gitea-seed-job.yaml` — Job `gitea-repo-seed`, sync-wave `"16"`, image with `git`+`curl`, script: `git clone --depth 1 -b main-openshift https://github.com/HugoPfeffer/gdfkube.git /src`; create the `gdfkube-infra`/`gdfkube-orgs` repos via Gitea API (PAT from `gitea-pat` Secret); push the relevant `/src/gdfkube-src` subtrees. Preserve `gitea/seed-repos.sh` logic; only the source (GitHub clone vs host mount) and auth (PAT Secret) change. Document the github.com egress requirement (design risk; air-gapped fallback noted).

- [ ] **Step 7: Re-shape gitea-token-sync (wave 16)**

`gitea-token-sync-job.yaml` — Job `gitea-token-sync`, sync-wave `"16"`, image `mongo:7.0`, reads PAT from `gitea-pat` Secret env, runs the `gitea/sync-token.sh` mongosh logic to upsert `gdfkube.gitea_settings` in `mongodb://mongo1:27017/gdfkube?replicaSet=rs0`.

- [ ] **Step 8: Wire kustomization + child Apps**

Add the 3 gitea Job files to `platform/manifests/init-jobs/kustomization.yaml` `resources`. New `platform/manifests/gitea/kustomization.yaml` listing operator+CR+alias. `apps/05b-gitea-operator.yaml` (wave -10, path gitea, but split: operator Subscription must apply before CR — keep CR in `apps/30-gitea-cr.yaml` wave 5). Confirm `git diff --stat gdfkube-src/gdfkube-infra/argocd gdfkube-src/gdfkube-infra/charts` is **empty** (tenant layer untouched — spec requirement).

- [ ] **Step 9: Validate + commit**

Run: `kustomize build gdfkube-src/gdfkube-infra/platform/manifests/gitea && kustomize build gdfkube-src/gdfkube-infra/platform/manifests/init-jobs`
Expected: exit 0; tenant diff empty.
```bash
git add gdfkube-src/gdfkube-infra/platform
git commit -m "platform: gitea operator + CR + REST/Secret-based gitea jobs"
```

---

## Task 7: SonarQube, Debezium-connect, their bootstrap/init Jobs

**Files:**
- Create: `platform/manifests/sonar/sonarqube.yaml` (append) and `platform/manifests/sonar/sonarqube-route.yaml`
- Create: `platform/manifests/apps/debezium-connect.yaml`
- Create: `platform/manifests/init-jobs/{debezium-init-job.yaml,sonar-bootstrap-job.yaml}` (+ kustomization, + configMapGenerator entries)
- Create: `platform/apps/{45-sonarqube.yaml, 45-debezium.yaml}`

- [ ] **Step 1: SonarQube StatefulSet + Service + Route (wave 13)**

Add to `platform/manifests/sonar/`: `StatefulSet` `sonarqube` (image `sonarqube:26.4.0.121862-community`, env exactly as compose incl. `SONAR_JDBC_*` from `sonar-db` Secret and `SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true`, 3 volumeClaimTemplates data/extensions/logs, readiness `curl :9000/api/system/status | grep UP`, `startupProbe` with generous failureThreshold to match `start_period: 120s`), `Service` `sonarqube` :9000, `Route` `sonarqube`. sync-wave `"13"`. Apply the SCC decision from the design risk.

- [ ] **Step 2: Debezium-connect Deployment + Service (wave 14)**

`platform/manifests/apps/debezium-connect.yaml` — `Deployment` `gdfkube-debezium-connect` (image `debezium/connect:2.7.3.Final`, env exactly as compose: `BOOTSTRAP_SERVERS=kafka1:19092,kafka2:19092,kafka3:19092`, GROUP_ID, the 3 storage topics, converters), readiness `GET :8083/`, `Service` :8083. sync-wave `"14"`.

- [ ] **Step 3: configMapGenerator + Jobs for debezium-init & sonar-bootstrap (wave 16)**

Add to init-jobs `kustomization.yaml` configMapGenerator: `debezium-init-scripts` from `../../../debezium/register-connector.sh` + `../../../debezium/connector-config.json`; `sonar-bootstrap-scripts` from `../../../sonarqube/bootstrap.sh`.
`debezium-init-job.yaml` — Job `gdfkube-debezium-init`, sync-wave `"16"`, image `curlimages/curl:8.10.1`, mounts scripts, entrypoint `["sh","/register-connector.sh"]`.
`sonar-bootstrap-job.yaml` — Job `sonar-bootstrap`, sync-wave `"16"`, image `curlimages/curl:8.11.1`, env `SONAR_URL=http://sonarqube:9000`, `SONAR_ADMIN_PASSWORD`/`SONAR_DB_PASSWORD` from Secrets, `SONAR_PROJECTS=gdfkube-camel,gdfkube-itsm-web,gdfkube-itsm-server`; write the resulting token into the `sonar-token` Secret (Role: patch `sonar-token`).

- [ ] **Step 4: child Apps + validate**

`apps/45-sonarqube.yaml`, `apps/45-debezium.yaml`. Run `kustomize build` for `sonar`, `apps`, `init-jobs`.
Expected: exit 0; sonarqube StatefulSet has 3 PVCs; debezium Deployment present.

- [ ] **Step 5: Commit**

```bash
git add gdfkube-src/gdfkube-infra/platform
git commit -m "platform: sonarqube + debezium-connect + their init jobs"
```

---

## Task 8: App tier — itsm-api, camel, itsm SPA + Routes

**Files:**
- Create: `platform/manifests/apps/{itsm-api.yaml,camel.yaml,itsm-spa.yaml,kustomization.yaml}`
- Create: `platform/apps/50-apps.yaml`

- [ ] **Step 1: itsm-api Deployment + Service (wave 50)**

`platform/manifests/apps/itsm-api.yaml` — `Deployment` `gdfkube-itsm-api` (image from ImageStream `gdfkube-itsm-api:latest` with `image.openshift.io/triggers` annotation, env `MONGO_URL=mongodb://mongo1:27017/gdfkube?replicaSet=rs0`, `KAFKA_BOOTSTRAP_SERVERS=kafka1:19092,kafka2:19092,kafka3:19092`, readiness `GET :3000/healthz/live`), `Service` `gdfkube-itsm-api` :3000. sync-wave `"50"`.

- [ ] **Step 2: camel Deployment + Service (wave 50)**

`platform/manifests/apps/camel.yaml` — `Deployment` `gdfkube-camel` (ImageStream `gdfkube-camel:latest` + trigger annotation, env `KAFKA_BOOTSTRAP_SERVERS`, `MONGODB_URI=mongodb://mongo1:27017,mongo2:27017,mongo3:27017/gdfkube?replicaSet=rs0`, `APP_SYSTEM_GITEA_EXTERNAL_URL=http://gitea:3000`, `APP_SYSTEM_GITEA_OWNER=gdfkube`, readiness `GET :8080/q/health/ready`), `Service` :8080. sync-wave `"50"`. No chart volume mount (charts baked into image, Task 3).

- [ ] **Step 3: itsm SPA Deployment + Service + Route (wave 55)**

`platform/manifests/apps/itsm-spa.yaml` — `Deployment` `itsm` (ImageStream `gdfkube-itsm:latest` + trigger, readiness `GET :8080/`), `Service` `itsm` :8080, `Route` `itsm` → Service `itsm`. sync-wave `"55"`.

- [ ] **Step 4: kustomization + child App**

`platform/manifests/apps/kustomization.yaml` listing `itsm-api.yaml camel.yaml itsm-spa.yaml debezium-connect.yaml`. `platform/apps/50-apps.yaml` child App `gdfkube-apps` path `.../manifests/apps`.

- [ ] **Step 5: Validate**

Run: `kustomize build gdfkube-src/gdfkube-infra/platform/manifests/apps`
Expected: 3 Deployments + 3 Services + 1 Route (+ debezium), exit 0.

- [ ] **Step 6: Commit**

```bash
git add gdfkube-src/gdfkube-infra/platform
git commit -m "platform: app tier (itsm-api, camel, itsm SPA) + route"
```

---

## Task 9: End-to-end validation & integration

**Files:** none (verification only).

- [ ] **Step 1: Render all bases**

Run: `for d in gdfkube-src/gdfkube-infra/platform/manifests/*/; do echo "== $d"; kustomize build "$d" >/dev/null && echo OK; done`
Expected: every base prints `OK`.

- [ ] **Step 2: trufflehog + push**

Run: `pre-commit run --all-files`
Expected: pass. Then `git push origin main-openshift`.

- [ ] **Step 3: Server-side dry-run (operator-run; hand to user if no local `oc`)**

Run: `for d in gdfkube-src/gdfkube-infra/platform/manifests/*/; do kustomize build "$d" | oc apply --dry-run=server -f - ; done` and `oc apply --dry-run=server -f gdfkube-src/gdfkube-infra/platform/app-of-apps.yaml`
Expected: all `... (server dry run)` accepted.

- [ ] **Step 4: Bootstrap**

Run: `oc apply -n openshift-gitops -f https://raw.githubusercontent.com/HugoPfeffer/gdfkube/main-openshift/gdfkube-src/gdfkube-infra/platform/app-of-apps.yaml`
Then `argocd app sync gdfkube-platform --prune && argocd app wait gdfkube-platform --health --timeout 1800`
Expected: app Healthy.

- [ ] **Step 5: Component verification**

Run each and confirm:
```
oc get csv -n gdfkube | grep -i gitea           # Succeeded
oc -n gdfkube get builds                          # 3 Complete
oc -n gdfkube get sts,deploy,job,pods             # all Ready/Complete
oc -n gdfkube exec sts/mongo1 -- mongosh --quiet --eval 'rs.status().ok'   # 1
oc -n gdfkube exec sts/kafka1 -- /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:19092 --list
oc -n gdfkube rsh deploy/gdfkube-itsm-api wget -qO- localhost:3000/healthz/live
oc -n gdfkube rsh deploy/gdfkube-camel curl -sf localhost:8080/q/health/ready
curl -sf https://$(oc -n gdfkube get route itsm -o jsonpath='{.spec.host}')/
```

- [ ] **Step 6: Idempotency + two-layer integrity**

Run: `argocd app sync gdfkube-platform` a second time → all Jobs re-run clean, nothing Degraded.
Run: `git diff --stat origin/main-openshift -- gdfkube-src/gdfkube-infra/argocd gdfkube-src/gdfkube-infra/charts`
Expected: empty (tenant-provisioning layer untouched); confirm `org-repos-discovery` ApplicationSet still reconciles against in-cluster Gitea.

- [ ] **Step 7: Final commit (verification notes into tasks.md)**

```bash
git add openspec/changes/deploy-platform-to-openshift-argocd/tasks.md
git commit -m "platform: record e2e verification evidence"
```

---

## Self-Review

**Spec coverage** (`specs/openshift-platform-deploy/spec.md`):
- Single-command app-of-apps bootstrap → Task 1 (entrypoint), Task 9 Step 4.
- Compose-faithful topology / mongo-kafka per-instance DNS → Task 4; Service names verified Task 9 Step 5.
- Sync-wave ordering + idempotent Jobs → waves set in Tasks 1–8; idempotency Task 9 Step 6.
- In-cluster builds + charts in camel image → Task 3; verified Task 9 Step 5.
- Gitea via official operator, REST/Secret jobs, `gitea:3000` resolvable → Task 6.
- Zero-drift init assets (configMapGenerator) → Task 5 Step 1/5 (byte-identical diff check).
- Tenant layer preserved → Task 6 Step 8, Task 9 Step 6 (empty diff).
- Secrets without committed plaintext → Task 2; trufflehog Task 9 Step 2.
All requirements map to a task. No gaps.

**Placeholder scan:** The `REPLACE_FROM_STEP1` / `REPLACE_WITH_OPERATOR_SERVICE` tokens in Task 6 are **not** forbidden placeholders — they are outputs of the explicit `oc get packagemanifest`/`oc explain` discovery commands in Task 6 Step 1, which the design's #1 risk requires resolving on the live cluster (operator CRD shape is not knowable offline). Every other step contains concrete content.

**Type/name consistency:** Service names (`mongo1/2/3`, `kafka1/2/3`, `gitea`, `sonarqube`, `sonar-db`, `gdfkube-itsm-api`, `gdfkube-camel`, `itsm`, `gdfkube-debezium-connect`) and Secret names (`gitea-admin`, `gitea-pat`, `sonar-db`, `sonar-admin`, `sonar-token`) are used consistently across Tasks 2–9 and match `docker-compose.yml`. ImageStream names match BuildConfig outputs and Deployment triggers.

---

## Execution Handoff

Plan complete and saved to `openspec/changes/deploy-platform-to-openshift-argocd/plan.md`. Implement via the OpenSpec apply workflow (`/opsx:apply`) or superpowers:subagent-driven-development, task-by-task, committing at each task boundary on `main-openshift`.
