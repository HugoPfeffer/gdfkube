## MODIFIED Requirements

### Requirement: Nine Camel routes SHALL be defined per the topology

The Camel app MUST define exactly 9 routes:

| Route | Source | Sink |
|---|---|---|
| `request-router` | `kafka:dbz.gdfkube.requests` | direct routes to `helm-render` |
| `helm-render` | direct from `request-router` | direct to `git-push` |
| `git-push` | direct from `helm-render` | direct to `repo-bootstrap` on 404 |
| `repo-bootstrap` | direct from `git-push` on 404 | re-enters `git-push`; also invokes `direct:org-bootstrap` |
| `status-emitter` | direct/Camel SEDA invoked at pipeline entry | `kafka:gdfkube.pipeline.status` + `mongodb:requests` (stage write-back) |
| `audit-sink` | `kafka:gdfkube.audit` (group `gdfkube-camel`) | `mongodb:audit_log` |
| `config-reload` | `kafka:dbz.gdfkube.forms` (group `gdfkube-camel`) | `bean:FormDefCache#refresh` |
| `dlq-handler` | `kafka:dlq.gdfkube.*` (multi-pattern, group `gdfkube-camel`) | `mongodb:dlq_log` |
| `org-bootstrap` | `direct:org-bootstrap` (invoked by `repo-bootstrap`) | git push to central `gdfkube-orgs` repo + `kafka:gdfkube.audit` |

All Kafka consumers MUST use group `gdfkube-camel` and MUST set `enable.auto.commit=false`. Pipeline Kafka consumers (`request-router`, `config-reload`, `dlq-handler`) MUST set `auto.offset.reset=earliest`. `kafkaManualCommit.commitSync()` MUST be invoked only after the unit of work completes successfully. The `org-bootstrap` route is no longer a Kafka consumer; it is an in-JVM `direct:` sub-route of the request pipeline.

#### Scenario: All 9 routes register on startup

- **GIVEN** the Camel app starts cleanly
- **WHEN** `curl http://gdfkube-camel:8080/q/camel/routes` is queried
- **THEN** the response SHALL list exactly the 9 route IDs: `request-router`, `helm-render`, `git-push`, `repo-bootstrap`, `status-emitter`, `audit-sink`, `config-reload`, `dlq-handler`, `org-bootstrap`
- **AND** every route SHALL be in state `Started`

---

## RENAMED Requirements

- FROM: `### Requirement: org-bootstrap SHALL idempotently provision per-org GitOps content from group events`
- TO: `### Requirement: org-bootstrap SHALL idempotently provision per-org GitOps content from the request pipeline`

---

## MODIFIED Requirements

### Requirement: org-bootstrap SHALL idempotently provision per-org GitOps content from the request pipeline

The `org-bootstrap` route MUST consume `direct:org-bootstrap`, invoked by `repo-bootstrap` during request provisioning. The org identifier MUST be read from the exchange (the `org` property set by `repo-bootstrap` from `requestEvent.requesterGroupName`); the route MUST NOT parse a group CDC document and MUST NOT apply `op`-based filtering (the caller only invokes it for a real provisioning).

The route MUST apply a 60-second in-memory dedup cache keyed on the org id to absorb repeat invocations across requests. The dedup cache MUST be populated **only after** a successful `gitProvider.commitAndPush(...)`; a failed exchange MUST leave the cache untouched so the next invocation is not suppressed.

The route MUST register an `.onCompletion()` handler that deletes the per-exchange `outputDir` tree (walking in reverse order, mirroring `HelmRenderRoute`). The handler MUST read `outputDir` from an exchange property set during processing, and MUST be tolerant of `outputDir == null`.

For each invocation the route MUST:

1. Take `org` from the exchange property. The canonical repo name comes from `helmValuesBuilder.getRepoName(org)`.
2. Ensure the per-org Gitea repo `gdfkube-{org}` exists via `GitRepoBootstrapper.ensure(owner, repoName, description)` (idempotent skip-if-exists; emits `create-repo` audit on creation).
3. Ensure the central Gitea repo `gdfkube-orgs` exists via the same bean (idempotent; emits `create-repo` audit on creation).
4. Acquire a per-repo `ReentrantLock` for `gdfkube-orgs`, then clone or pull it.
5. Compute the three target paths under `<workTree>/orgs/<org>/`: `appproject.yaml`, `applicationset.yaml`, `<org>-clusterset.yaml`.
6. If all target paths exist on disk, emit a `noop` audit event and return WITHOUT rendering or pushing.
7. Otherwise, allocate a per-exchange scratch directory via `Files.createTempDirectory("bootstrap-" + org + "-")` and store its path as the `outputDir` exchange property. Render `argocd-org` and `rhacm-org` charts via `HelmTemplateRunner.render(chartRef, releaseName, valuesPath, outputDir)` using values from `HelmValuesBuilder.buildForOrg(org)`. Concatenate the two `rhacm-org` outputs into a single multi-doc YAML separated by `---` and write as `<org>-clusterset.yaml`.
8. Copy ONLY the missing files into `<workTree>/orgs/<org>/`. Files already present MUST NOT be overwritten.
9. Commit and push with author `gdfkube-camel <camel@gdfkube.gov.br>` and message `[gdfkube] GROUP-{org}: bootstrap org manifests`.
10. Populate `dedupCache[org]` immediately after the successful push and **before** the audit emit.
11. Emit a `bootstrap` audit event with the list of files added.

The route MUST NOT invoke `status-emitter` and MUST NOT call `stageUpdater`. On exception during steps 2-11 the route MUST publish to `dlq.gdfkube.groups` per the standard error-handling requirement; the existing `dlq-handler` route already consumes `dlq.gdfkube.*` and persists the message. The `.onCompletion()` cleanup MUST run on both success and exception paths.

#### Scenario: First invocation bootstraps both repos and writes all three files

- **GIVEN** `repo-bootstrap` invokes `direct:org-bootstrap` with `org = cultura` and Gitea has neither `gdfkube-cultura` nor `gdfkube-orgs`
- **WHEN** the route runs
- **THEN** `gdfkube-cultura` SHALL be created in Gitea
- **AND** `gdfkube-orgs` SHALL be created in Gitea
- **AND** a single commit on `gdfkube-orgs` SHALL contain exactly three files: `orgs/cultura/appproject.yaml`, `orgs/cultura/applicationset.yaml`, `orgs/cultura/cultura-clusterset.yaml`
- **AND** the commit message SHALL match `[gdfkube] GROUP-cultura: bootstrap org manifests`

#### Scenario: Repeat invocation for an already-bootstrapped org is a noop

- **GIVEN** all three target files for `cultura` exist in `gdfkube-orgs`
- **WHEN** `direct:org-bootstrap` is invoked again with `org = cultura`
- **THEN** no second commit SHALL be produced on `gdfkube-orgs`
- **AND** an audit event with verb `noop` SHALL be emitted

#### Scenario: Partial state self-heals on next invocation

- **GIVEN** `gdfkube-orgs` already contains `orgs/cultura/appproject.yaml` only
- **WHEN** `direct:org-bootstrap` is invoked with `org = cultura`
- **THEN** the resulting commit SHALL contain exactly `orgs/cultura/applicationset.yaml` and `orgs/cultura/cultura-clusterset.yaml`
- **AND** the existing `orgs/cultura/appproject.yaml` SHALL NOT be modified

#### Scenario: Repeat invocation within 60 seconds is suppressed by dedup cache

- **GIVEN** the route has just successfully processed `org = cultura`
- **WHEN** `direct:org-bootstrap` is invoked again for `cultura` within 60 seconds
- **THEN** exactly one commit SHALL exist on `gdfkube-orgs` for that org
- **AND** the second invocation SHALL be suppressed by the dedup cache

#### Scenario: helm render failure leaves the dedup cache empty

- **GIVEN** `HelmTemplateRunner.render(...)` throws on the first invocation for `org = cultura`
- **WHEN** a second invocation for `cultura` arrives after redeliveries are exhausted but within 60 seconds of the first
- **THEN** `dedupCache` SHALL NOT contain `cultura` after the failed exchange completes
- **AND** the second invocation SHALL be processed (not suppressed by the cache)

#### Scenario: outputDir scratch tree is cleaned up after every exchange

- **GIVEN** the route processes an invocation for `org = cultura` end-to-end
- **WHEN** the exchange completes (success path or after exception)
- **THEN** the per-exchange `bootstrap-cultura-*` directory under `java.io.tmpdir` SHALL no longer exist

#### Scenario: helm render failure flows to the DLQ

- **GIVEN** `HelmTemplateRunner.render(...)` throws on invocation
- **WHEN** an invocation for `org = cultura` is processed (after 3 redeliveries with 1s/5s/25s backoff)
- **THEN** the message SHALL land on `dlq.gdfkube.groups` with all 9 mandatory DLQ context headers
