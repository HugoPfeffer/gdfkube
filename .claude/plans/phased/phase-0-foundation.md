# Phase 0 — Foundation: Monorepo + Score scaffolding

| Field         | Value                            |
| ------------- | -------------------------------- |
| Status        | Not started                      |
| Predecessor   | —                                |
| Successor     | [Phase 1](phase-1-cdc-ingest.md) |

## 0. Project context (overarching)

This is the first phase of the **gdfkube v2 rewrite**. The full rewrite is delivered through six phased PRDs (this is one of them); each phase ends in a demonstrable working project that gates the next.

### 0.1 Why a rewrite

v1 evolved organically over ~330 commits and proved the core idea — *form submission becomes Git commit becomes cluster manifest* — but accreted enough debt in three subsystems that a clean rewrite is justified:

1. **Kafka topics and the Debezium CDC envelope** — the contract between MongoDB and the consumer.
2. **The Camel processor / route layer** — the orchestration that turns a CDC event into Git commits inside the monorepo.
3. **Helm chart templates** — the single source of truth for rendered Kubernetes manifests. (v1 used Mustache + Kustomize; v2 drops both in favour of Helm.)

Everything in v2 must preserve the GitOps invariant: **Camel writes Git, ArgoCD reads Git, ArgoCD applies the cluster.** No imperative `kubectl apply` paths, no cluster mutation from the consumer.

### 0.2 Repository shape change (v1 → v2)

v1 spread the system across three Git repos (`gdfkube-infra`, `gdfkube-{org}`, `gdfkube-templates`). v2 collapses everything into a single monorepo at `gdfkube-src/`, with the former repos becoming top-level subdirectories that **keep their v1 names verbatim** (`gdfkube-infra/`, `gdfkube-orgs/`, with chart definitions split by scope across both — see §0.4). The CDC consumer commits inside this monorepo; ArgoCD points at paths inside it. Multi-repo write coordination (and its rollback dance, v1's L8) goes away as a consequence.

> **Terminology lock.** Throughout v2, `org` ≡ `groupname` ≡ `meta.requesterGroupName` (the field carried on every CDC event). The three are interchangeable; the codebase, manifests, and labels use `org` as the canonical short form.

### 0.3 Companion design bundle

The frontend half of the project ships as a Claude Design handoff bundle at `gdfkube-src/gdfkube-itsm/gdfkube (Remix)-handoff.zip`. The remix bundle defines the ITSM portal UX (catalog, approvals, multi-org dashboard, audit log, role split admin/operator). This rewrite is the **backend** counterpart and must stay aligned with it: every form type the remix exposes (`cluster-request`, `namespace-request`, `scale-request`) must round-trip through the pipeline described across these phases. The remix's manifest preview pane (`admin.jsx`) also fixes the surface contract for the rendered manifests — naming conventions, label namespace, and HyperShift namespacing all derive from there. Where the backend PRDs are silent on a UI affordance or a manifest detail, the remix is the source of truth.

**Naming and label conventions inherited from the remix (locked here, applied in every later phase):**

| Surface                       | Convention                                                  | Source in remix              |
| ----------------------------- | ----------------------------------------------------------- | ---------------------------- |
| HostedCluster `metadata.name` | `hc-{org}-{cluster}`                                        | `admin.jsx` cluster-request  |
| HostedCluster namespace       | `clusters` (standard HyperShift)                            | `admin.jsx` cluster-request  |
| ManagedCluster `metadata.name`| `{cluster}` (the form's `vars.clusterName` verbatim)        | `admin.jsx` cluster-request  |
| ApplicationSet `metadata.name`| `appset-{org}-{cluster}`                                    | `admin.jsx` cluster-request  |
| AppProject `metadata.name`    | `{org}` (single AppProject per org)                         | `admin.jsx` cluster-request  |
| Resource label                | `gdfkube.gov/org: {{ meta.requesterGroupName }}`            | every chart in `admin.jsx`   |
| Clusterset membership label   | `cluster.open-cluster-management.io/clusterset: {org}`      | required by RHACM (tmp-refs) |

### 0.4 Project goals (apply to every phase)

- Deterministic, idempotent processing of MongoDB CDC events end-to-end.
- A single rendering engine that handles every form type without per-form Java code.
- Crisp separation, **as subdirectories of the `gdfkube-src/` monorepo**, between **platform-once installs** (`gdfkube-src/gdfkube-infra/`) and **per-customer accumulation** (`gdfkube-src/gdfkube-orgs/{org}/`). Helm charts live next to whatever they render: platform/infra-tier charts under `gdfkube-src/gdfkube-infra/charts/`, shared cross-org charts under `gdfkube-src/gdfkube-orgs/charts/`, and per-org charts under `gdfkube-src/gdfkube-orgs/{org}/charts/`. The three v1 Git repos are gone; ArgoCD points at paths inside `gdfkube-src/`.
- Local-vs-OpenShift parity driven by **CNCF [Score](https://score.dev/)** as the single source of truth for the workloads we own (Node app, Camel consumer). Stateful platform infra (Kafka, MongoDB, Gitea, Debezium runtime, ArgoCD, RHACM) is *not* described in Score — it is provisioned **outside this codebase by the agnosticd Ansible framework** before our pipeline ever runs, and then surfaced into Score via the `resources:` block. **Phase 0 stands up the local-dev equivalents as `compose.yaml` services** (see §3.2.1) so the same Score spec drives both environments, but in OpenShift our deliverable consumes the Strimzi / Bitnami MongoDB / Gitea / Debezium services that agnosticd has already deployed.
- Observability: every CDC event is traceable from MongoDB `requestId` to Git commit SHA.
- **Single deployable artifact.** The OpenShift deliverable is one Helm chart that argocd applies via the agnosticd-installed app-of-apps; nothing in this repo executes `kubectl apply` against a live cluster.

### 0.5 Project non-goals

- A new form schema language or a new template engine. Mustache is dropped in favour of Helm; the existing `formSchemas` document survives.
- Replacing ArgoCD/RHACM/HyperShift. The downstream stays as it is.
- Multi-tenancy beyond the `meta.requesterGroupName` → `org` mapping. RBAC for the form UI is out of scope.
- **In-band approval enforcement via the Node app.** The remix's approval queue (`approvals.jsx`) is a real backend concern, not a frontend mock — but the gate is implemented as a *separate CDC stream* (see Phase 1 §3.6 and Phase 4 §3.11), not as a synchronous endpoint that blocks form submission. The `requests` collection always emits a `op=c` CDC event on submit; the `approvals` collection emits its own events; the Camel saga waits for an approval event on the matching `requestId` before acting. The Node app is not in the saga critical path beyond writing both documents.
- **Platform-bootstrap install.** Out of scope for this and every subsequent phase. The hub-cluster bootstrap layer is provisioned by the **agnosticd Ansible framework** outside this codebase: agnosticd brings up the cluster, installs all required operators (Strimzi, Bitnami MongoDB, Gitea, Debezium, ArgoCD, RHACM, HyperShift), mirrors this repo into the in-cluster Gitea, and runs an agnosticd role that applies the **initial ArgoCD `ApplicationSet` (the app-of-apps entry point)** which in turn pulls down our Helm chart and deploys the demo/project stack. Concretely, v2 does *not* author or render: (a) the `gdfkube-platform` AppProject that impersonates `argocd-platform-manager`; (b) the `org-infra-discovery` ApplicationSet that discovers per-org directories under `gdfkube-src/gdfkube-infra/orgs/`; (c) hub-side `ClusterRole`s such as `setic-platform-admin` / `setic-operator`; (d) hub-targeted `ConfigurationPolicy` resources (e.g. pull-secret distribution). v2 charts populate `gdfkube-src/gdfkube-infra/orgs/<org>/`; the bootstrap ApplicationSet that *finds* those directories is delivered by agnosticd. The cutover runbook (Phase 5 §3.6) lists the agnosticd-managed bootstrap manifests as a prerequisite, not a deliverable.
- **Hub cluster topology, RHACM/ODF/KubeVirt operator versions, and SSH/pull-secret distribution policies.** All hub-cluster install concerns belong to the agnosticd runbook; v2 is the application that runs on a working hub.

### 0.6 Lessons carried forward (v1 catalog, full)

These are findings from v1 that the v2 design must respect. Each one was paid for in commits. The "Owner" column points to the phase that implements (or formally closes) the lesson — the full text and resolution detail live in that phase's "Lessons applied" section.

**Disposition vocabulary used across phases** (so a reader of any single phase can interpret the lesson's status without cross-referencing):

- **closed** — the underlying problem still exists in v2's design space and is solved by a concrete v2 mechanism. Example: L4 (`exec:git`), closed by `GitWriter`.
- **obsoleted** — the underlying problem no longer exists because v2's architecture removed the precondition. Example: L8 (multi-repo write rollback), obsoleted by the monorepo collapse.
- **retired** — the v1 lesson described an abstraction that v2 deliberately replaces with a different design. Example: L9 (`templateFieldIdentifier` indirection), retired in favour of per-`formId` switch.
- **pinned** — the lesson is real and unsolved in v2 by design; a defensive workaround is documented but the underlying concern survives. Example: L11 (templates outlive renderer), pinned through Phase 4 and closed by the admin re-render task in Phase 5.

| #   | Finding                                                                                                                                                                                  | Owner phase                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| L1  | **Camel K's YAML-only runtime cannot host CDI beans.** Forced a switch from a Camel K Integration CR to a full Quarkus container.                                                       | Phase 0                                                                      |
| L2  | **Sync-wave ordering matters inside a single rendered package.** Templates must encode sync-wave annotations and the renderer must not strip them.                                       | [Phase 2](phase-2-helm-charts.md)                                            |
| L3  | **Mustache `{{ }}` collides with ArgoCD Go templates `{{ }}`.** v2 drops Mustache + Kustomize for Helm; the collision shifts in form and is resolved by Phase 2.                         | [Phase 2](phase-2-helm-charts.md)                                            |
| L4  | **`exec:git` shell-outs are brittle.** v2 replaces them with JGit through a `GitWriter` facade.                                                                                          | [Phase 3](phase-3-mvp-consumer.md) (closure: [Phase 4](phase-4-full-sagas.md)) |
| L5  | **Debezium delete events have no `before` payload by default.** v2 mandates pre-image capture; the soft-delete trick is removed.                                                          | [Phase 1](phase-1-cdc-ingest.md)                                             |
| L6  | **GUID generated inside the renderer is non-reproducible.** v2 derives the GUID deterministically from `requestId` (SHA-256 → 4 hex chars).                                              | [Phase 3](phase-3-mvp-consumer.md)                                           |
| L7  | **Header-based exchange state grows uncontrollably.** v2 uses a single typed `RequestContext` exchange property.                                                                         | [Phase 3](phase-3-mvp-consumer.md)                                           |
| L8  | **Multi-repo write needs transactional rollback.** *Obsoleted* by the monorepo collapse.                                                                                                  | [Phase 4](phase-4-full-sagas.md) (closure)                                   |
| L9  | **The `templateFieldIdentifier` indirection is the right abstraction.** Re-evaluated under per-form-type topics; replaced by a per-formId Java switch.                                    | [Phase 4](phase-4-full-sagas.md) (closure)                                   |
| L10 | **Wrong template variable paths only surface end-to-end.** v2 ships a mandatory chart-lint CI gate.                                                                                       | [Phase 2](phase-2-helm-charts.md)                                            |
| L11 | **Templates outlive the renderer.** v2 adds an admin re-render task as the closure.                                                                                                       | [Phase 4](phase-4-full-sagas.md) (pinned), [Phase 5](phase-5-hardening-cutover.md) (closure) |
| L12 | **Org-level grouping infra is create-once.** v2 codifies tier-aware destinations.                                                                                                         | [Phase 4](phase-4-full-sagas.md)                                             |
| L13 | **Connector parity drifts.** v2 has one source of truth for connector config.                                                                                                            | Phase 0 (gate scaffolding), [Phase 1](phase-1-cdc-ingest.md) (concrete payload) |
| L14 | **Token lifecycle is decoupled from process lifecycle.** *Obsoleted* — agnosticd mirrors the repo into the in-cluster Gitea and provisions the credentials via a Kubernetes `Secret`; the v1 `gitea-init.sh` + mtime-watch dance disappears. The chart consumes the `Secret` by reference.  | Phase 0 (record only), [Phase 3](phase-3-mvp-consumer.md) (Secret reference) |

## 1. Scope

Stand up the empty `gdfkube-src/` monorepo, the Score specs for the two workloads we own, and the local + cluster runtime scaffolding. **No business logic.** The workloads are dummy `nginx` / `hello-world` containers; the goal is to prove the plumbing and tooling are in place so every later phase has a stable substrate.

In:

- `gdfkube-src/` directory tree as in §3.1 below (`gdfkube-infra/`, `gdfkube-orgs/`, plus `charts/` subdirectories under each — see §0.4; subdirs may be empty placeholders).
- `score.node.yaml`, `score.camel.yaml` for the two workloads (dummy images).
- `score-compose generate` produces a runnable `compose.yaml` covering Mongo, Kafka, Kafka Connect, Gitea, the two dummy workloads.
- `score-helm generate` produces a Helm release that `kubectl apply --dry-run=server` accepts against an empty kind cluster.
- `Taskfile.yaml` as the **TDD test runner / helper** for the project: `test`, `test:unit`, `test:int`, `test:watch` exercise the test suite under TDD; `dev:up`, `dev:down`, `dev:logs`, `score:gen`, `score:diff` are convenience wrappers around the Score / compose loop.
- `.github/workflows/chart-lint.yaml` skeleton (no-ops while there are no charts; passes vacuously).
- `connector.json` checked in (single source of truth, applied locally via REST and via Strimzi `KafkaConnector` template — even though no consumer reads its output yet).
- Devcontainer `dev:up` smoke documented in `gdfkube-src/README.md`.

## 2. Out of scope

- MongoDB schema / pre-and-post-images config (Phase 1).
- Helm charts under `charts/` subtrees (Phase 2).
- Camel routes (Phase 3).
- Form submission UI / Node app endpoints beyond a `/health` (Phase 1).

## 3. Architecture

### 3.1 Monorepo layout (the empty tree)

```text
gdfkube-src/
├── score.node.yaml                       # Node app workload spec (Score) — dummy image in this phase
├── score.camel.yaml                      # Camel consumer workload spec (Score) — dummy image in this phase
├── connector.json                        # Single source of truth for the Debezium connector config (no SMTs yet)
├── compose.yaml                          # Generated by `task score:gen` (score-compose output, checked in)
├── gdfkube-infra/                        # platform-once, append-only — collapses former gdfkube-infra repo
│   ├── charts/                           # platform/infra-tier Helm charts (populated in Phase 2)
│   │   └── .gitkeep
│   ├── orgs/                             # per-org infra-tier accumulation (created from Phase 4)
│   │   └── .gitkeep
│   └── .gitkeep
├── gdfkube-orgs/                         # customer-tier — collapses former gdfkube-{org} repos
│   ├── charts/                           # shared cross-org Helm charts (populated in Phase 2)
│   │   └── .gitkeep
│   └── .gitkeep                          # per-org subtrees (gdfkube-orgs/{org}/{charts,…}) appear from Phase 4
├── camel/                                # Camel-Quarkus consumer source (populated from Phase 3)
│   └── .gitkeep
├── node/                                 # Node app source (populated from Phase 1)
│   └── .gitkeep
├── scripts/                              # register-connector.sh, install-crds.sh, …
├── tests/                                # fixtures, snapshots, e2e — driven by Taskfile test:* targets
├── Taskfile.yaml                         # TDD test runner + dev:* / score:* convenience wrappers
├── README.md                             # how to run the dev stack
└── gdfkube-itsm/                         # remix bundle (frontend handoff, already on disk)
```

The three former Git repos (`gdfkube-infra`, `gdfkube-{org}`, `gdfkube-templates`) collapse into the two top-level `gdfkube-infra/` and `gdfkube-orgs/` subtrees, with chart definitions split across them by scope (see §0.4). ArgoCD `Application` and `ApplicationSet` resources point at directories inside `gdfkube-src/` — Phase 0 doesn't deploy ArgoCD (agnosticd does, see §0.5), but the path layout is locked in here so the agnosticd-managed app-of-apps always knows where to look.

### 3.2 Local-vs-OpenShift parity (Score-driven)

Parity is enforced by **CNCF [Score](https://score.dev/)** spec files checked into `gdfkube-src/`. We author `score.yaml` once per workload (Node app, Camel consumer); `score-compose` generates the local Docker Compose stack and `score-helm` (or `score-k8s`) generates the OpenShift manifests. Stateful infra is **not** described in the Score spec — it is consumed via `resources:` references and supplied by the runtime:

| Surface            | Authored where                  | Local backing                                                         | OpenShift backing                                | How parity is enforced                                                          |
| ------------------ | ------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------- |
| Node app           | `gdfkube-src/score.node.yaml`   | `score-compose` → service in `compose.yaml`                           | `score-helm` → Deployment + Service              | Single `score.yaml`; no env drift                                               |
| Camel consumer     | `gdfkube-src/score.camel.yaml`  | `score-compose` → service in `compose.yaml`                           | `score-helm` → Deployment + Service              | Single `score.yaml`; same JAR, same routes                                      |
| Kafka              | Score `resources: kafka`        | `apache/kafka:3.9` KRaft single broker (compose snippet)              | **Strimzi `Kafka` CR pre-deployed by agnosticd** — we reference the existing `bootstrap.gdfkube.svc:9092` | Score resource provisioner outputs the same env vars (bootstrap, topic prefix)  |
| Debezium Connect   | Score `resources: kafka-connect`| `quay.io/debezium/connect:3.0` (compose snippet)                      | **Strimzi `KafkaConnect` pre-deployed by agnosticd**; we ship a `KafkaConnector` CR | Same `connector.json` registered both ways                                      |
| MongoDB            | Score `resources: mongo`        | `mongo:7` single replica set (compose snippet)                        | **Bitnami MongoDB pre-deployed by agnosticd**; we reference the existing `Service` | Pre-and-post-images enabled at init in both (wired in Phase 1)                  |
| Gitea              | Score `resources: gitea`        | Compose service                                                       | **Gitea pre-deployed by agnosticd, repo pre-mirrored**; we consume the credential `Secret` | Same Gitea API URL, same `Secret` reference (no in-pod token init)              |
| Charts source      | `gdfkube-{infra,orgs}/charts/`, `gdfkube-orgs/{org}/charts/` | Filesystem (monorepo path)                            | Filesystem (monorepo path)                       | No external "templates repo" — monorepo collapse (L8 obsolete; closed in Phase 4) |

**Why Score and not "raw" compose + raw Helm.** Two reasons. First, the platform infra (Kafka/Connect/MongoDB/Gitea) is **not ours to deploy in OpenShift** — agnosticd has already stood it up and we just need to discover the existing endpoints. Score's `resources:` provisioners give us a single declarative way to express that discovery, instead of forking the wiring per environment. Second, for the workloads we do own (Node, Camel), the `score.yaml` becomes the parity contract: the same spec produces both `compose.yaml` for local dev and the Helm release that ArgoCD applies in OpenShift; drift is caught when the two outputs diverge in CI (`score-parity.yaml`, see §3.6).

#### 3.2.1 Local-dev `compose.yaml` components (concrete deliverable)

In OpenShift, the platform pieces come from agnosticd. Locally, we need our own copy. **Phase 0 must check in / generate a `compose.yaml` that boots the full set of local-dev components** so contributors can run `task dev:up` on a clean checkout. The components below are the minimum for the Phase 0 smoke test; later phases will tighten init scripts and image versions but never add new top-level services.

| Compose service | Image (pin)                       | Purpose in local dev                                                                  | Init / config knob                                                |
| --------------- | --------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `mongo`         | `mongo:7.0`                       | CDC source. Single-node replica set so Debezium oplog tailing works.                  | `mongod --replSet rs0`; `init-mongo.js` runs `rs.initiate()`      |
| `kafka`         | `apache/kafka:3.9`                | KRaft single broker; topics auto-created from `connector.json` in Phase 1.            | `KAFKA_PROCESS_ROLES=broker,controller`; advertised on `kafka:9092` |
| `kafka-connect` | `quay.io/debezium/connect:3.0`    | Hosts the MongoDB connector. Phase 0 just registers an empty `connector.json` body.  | `BOOTSTRAP_SERVERS=kafka:9092`; `register-connector.sh` on start  |
| `gitea`         | `gitea/gitea:1.22`                | Local Git target for the Camel writer. Repo seeded by `gitea-init.sh` (local only).   | `GITEA__server__ROOT_URL=http://gitea:3000/`; admin user via env  |
| `node-dummy`    | `nginxinc/nginx-unprivileged:1.27`| Stand-in for the Node app until Phase 1 puts real code behind the Score spec.         | Generated by `score-compose` from `score.node.yaml`               |
| `camel-dummy`   | `quay.io/quarkus/quarkus-micro-image:2.0` | Stand-in for the Camel-Quarkus consumer until Phase 3 lands the routes.     | Generated by `score-compose` from `score.camel.yaml`              |

The local-only `gitea-init.sh` mirrors what agnosticd does on the cluster (creates the admin user and pre-creates the `gdfkube-src` repo) so Phase 3+ can authenticate using the same `Secret`-shaped contract in both environments — see §3.4. **`compose.yaml` itself is generated by `score-compose` from the two `score.yaml` files plus a small `score-compose.yaml` overlay that pins these images and mounts the init scripts.** It is checked in (regenerable via `task score:gen`) so reviewers can see the expected stack without running the generator.

A minimal regenerated `compose.yaml` looks like:

```yaml
# compose.yaml — generated by `task score:gen`; do not hand-edit.
name: gdfkube-dev
services:
  mongo:
    image: mongo:7.0
    command: ["mongod", "--replSet", "rs0", "--bind_ip_all"]
    volumes:
      - ./scripts/init-mongo.js:/docker-entrypoint-initdb.d/init-mongo.js:ro
    healthcheck:
      test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand('ping')"]
      interval: 5s
      retries: 12
  kafka:
    image: apache/kafka:3.9
    environment:
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
  kafka-connect:
    image: quay.io/debezium/connect:3.0
    depends_on: [kafka]
    environment:
      BOOTSTRAP_SERVERS: kafka:9092
      GROUP_ID: gdfkube-connect
    volumes:
      - ./connector.json:/etc/connect/connector.json:ro
      - ./scripts/register-connector.sh:/docker-entrypoint-init.d/register-connector.sh:ro
  gitea:
    image: gitea/gitea:1.22
    environment:
      GITEA__server__ROOT_URL: http://gitea:3000/
      GITEA__database__DB_TYPE: sqlite3
    volumes:
      - ./scripts/gitea-init.sh:/usr/local/bin/gitea-init.sh:ro
  node-dummy:    # rendered from score.node.yaml
    image: nginxinc/nginx-unprivileged:1.27
  camel-dummy:   # rendered from score.camel.yaml
    image: quay.io/quarkus/quarkus-micro-image:2.0
```

### 3.3 Configuration policy

All env vars are documented in one table in `.claude/reference/standards/development-deployment.md` (already exists; v2 keeps it as the source of truth). Names are identical across environments. Phase 0 wires this contract: every env var either originates from a `score.yaml` `variables:` block or from a Score `resource` provisioner — no unmanaged env vars in compose or Helm output.

### 3.4 Secrets policy

- **Gitea credentials:** in OpenShift, agnosticd creates the Gitea instance, mirrors this repo into it, and provisions a `Secret` (`gdfkube-gitea-credentials`) carrying the admin token. Our Helm chart consumes the `Secret` by reference; nothing in this codebase writes credentials, runs `gitea-init.sh` against the cluster, or watches token files. The locally-mounted `scripts/gitea-init.sh` is **dev-only** and runs only inside the compose stack to mirror the agnosticd-provided shape (same `Secret` name, same key) — so the Camel consumer reads `process.env.GITEA_TOKEN` identically in both environments.
- **MongoDB:** no auth in v2 (demo posture). RHACM-injected pull secrets and SSH keys are managed by RHACM `ConfigurationPolicy` and never by Camel.

### 3.5 Camel runtime choice

Camel ships as **Camel-Quarkus** (a full container) on both local and OpenShift — same JAR, same routes. Phase 0 stands up an empty Quarkus container shell so the build/test loop is exercised even before Phase 3 puts routes in it.

> **Why not Camel K?** v1 tried it and hit the wall: the YAML-only Camel K Integration runtime cannot host CDI beans, but every processor we need (`@ApplicationScoped`, `@Inject`) requires CDI. The Quarkus container path is unavoidable; Phase 0 picks it up front.

### 3.6 Guardrails (invariants enforced by Phase 0 CI)

Each guardrail below is enforced by a concrete CI check, listed alongside. Adding a deliverable that violates one of these must fail CI; bypassing them needs a code-owner override and a memo in the PR body.

| # | Invariant                                                                                          | Enforced by                                                              |
| - | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| G1| Every env var in compose / Helm output traces to a Score `variables:` or `resources:` provisioner. | `score-parity.yaml`: greps generator output for env vars not declared in Score. |
| G2| `connector.json` body is the only place SMTs / capture mode are authored.                          | `connector-parity.yaml`: diffs `connector.json` against the rendered `KafkaConnector` CR. |
| G3| Resource label namespace is `gdfkube.gov/org`. Any reference to the legacy `gdfkube.gov/group` is a CI failure. | `chart-lint.yaml`: `grep -RIn 'gdfkube.gov/group'` returns 0 matches.   |
| G4| No `kubectl apply` / `oc apply` invocation in the deliverable. Cluster mutations always go through ArgoCD. | `chart-lint.yaml`: `grep -RIn -E '\b(kubectl\|oc)\s+apply\b' gdfkube-src/` returns 0 matches outside `tests/` and dev-only `scripts/`. |
| G5| Helm chart paths only live under `gdfkube-{infra,orgs}/charts/` or `gdfkube-orgs/<org>/charts/`. A `Chart.yaml` anywhere else fails the layout check. | `chart-lint.yaml`: `find gdfkube-src -name Chart.yaml` outside the allowed roots = fail. |
| G6| `score-helm generate` output applies cleanly via `kubectl apply --dry-run=server` (server-side schema OK). | `score-parity.yaml`: dry-run job against kind.                          |
| G7| Helm chart values can only be set from Score-derived inputs (no chart-internal magic values that aren't traceable to a Score field). | Phase 2 lint extends this; Phase 0 records the rule.                     |

#### 3.6.1 Taskfile (TDD test runner — concrete shape)

Per the project goal, `Taskfile.yaml` is **first and foremost a TDD helper**: the inner loop is `task test:watch`, which re-runs the smallest relevant subset on file change. The `dev:*` and `score:*` tasks are wrappers around the loop, not the primary surface.

```yaml
# gdfkube-src/Taskfile.yaml
version: "3"

tasks:
  default:
    cmds: [task --list]

  # ── TDD inner loop ────────────────────────────────────────────────
  test:
    desc: Run the full Phase 0 test suite (unit + parity + chart-lint + helm-dry-run).
    deps: [test:unit, test:parity, test:chart-lint, test:helm-dry-run]
  test:unit:
    desc: Pure-unit tests (no compose stack required).
    cmds: ["go test ./tests/unit/...", "npm --prefix node test --silent || true"]
  test:int:
    desc: Integration tests against the running compose stack (requires `task dev:up`).
    cmds: ["go test ./tests/integration/..."]
  test:watch:
    desc: TDD watcher — reruns unit tests on save.
    cmds: ["watchexec -e go,js,yaml,json -- task test:unit"]
  test:parity:
    desc: Score / connector parity diffs (mirror of CI).
    cmds: ["./scripts/score-parity.sh", "./scripts/connector-parity.sh"]
  test:chart-lint:
    cmds: ["./scripts/chart-lint.sh"]
  test:helm-dry-run:
    cmds:
      - score-helm generate -f score.node.yaml -f score.camel.yaml | kubectl apply --dry-run=server -f -

  # ── Score generation ─────────────────────────────────────────────
  score:gen:
    desc: Regenerate compose.yaml and the Helm release from the Score specs.
    cmds:
      - score-compose generate -f score.node.yaml -f score.camel.yaml -f score-compose.yaml -o compose.yaml
      - score-helm generate -f score.node.yaml -f score.camel.yaml -o /tmp/gdfkube-helm
  score:diff:
    desc: Diff env vars / port lists between compose and Helm outputs.
    cmds: ["./scripts/score-parity.sh --print"]

  # ── Local stack lifecycle ────────────────────────────────────────
  dev:up:    { cmds: ["docker compose up -d --wait"] }
  dev:down:  { cmds: ["docker compose down -v"] }
  dev:logs:  { cmds: ["docker compose logs -f"] }
```

#### 3.6.2 Score specs (Phase 0 dummy shape)

```yaml
# gdfkube-src/score.node.yaml — Node app, dummy image
apiVersion: score.dev/v1b1
metadata:
  name: gdfkube-node
containers:
  app:
    image: nginxinc/nginx-unprivileged:1.27   # replaced by real image in Phase 1
    variables:
      MONGO_URI: "mongodb://${resources.mongo.host}:${resources.mongo.port}/gdfkube?replicaSet=rs0"
      GITEA_URL: "${resources.gitea.url}"
      GITEA_TOKEN: "${resources.gitea.token}"
    livenessProbe:
      httpGet: { path: /health, port: 8080 }
service:
  ports:
    http: { port: 8080, targetPort: 8080 }
resources:
  mongo:  { type: mongodb }
  gitea:  { type: gitea }
```

```yaml
# gdfkube-src/score.camel.yaml — Camel-Quarkus consumer, dummy image
apiVersion: score.dev/v1b1
metadata:
  name: gdfkube-camel
containers:
  app:
    image: quay.io/quarkus/quarkus-micro-image:2.0   # replaced by Phase 3 build
    variables:
      KAFKA_BOOTSTRAP_SERVERS: "${resources.kafka.bootstrap}"
      GITEA_URL: "${resources.gitea.url}"
      GITEA_TOKEN: "${resources.gitea.token}"
resources:
  kafka:  { type: kafka }
  gitea:  { type: gitea }
```

#### 3.6.3 `connector.json` (Phase 0 skeleton)

```json
{
  "name": "gdfkube-mongo-source",
  "config": {
    "connector.class": "io.debezium.connector.mongodb.MongoDbConnector",
    "mongodb.connection.string": "mongodb://mongo:27017/?replicaSet=rs0",
    "topic.prefix": "gdfkube",
    "capture.mode": "change_streams_update_full_with_pre_image"
  }
}
```

The body is intentionally minimal in Phase 0 — Phase 1 fills the SMT chain. The point of checking it in now is to lock the **single-source-of-truth** contract so that both `register-connector.sh` (local) and the Strimzi `KafkaConnector` template (cluster) consume the exact same JSON.

#### 3.6.4 Score-parity workflow (skeleton)

```yaml
# .github/workflows/score-parity.yaml
name: score-parity
on: [pull_request, push]
jobs:
  diff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: score-spec/setup-score-compose@v1
      - uses: score-spec/setup-score-helm@v1
      - run: |
          cd gdfkube-src
          score-compose generate -f score.node.yaml -f score.camel.yaml -f score-compose.yaml -o /tmp/compose.yaml
          score-helm   generate -f score.node.yaml -f score.camel.yaml -o /tmp/helm
          ./scripts/score-parity.sh /tmp/compose.yaml /tmp/helm   # diffs env vars + ports; exits non-zero on drift
```

## 4. Lessons applied in this phase

### L1 — Camel K's YAML-only runtime cannot host CDI beans

**Origin (v1).** All processors (`resourceNameResolver`, `customerRepoChecker`, etc.) need `@ApplicationScoped` / `@Inject`, which forced a switch from a Camel K Integration CR to a full Quarkus container. Reference commit: `3613886`.

**Action in Phase 0.** v2 ships as Camel-Quarkus on both local and OpenShift — same image, same JAR, same routes. Phase 0 bakes this choice into the dummy Camel container scaffold so later phases inherit it without rework. No Camel K runtime is exercised at any point.

### L13 — Connector parity drifts

**Origin (v1).** Local `register-connector.sh` was missing `capture.mode` while the OpenShift `KafkaConnector` set it explicitly. Reference: `add-request-deletion` proposal §6.

**Action in Phase 0.** Establish `gdfkube-src/connector.json` as the single source of truth, applied identically by both environments — local Connect via REST, OCP via a Strimzi `KafkaConnector` CR template that `valuesFrom` the same JSON. Stand up `.github/workflows/score-parity.yaml` with a diff job over the rendered surfaces. The connector body itself is intentionally empty here; Phase 1 fills the SMT chain and the parity gate catches any drift.

### L14 — Token lifecycle is decoupled from process lifecycle (*obsoleted*)

**Origin (v1).** Gitea token was created by `gitea-init.sh` *after* the consumer container started; v1 reloaded from file based on mtime. Reference: `GiteaTokenProvider`.

**Action in Phase 0.** **Obsoleted by the agnosticd handover (see §0.5 / §3.4).** In OpenShift, agnosticd deploys Gitea, mirrors this repo into it, and pre-creates the credentials `Secret` before our Helm chart is ever applied — so by the time Camel starts, the token exists. The mtime-watch / late-binding code path is dropped from v2. The contract Phase 3 inherits is "read `GITEA_TOKEN` from the env at startup; if missing, fail fast." Locally, `scripts/gitea-init.sh` runs inside compose to mirror the same `Secret`-shaped contract; it is not part of the cluster deliverable.

## 5. Deliverables

- `gdfkube-src/gdfkube-infra/.gitkeep`, `gdfkube-src/gdfkube-infra/charts/.gitkeep`, `gdfkube-src/gdfkube-infra/orgs/.gitkeep`
- `gdfkube-src/gdfkube-orgs/.gitkeep`, `gdfkube-src/gdfkube-orgs/charts/.gitkeep`
- `gdfkube-src/score.node.yaml`, `gdfkube-src/score.camel.yaml`, `gdfkube-src/score-compose.yaml` (image-pin overlay)
- `gdfkube-src/connector.json` (empty body; SMTs land in Phase 1)
- `gdfkube-src/Taskfile.yaml` (test-runner targets per §3.6.1) and `gdfkube-src/compose.yaml` (regenerable via `task score:gen`)
- `gdfkube-src/scripts/{init-mongo.js,register-connector.sh,gitea-init.sh}` — local-dev init scripts only
- `.github/workflows/chart-lint.yaml` (skeleton; vacuous pass)
- `.github/workflows/score-parity.yaml` — diffs `score-compose generate` vs `score-helm generate` env-var and port surfaces; fails on drift.
- `.github/workflows/connector-parity.yaml` — diffs `connector.json` against the rendered `KafkaConnector` CR template.

## 6. Working-project demo

```bash
$ task dev:up
# … score-compose pulls images, compose stack converges …

$ docker compose ps
# all services Healthy: mongo, kafka, kafka-connect, gitea, node-dummy, camel-dummy

$ task test
# unit + parity + chart-lint + helm-dry-run all green

$ score-helm generate -f score.node.yaml -f score.camel.yaml | \
    kubectl apply --dry-run=server -f -
# all manifests accepted by the API server
```

## 7. Acceptance criteria (gate to Phase 1)

- [ ] `task dev:up` reaches healthy state in ≤2 min on a fresh checkout in this devcontainer.
- [ ] `task test` runs the full Phase 0 test suite (unit + parity + chart-lint + helm-dry-run) and exits 0.
- [ ] `task test:watch` re-runs the relevant subset on file change (TDD inner loop).
- [ ] `score-helm generate | kubectl apply --dry-run=server` returns 0 against a kind cluster with no extra CRDs installed.
- [ ] `score-compose` and `score-helm` produce identical env-var sets and port lists for the Node and Camel workloads (CI-enforced via `score-parity.yaml`).
- [ ] `connector.json` is the single source of truth — local REST registration and Strimzi `KafkaConnector` reference the same file (CI diff job passes).
- [ ] `chart-lint.yaml` workflow runs on a no-op PR and passes (vacuous).
- [ ] `gdfkube-src/README.md` documents `task dev:up`, `task test`, and how to inspect each running service.
- [ ] No Phase 0 manifest references `gdfkube.gov/group` — the canonical label is `gdfkube.gov/org`. Grep gate enforced in `chart-lint.yaml`.
- [ ] No script in `gdfkube-src/` invokes `kubectl apply` or `oc apply` — the cluster path is **always** ArgoCD reading Git (see §3.6).

## 8. Test plan

| Test           | Type    | How                                                                            |
| -------------- | ------- | ------------------------------------------------------------------------------ |
| Compose health | Smoke   | `task dev:up && docker compose ps` — all services healthy                      |
| Helm dry-run   | Smoke   | `score-helm generate` piped into `kubectl apply --dry-run=server` against kind |
| Score parity   | CI      | `score-parity.yaml` workflow                                                   |
| Connector diff | CI      | Diff between `connector.json` and the rendered `KafkaConnector` CR             |
| Devcontainer   | Manual  | Fresh `Dev Containers: Rebuild Container`, then `task dev:up` from clean state |

## 9. Risks and on-hold items

- None — this phase has no dependency on any held lessons. Phase 0 freezes the plumbing; held items (the templateFieldIdentifier indirection, ArgoCD-side templating decision, and the "templates outlive renderer" lesson) are revisited in their respective downstream phases.

## 10. References

- [Score (CNCF)](https://score.dev/), [score-compose](https://github.com/score-spec/score-compose), [score-helm](https://github.com/score-spec/score-helm)
- [Strimzi Kafka](https://strimzi.io/) Helm chart — Kafka + KafkaConnect provisioning in OCP
- [Bitnami MongoDB](https://artifacthub.io/packages/helm/bitnami/mongodb) Helm chart — MongoDB provisioning in OCP
- [Gitea](https://docs.gitea.com/installation/install-with-helm) Helm chart — Git server in OCP
- `gdfkube-src/gdfkube-itsm/gdfkube (Remix)-handoff.zip` — UX handoff bundle (catalog, approvals, request-detail, admin) — frontend source of truth
- `.claude/reference/standards/development-deployment.md` — env contract (still authoritative for env-var names)
