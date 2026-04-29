# Phase 3 — MVP consumer: `cluster-request` happy path

| Field         | Value                              |
| ------------- | ---------------------------------- |
| Status        | Not started                        |
| Predecessor   | [Phase 2](phase-2-helm-charts.md)  |
| Successor     | [Phase 4](phase-4-full-sagas.md)   |

## 1. Scope

The first end-to-end slice. The Camel consumer reads from **one** topic (`dbz.gdfkube.requests.cluster-request`), builds a typed `RequestContext`, calls the Phase-2 chart via `helm template`, and commits the rendered tree into `gdfkube-src/orgs/<org>/clusters/<resourceName>/`. Only `op=c` and `op=u`. No org-tier (infra/), no delete, no multi-form-type. No saga runner — sequential code.

This is the smallest possible slice that proves the spine of the system works end-to-end.

In:

- Camel route (Quarkus container) subscribing to a single topic.
- `cdcEnvelopeParser` processor — parses the Debezium envelope, builds `RequestContext`.
- Java beans:
  - `RequestContext` (typed exchange property — L7 Alt A).
  - `ResourceNameResolver` — `cluster-request → vars.clusterName`.
  - `ValuesBuilder` — `RequestContext → values.yaml` (L6 Alt A GUID derivation: `first 4 hex chars of SHA-256(requestId)`).
  - `HelmRenderer` — shells out to `helm template <chart> -f <values>` and writes to `/tmp/{requestId}-resource/`.
  - `GitWriter` — JGit clone of `gdfkube-src` (L4), `add` of `orgs/<org>/clusters/<name>/`, commit (skip if `git diff --cached` is empty), push.
- Idempotency: re-delivering the same `op=c` event produces an empty diff and no new commit.
- Camel route YAML capped at ≤80 lines for this phase.

## 2. Out of scope

- Other form types (`namespace-request`, `scale-request`) — Phase 4.
- Org-tier (`infra/orgs/<org>/`) rendering — Phase 4.
- Delete (`op=d`) — Phase 4.
- `SagaRunner`, `CreateOrUpdateSaga`, `DeleteSaga` — Phase 4.
- **Approval join.** The remix's approval queue is honored end-to-end by Phase 4 §3.11. Phase 3 ships an `auto-approve` step at the head of the route that resolves every request immediately, so the spine is demonstrable without an approval event. The auto-approver is deleted in Phase 4 when `cdc-approvals` lands.
- DLQ wiring beyond "consumer doesn't crash on a poison message" — Phase 5.
- Observability log lines beyond Camel defaults — Phase 5.

## 3. Architecture

### 3.1 Design principles

1. **Routes orchestrate; processors do.** No business logic in `<choice>` blocks; `setHeader` is for routing only.
2. **One typed exchange property over many headers.** The pipeline carries a `RequestContext` object (`requestId`, `formId`, `org`, `resourceName`, `op`, `before`, `after`) instead of a dozen string headers. (L7 Alt A; alternatives recorded in §4 below.)
3. **Repo writes go through one Git facade — `GitWriter` — backed by JGit.** No `exec:git` shell-outs. (L4.)
4. **Sagas, not nested doTry.** Phase 3 implements the create/update path *sequentially* (not yet via `SagaRunner`). The saga refactor lands in Phase 4 once the second op (`d`) and the org-tier conditional join.
5. **Everything is a bean.** Reflection-friendly (`@RegisterForReflection`), `@ApplicationScoped`, no static state.

### 3.2 Component map (Phase 3 slice)

```
                      +----------------------+
                      |  KafkaCdcConsumer    |   from("kafka:dbz.gdfkube.requests.cluster-request")
                      |  (route)             |   parses envelope, builds RequestContext (formId fixed: cluster-request)
                      +----------+-----------+
                                 |
                                 v
                       +---------+----------+
                       |   RequestRouter    |   c/u/r → direct:create-or-update
                       |  (route)           |   d     → not yet implemented (logged + offset committed; Phase 4)
                       +---------+----------+
                                 |
                                 v
                     +-----------+-----------+
                     |    CreateOrUpdate     |   sequential code (no saga runner yet):
                     |       (processor)     |   1. resolveResourceName
                     +-----------+-----------+   2. renderResource (HelmRenderer)
                                 |               3. commitMonorepo (GitWriter)
                                 v
                     +-----------------------+
                     |     HelmRenderer      +---------------+
                     |  (helm template)      |               |
                     +-----------+-----------+               v
                                 |               +-----------------------+
                                 v               |   GitWriter (JGit)    |
                     +-----------------------+   +-----------------------+
                     |    ValuesBuilder      |
                     |  (RequestContext →    |
                     |   values.yaml object) |
                     +-----------------------+
```

### 3.3 Component contracts (Phase 3 subset)

| Bean                       | Responsibility                                                   | Notes for Phase 3                                                                                                                                         |
| -------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KafkaCdcConsumer` (route) | Parse envelope, build `RequestContext`, dispatch                 | Subscribes to a single literal topic `dbz.gdfkube.requests.cluster-request`. Pattern subscription lands in Phase 4. Replaces v1's inline `<choice>` on `${header.cdcOperation}`. |
| `ResourceNameResolver`     | Maps `vars.*` → `resourceName` per form type                     | Hard-coded to `cluster-request → vars.clusterName` in this phase; calls for any other formId throw `UnsupportedOperationException`. The full switch lands in Phase 4. |
| `HelmRenderer`             | Runs `helm template <chart> -f <values>` and writes to a tmp dir | Replaces v1's `ClusterTemplateRenderer` + `InfraTemplateRenderer` + Mustache engine. Phase 3 only renders the customer-tier chart (`charts/cluster-request/`). |
| `ValuesBuilder`            | Constructs the `values.yaml` object from a `RequestContext`      | Centralises `body.*` wrapping, ISO-8601 conversion from Mongo Extended JSON, GUID derivation (L6 Alt A — see §3.5).                                       |
| `GitWriter`                | JGit-backed clone, copy/remove, commit, push, cleanup            | Replaces all `exec:git` calls (L4). Single target — the `gdfkube-src` monorepo.                                                                          |
| `GuidDeriver`              | `requestId → guid` (deterministic 4-hex-char)                    | New in Phase 3; pure function, unit-tested.                                                                                                              |
| `GiteaTokenProvider`       | mtime-watched token file                                         | Inherited from Phase 0 scaffold; first phase that actually authenticates against Gitea via the token.                                                    |

### 3.4 Routes (slim version)

The route YAML for Phase 3 is intentionally small (single topic, no pattern subscription):

```yaml
- route:
    id: cdc-cluster-request
    from:
      uri: "kafka:dbz.gdfkube.requests.cluster-request?groupId={{gdfkube.cdc.group}}"
      steps:
        - process: { ref: cdcEnvelopeParser } # builds RequestContext; topic name → formId=cluster-request
        - choice:
            when:
              - simple: "${exchangeProperty.context.op} in 'c,u,r'"
                steps:
                  - to: direct:create-or-update
              - simple: "${exchangeProperty.context.op} == 'd'"
                steps:
                  - log: "delete not implemented in Phase 3, formId=${exchangeProperty.context.formId}"

- route:
    id: create-or-update
    from:
      uri: direct:create-or-update
      steps:
        - process: { ref: createOrUpdateProcessor }
```

Two routes total. Step orchestration lives in Java inside `createOrUpdateProcessor`. The Camel route YAML must remain ≤80 lines through Phase 3.

### 3.5 GUID derivation (closes L6 with Alt A)

Reproducibility is mandatory: re-rendering the same request must produce identical Git output. v1's `String.format("%04x", new Random().nextInt(0xFFFF))` is the antipattern. v2 picks **Alt A — Hash-derived**:

```java
public static String derive(String requestId) {
    byte[] digest = MessageDigest.getInstance("SHA-256").digest(requestId.getBytes(UTF_8));
    return String.format("%02x%02x", digest[0] & 0xff, digest[1] & 0xff);
}
```

- Pros: deterministic, no schema change, no extra storage.
- Cons: 16-bit collision domain (1 in 65 536) within an org's lifetime — acceptable at expected volumes; revisit if collisions surface.

Alternatives considered (recorded for posterity):

- **Alt B — Use the ULID itself.** Pros: trivially deterministic, already globally unique. Cons: 26 chars is too long when GUID is used as a DNS label suffix or in `metadata.name`.
- **Alt C — Persist GUID at form-submit time.** The Node app generates the GUID and writes it into the Mongo doc; CDC carries it. Pros: zero ambiguity, GUID lifecycle owned by the form layer. Cons: schema change, and the renderer still has to handle older docs without a stored GUID. Defer until Alt A's collision risk is measured.

### 3.6 Operation handling matrix (Phase 3 slice)

| `op` | `before` | `after`  | Phase 3 behaviour                                                                                       |
| ---- | -------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `c`  | null     | full doc | Render `charts/cluster-request` + commit to `orgs/<org>/clusters/<resourceName>/`                       |
| `u`  | full doc | full doc | **Re-render** if any `vars.*` changed; otherwise no-op (skip-empty-diff policy in §3.7).                |
| `r`  | null     | full doc | Snapshot — same path as `c`.                                                                             |
| `d`  | full doc | null     | **Not in scope.** Logged and skipped; offset committed. Phase 4 implements `DeleteSaga`.                |

### 3.7 Idempotency (create/update half)

The Camel consumer must be safe to re-deliver any CDC event. Phase 3 enforces this for `c/u/r`:

- All Git commits keyed by `requestId` (commit subject contains the ULID).
- Rendered file paths are deterministic per `requestId` so re-renders produce a clean diff or empty diff.
- The pipeline checks `git diff --cached --name-only` before committing; if empty, no commit, no push.
- The temp working directory is `/tmp/{requestId}-resource` and is **always** cleaned, even on failure.

### 3.8 Scope-of-work for L4 in this phase

L4 (no `exec:git`) is closed for the cluster-request slice. Other form types still have no Git path because their routes don't exist yet — Phase 4 inherits the closure when it widens the route set.

## 4. Lessons applied in this phase

### L4 — `exec:git` shell-outs are brittle

**Origin (v1).** A spurious `/infra` suffix in `gitSourcePath` made `cp -r` fail silently and no infra ever reached `gdfkube-infra`. Reference commit: `1a8549d`. The underlying cause: the consumer ran `git clone` / `cp` / `git add` / `git push` via `camel-exec`, which swallows non-zero exits unless explicitly checked. The bug was a path-string bug masked by a tool that does not surface failures cleanly.

**Action in Phase 3.** All Git operations go through a new `GitWriter` facade backed by JGit — one library, typed exceptions, no string-quoted paths. No `camel-exec` invocations remain in the cluster-request route. (The full closure across all routes lands in Phase 4 when the other form-types are wired up.)

### L6 — GUID generated inside the renderer is non-reproducible

**Origin (v1).** `String.format("%04x", new Random().nextInt(0xFFFF))` inside `ClusterTemplateRenderer` means re-rendering the same request produces a different `infraID`.

**Action in Phase 3 (Alt A — Hash-derived).** GUID derives deterministically from `requestId` via the first 4 hex chars of SHA-256. Re-deliveries produce identical Git commits. Pros: deterministic, no schema change, no extra storage. Cons: 16-bit collision domain (1 in 65 536) within an org's lifetime — acceptable at expected request volumes; revisit if collisions surface. The unit test `GuidDeriverTest` asserts determinism across JVM starts. (Alternatives B and C are listed in §3.5 above.)

### L7 — Header-based exchange state grows uncontrollably

**Origin (v1).** Routes pass `customerRepoExists`, `customerRepoCreated`, `infraOutputPath`, `infraTemplateCount`, `clusterName`, `resourceName`, `targetRepoName`, `gitSourcePath`, `commitMessage`, `gitWorkDir`, `gitCloneUrl`, `gitDiffOutput`, `templateFieldIdentifier`, `cdcOperation` … as headers. Reference: `cdc-consumer.camel.yaml`.

**Action in Phase 3 (Alt A — typed exchange property).** A single `RequestContext` object carries `requestId`, `formId`, `org`, `resourceName`, `op`, `before`, `after`. Pros: typed, refactor-safe via Java compiler, no string keys to drift. Cons: less inspectable in Camel's stock debug viewers (which show headers, not properties).

Alternatives considered:

- **Alt B — `RequestContext` as the message body.** Camel-idiomatic; processors get it via `@Body`. Cons: the original CDC event body is what arrives off Kafka — replacing it with `RequestContext` means downstream tools that expect the raw envelope (e.g. for replay) need an unwrap step; also breaks the "body == payload, properties == metadata" convention.
- **Alt C — `@RequestScoped` CDI bean injected into each processor.** Zero exchange state; processors share context via DI. Cons: Camel's threading model does not always honour CDI request scope cleanly across `direct:` boundaries; adds a propagation gotcha for marginal payoff.

### L1 (inherited from Phase 0) — Camel-Quarkus runtime

This phase puts real routes inside the Quarkus container for the first time. The runtime choice was settled in Phase 0; Phase 3 just exercises it.

### L14 (inherited from Phase 0) — Token lifecycle decoupled

`GiteaTokenProvider` is now used in anger; the mtime-watch contract is exercised end-to-end for the first time. The consumer must tolerate startup-without-token (token created by `gitea-init.sh` after pod start) and pick up token rotations via the mtime watch.

## 5. Deliverables

- `gdfkube-src/camel/src/main/resources/routes/cdc-consumer.camel.yaml` — the slim route file.
- `gdfkube-src/camel/src/main/java/io/gdfkube/camel/`:
  - `RequestContext.java`
  - `CdcEnvelopeParser.java`
  - `ResourceNameResolver.java` (cluster-request branch only — others throw `UnsupportedOperationException`)
  - `ValuesBuilder.java`
  - `HelmRenderer.java`
  - `GitWriter.java`
  - `GuidDeriver.java` (with `static String derive(String requestId)`)
- `gdfkube-src/camel/src/test/java/...` — unit tests for `GuidDeriver`, `ValuesBuilder`, `ResourceNameResolver`.
- `gdfkube-src/camel/src/test/java/...` — Camel route test using the Camel test framework with mocked Gitea + Git.
- `tests/e2e/form-to-gitea.test.ts` — full-pipeline test: `POST /api/requests` → wait → assert Gitea contents.
- `Taskfile.yaml` adds `camel:logs`, `camel:rebuild`, `e2e:cluster-request`.

## 6. Working-project demo

```
$ task dev:up

$ curl -fsS -XPOST http://localhost:8080/api/requests \
    -H 'content-type: application/json' \
    --data @gdfkube-src/tests/fixtures/cdc/cluster-request.json
{"requestId":"01HQ3K5M7N8P9Q0R1S2T3U4V5W","status":"submitted"}

# Wait for the consumer to render + commit
$ task gitea:show -- gdfkube-src/orgs/saude/clusters/vacinacao
HEAD: a4b1c8e
files:
  managedcluster.yaml
  klusterletaddonconfig.yaml
  hostedcluster.yaml
  nodepool.yaml

# Re-deliver the same event by replaying the Kafka offset → no-op
$ task kafka:rewind -- dbz.gdfkube.requests.cluster-request 1
$ sleep 5
$ task gitea:show -- gdfkube-src/orgs/saude/clusters/vacinacao
HEAD: a4b1c8e   # unchanged
```

## 7. Acceptance criteria (gate to Phase 4)

- [ ] `tests/e2e/form-to-gitea.test.ts` passes (form submission → Gitea commit).
- [ ] Re-delivery test: rewinding Kafka by 1 offset on `cluster-request` produces an empty `git diff --cached` and no new commit.
- [ ] `GuidDeriver.derive("01HQ...")` returns the same 4 hex chars on every JVM start (unit-tested).
- [ ] No `exec:git` invocations in any route YAML (L4 closed for the slice we ship).
- [ ] Camel route YAML for `cdc-consumer.camel.yaml` is ≤80 lines.
- [ ] Posting a `namespace-request` / `scale-request` produces a CDC event but the consumer logs `not-yet-implemented` and the event is committed back to Kafka offset (intentional partial coverage; Phase 4 will close it).

## 8. Test plan

| Test                       | Type        | How                                                                                      |
| -------------------------- | ----------- | ---------------------------------------------------------------------------------------- |
| GUID determinism           | Unit        | `GuidDeriver.derive(id) == GuidDeriver.derive(id)` for fixed `id`                        |
| ValuesBuilder shape        | Unit        | Snapshot of the produced `values.yaml` for a known fixture                               |
| ResourceNameResolver       | Unit        | `cluster-request → "vacinacao"` for a fixture; other form types throw                    |
| Route — create             | Component   | Camel test: feed envelope → assert `GitWriter` was called with expected paths            |
| Route — update (re-render) | Component   | Same as above with `op=u` and changed vars; commit happens                                |
| Route — idempotent re-deliver | Component | Same envelope twice → second call produces empty diff (`GitWriter.commit` returns false) |
| E2E happy path             | Integration | `task e2e:cluster-request`                                                               |

## 9. Risks and on-hold items

- L9 (the v1 `templateFieldIdentifier` indirection) remains held — Phase 3 deliberately hard-codes the cluster-request resolver. Phase 4 will reassess whether a small per-formId Java switch suffices or whether a registry is needed.
- The runtime schema-fetch indirection (v1's plan: `GET /api/schema/{formId}` per event) remains held — Phase 3 doesn't fetch from the Node app at all. If Phase 4 still doesn't need it, the indirection is retired entirely.
- L11 (templates outlive the renderer) — still held; Phase 5 decides whether ArgoCD-side rendering removes the problem.
- Topic-pattern vs per-route subscription is deferred to Phase 4. This phase uses a fixed single topic.

## 10. References

- [Apache Camel-Quarkus](https://camel.apache.org/camel-quarkus/) — runtime
- [JGit](https://www.eclipse.org/jgit/) — Git API used by `GitWriter` (clone, add, commit, push, fetch+rebase)
- [Camel test framework](https://camel.apache.org/components/4.4.x/others/test.html) — route-level tests with mocked endpoints
- [Camel Kafka component](https://camel.apache.org/components/4.4.x/kafka-component.html) — `topicIsPattern` and offset semantics
- [Helm CLI `template`](https://helm.sh/docs/helm/helm_template/) — the renderer Phase 3 shells out to
