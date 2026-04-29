<!-- TASK FORMAT:
     - [ ] TSK-<CAP>-<REQ>-<seq> [P] <Description> | traces: REQ-<CAP>-<REQ> | depends_on: none
     [P] = parallelizable (no unresolved dependencies within the same or earlier wave)
     Each task: 1-4 hours, one concern, verifiable.
-->

## Wave 0 — Foundation (no dependencies) [P]

- [x] TSK-001-01-01 [P] Create the `gdfkube-src/` directory tree with `.gitkeep` placeholders for `gdfkube-infra/`, `gdfkube-infra/charts/`, `gdfkube-infra/orgs/`, `gdfkube-orgs/`, `gdfkube-orgs/charts/`, `camel/`, `node/`, `scripts/`, `tests/` so a fresh clone reproduces §3.1 of the phase plan | traces: REQ-001-01 | depends_on: none
- [x] TSK-001-04-01 [P] Author `gdfkube-src/README.md` with the §0.3 naming conventions table (`hc-{org}-{cluster}`, `appset-{org}-{cluster}`, AppProject `{org}`, label namespace `gdfkube.gov/org`) and the `task dev:up` smoke instructions | traces: REQ-001-04 | depends_on: none
- [x] TSK-006-01-01 [P] Author `gdfkube-src/connector.json` with `name=gdfkube-mongo-source`, `connector.class=io.debezium.connector.mongodb.MongoDbConnector`, `topic.prefix=gdfkube`, `mongodb.connection.string=mongodb://mongo:27017/?replicaSet=rs0`, `capture.mode=change_streams_update_full_with_pre_image`, and zero `transforms*` keys | traces: REQ-006-01 | depends_on: none

## Wave 1 — Specs, init scripts, and gate scripts [P]

- [x] TSK-002-01-01 [P] Author `gdfkube-src/score.node.yaml` per §3.6.2: `apiVersion: score.dev/v1b1`, `metadata.name: gdfkube-node`, `containers.app.image: nginxinc/nginx-unprivileged:1.27`, variables `MONGO_URI`/`GITEA_URL`/`GITEA_TOKEN` from `${resources.mongo.*}`/`${resources.gitea.*}`, `service.ports.http: 8080`, `resources: {mongo, gitea}` | traces: REQ-002-01 | depends_on: TSK-001-01-01
- [x] TSK-002-02-01 [P] Author `gdfkube-src/score.camel.yaml` per §3.6.2: `apiVersion: score.dev/v1b1`, `metadata.name: gdfkube-camel`, `containers.app.image: quay.io/quarkus/quarkus-micro-image:2.0`, variables `KAFKA_BOOTSTRAP_SERVERS`/`GITEA_URL`/`GITEA_TOKEN`, `resources: {kafka, gitea}` | traces: REQ-002-02 | depends_on: TSK-001-01-01
- [x] TSK-003-02-01 [P] Author `gdfkube-src/scripts/init-mongo.js` invoking `rs.initiate()` so the single-node replica set comes up before the healthcheck passes | traces: REQ-003-02 | depends_on: TSK-001-01-01
- [x] TSK-003-03-01 [P] Author `gdfkube-src/scripts/register-connector.sh` that POSTs `/etc/connect/connector.json` to `http://localhost:8083/connectors` with retry-with-backoff up to 60s and a clear stderr message on timeout | traces: REQ-003-03 | depends_on: TSK-001-01-01, TSK-006-01-01
- [x] TSK-003-04-01 [P] Author `gdfkube-src/scripts/gitea-init.sh` to create a local-dev admin user, pre-create the `gdfkube-src` repo, and refuse to run against any host other than `gitea` (via a guard on `GITEA_URL`) | traces: REQ-003-04 | depends_on: TSK-001-01-01
- [x] TSK-005-01-01 [P] Author `gdfkube-src/scripts/chart-lint.sh` enforcing: (a) `Chart.yaml` only under the three allowed roots, (b) absence of the legacy v1 group-label literal under `gdfkube-src/`, (c) no imperative `apply` invocation against `kubectl`/`oc` outside `tests/`/`scripts/` — emit one "0 violations" line per check on success | traces: REQ-005-01, REQ-001-02, REQ-001-03 | depends_on: TSK-001-01-01
- [x] TSK-005-02-01 [P] Author `gdfkube-src/scripts/score-parity.sh` to diff env-var sets and port lists between the `score-compose generate` and `score-helm generate` outputs and exit non-zero on drift, citing guardrail G1 with the offending var names | traces: REQ-005-02, REQ-002-03 | depends_on: TSK-001-01-01
- [x] TSK-005-03-01 [P] Author `gdfkube-src/scripts/connector-parity.sh` to diff `connector.json` against the rendered `KafkaConnector` CR template field-by-field and exit non-zero on drift, citing guardrail G2 | traces: REQ-005-03 | depends_on: TSK-001-01-01, TSK-006-01-01
- [x] TSK-006-02-01 [P] Author `gdfkube-src/scripts/strimzi-kafka-connector.template.yaml` interpolating `connector.json` (no inline `config` overrides); add a header comment marking the file parity-only until Phase 1 promotes it | traces: REQ-006-02 | depends_on: TSK-006-01-01

## Wave 2 — Score overlay and generated compose

- [x] TSK-002-03-01 Author `gdfkube-src/score-compose.yaml` image-pin overlay binding the Score `resources:` to `mongo:7.0`, `apache/kafka:3.9`, `quay.io/debezium/connect:3.0`, `gitea/gitea:1.22`, and mounting `scripts/init-mongo.js`, `scripts/register-connector.sh`, `scripts/gitea-init.sh` into the right services | traces: REQ-002-03, REQ-003-01 | depends_on: TSK-002-01-01, TSK-002-02-01, TSK-003-02-01, TSK-003-03-01, TSK-003-04-01
- [x] TSK-003-01-01 Run `score-compose generate -f score.node.yaml -f score.camel.yaml -f score-compose.yaml -o compose.yaml` and check in the resulting `gdfkube-src/compose.yaml`; verify `task dev:up` reaches `Healthy`/`Running` within 120s on the devcontainer | traces: REQ-003-01, REQ-004-03 | depends_on: TSK-002-03-01

## Wave 3 — Task runner and CI workflows [P]

- [x] TSK-004-01-01 [P] Author `gdfkube-src/Taskfile.yaml` with the `test`, `test:unit`, `test:int`, `test:watch`, `test:parity`, `test:chart-lint`, `test:helm-dry-run`, `score:gen`, `score:diff`, `dev:up`, `dev:down`, `dev:logs` targets per §3.6.1 — `test:watch` invokes `watchexec -e go,js,yaml,json -- task test:unit` | traces: REQ-004-01, REQ-004-02, REQ-004-03, REQ-004-04 | depends_on: TSK-005-01-01, TSK-005-02-01, TSK-005-03-01, TSK-003-01-01
- [x] TSK-005-01-02 [P] Author `.github/workflows/chart-lint.yaml` to run on every `pull_request`/`push`, install jq + grep deps, invoke `gdfkube-src/scripts/chart-lint.sh`, and fail loudly with the citing-guardrail message | traces: REQ-005-01 | depends_on: TSK-005-01-01
- [x] TSK-005-02-02 [P] Author `.github/workflows/score-parity.yaml` per §3.6.4 — install `score-compose` + `score-helm` via `score-spec/setup-*` actions with pinned versions, regenerate both surfaces, invoke `score-parity.sh`, and fail on drift | traces: REQ-005-02 | depends_on: TSK-005-02-01, TSK-002-03-01
- [x] TSK-005-03-02 [P] Author `.github/workflows/connector-parity.yaml` to invoke `connector-parity.sh` and fail on field drift | traces: REQ-005-03 | depends_on: TSK-005-03-01

## Wave 4 — Self-tests and acceptance verification

- [x] TSK-005-01-03 [P] Author `gdfkube-src/tests/unit/chart-lint-self-test.sh` seeding fixtures that violate each chart-lint rule (a `Chart.yaml` outside allowed roots, a manifest with the legacy v1 group-label, an `apply` invocation in a non-test path) and asserting `chart-lint.sh` exits non-zero with the right G* citation for each | traces: REQ-005-01, REQ-001-02, REQ-001-03 | depends_on: TSK-005-01-01
- [x] TSK-005-04-01 [P] Author `gdfkube-src/tests/unit/guardrail-hook-test.sh` exercising the `.claude/hooks/check-guardrails.sh` payload contract: legitimate writes pass (exit 0); legacy-label introduction blocks (exit 2 with `blocked by G3`); imperative `apply` invocation outside `tests/`/`scripts/` blocks (exit 2 with `blocked by G4`) | traces: REQ-005-04 | depends_on: none
- [x] TSK-001-04-02 [P] Author `gdfkube-src/tests/acceptance/readme-conventions.sh` greppingthe README for each of the four canonical patterns and naming missing ones in stderr | traces: REQ-001-04 | depends_on: TSK-001-04-01
- [x] TSK-004-01-02 Run `task test` end-to-end on a fresh devcontainer and confirm: all four subtasks pass, total runtime ≤120s warm-cache, `task dev:up` healthy ≤120s — close out the Phase 0 acceptance gate | traces: REQ-004-01, REQ-004-03 | depends_on: TSK-004-01-01, TSK-005-01-03, TSK-005-04-01, TSK-001-04-02

---

## Dependency Graph

```text
Wave 0 [P]: TSK-001-01-01, TSK-001-04-01, TSK-006-01-01
Wave 1 [P]: TSK-002-01-01, TSK-002-02-01, TSK-003-02-01, TSK-003-03-01,
            TSK-003-04-01, TSK-005-01-01, TSK-005-02-01, TSK-005-03-01,
            TSK-006-02-01
Wave 2:     TSK-002-03-01 → TSK-003-01-01
Wave 3 [P]: TSK-004-01-01, TSK-005-01-02, TSK-005-02-02, TSK-005-03-02
Wave 4:     TSK-005-01-03 [P], TSK-005-04-01 [P], TSK-001-04-02 [P],
            TSK-004-01-02 (sequential close-out)
```

**Critical path**: TSK-001-01-01 → TSK-002-01-01 → TSK-002-03-01 → TSK-003-01-01 → TSK-004-01-01 → TSK-004-01-02

**Sub-agent allocation**:

- Wave 0: 3 agents (one per task, run in parallel)
- Wave 1: 9 agents (one per task, run in parallel; all only depend on Wave 0 outputs)
- Wave 2: 1 agent (TSK-002-03-01 then TSK-003-01-01 sequential — same agent owns both)
- Wave 3: 4 agents (one per task; the three workflow files are independent of one another)
- Wave 4: 4 agents (three [P] self-tests run in parallel; TSK-004-01-02 runs last as the acceptance close-out)
