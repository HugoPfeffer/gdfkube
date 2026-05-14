## Context

The Camel pipeline today reacts only to *request* (form-submission) events on `dbz.gdfkube.requests`. There is no path that reacts to **group lifecycle** events. As a result, the existing `argocd-org` and `rhacm-org` Helm charts (under `gdfkube-src/gdfkube-infra/charts/infra/`) are orphans — they were authored for a hypothetical `org-onboard` form that never shipped.

After the previous change (`remove-deadcode-group-admin-controls`) removed the manual UI toggles for ManagedClusterSet binding and Auto-provision, the SPA's `NewGroupPage` "Resources that will be created" preview still describes four artifacts (`Keycloak group / AppProject / ManagedClusterSetBinding / Git repo`) that nothing in the system actually produces. This change closes that backend gap by triggering the orphaned charts off group-collection CDC events.

Source files that frame the design:
- `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/RequestRouterRoute.java` — current pattern for `kafka:dbz.gdfkube.*` consumption with manual offset commit, dedup cache, and DLQ wiring.
- `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/RepoBootstrapRoute.java` — current `gitProvider.repoExists` + `createRepo` idempotent pattern.
- `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/HelmRenderRoute.java` — current `helm template …` ProcessBuilder invocation against `/opt/charts/{chartRef}`.
- `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/GitPushRoute.java` — per-repo `ReentrantLock` pattern around clone/commit/push.
- `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/bean/HelmValuesBuilder.java` — `build(RequestEvent)` writes meta/vars/system YAML.
- `gdfkube-src/gdfkube-infra/debezium/connector-config.json` — `collection.include.list` currently `gdfkube.requests,gdfkube.forms`.
- `gdfkube-src/gdfkube-infra/mongodb/init-camel-collections.js` — owns change-stream pre-image enablement.
- `gdfkube-src/gdfkube-infra/charts/infra/argocd-org/` and `infra/rhacm-org/` — the orphan charts to wire up.

## Goals / Non-Goals

**Goals:**
- New Camel route `OrgBootstrapRoute` consuming `dbz.gdfkube.groups`, idempotently producing the per-org repo + the four target files under `orgs/<groupId>/` in the central `gdfkube-orgs` Gitea repo.
- Add `gdfkube.groups` to the Debezium connector's `collection.include.list`.
- Enable change-stream pre-image on `gdfkube.groups` in `init-camel-collections.js` (if not already).
- Extract `GitRepoBootstrapper` (from `RepoBootstrapRoute`) and `HelmTemplateRunner` (from `HelmRenderRoute`) so both pipelines share the logic without duplication.
- Add `HelmValuesBuilder.buildForOrg(groupId, groupRepo)` alongside the existing `build(RequestEvent)`.
- Wire DLQ via the new topic `dlq.gdfkube.groups`, consumed by the existing `DlqHandlerRoute`'s `dlq.gdfkube.*` subscription (no edit to that route).
- New integration test class mirroring `PipelineIntegrationTest` for first-time bootstrap, idempotent replay, partial-state self-heal, dedup-cache replay suppression, helm-render failure → DLQ, and `op=d` drop.

**Non-Goals:**
- ArgoCD root manifest watching `gdfkube-orgs` (demo-bootstrap scope — separate change).
- `org-onboard` form definition (parallel form-driven entry point — not foreclosed but not in this change).
- Group **deletion** decommissioning (no rip-down of `gdfkube-{id}` and `orgs/<id>/`).
- Frontend changes — the previous change already aligned the UI; this change is the backend half.
- Modifying any file under `gdfkube-src/gdfkube-infra/kafka/**` — preserves `camel-orchestrator-stack`'s existing capability boundary.

## Decisions

**D1. Group events are a separate route, not a branch on `request-router`.**
`RequestRouterRoute` filters on `status` transitions specific to the request stage machine. Group documents have no `status` field. Co-locating them would force an early dispatch on document shape, which is exactly what separate routes are for. Keeps each route's filter predicate focused.

**D2. Idempotency = git-file-exists at the destination, not k8s reads.**
Plain GitOps. Adds zero new client libraries to Camel, no service-account configuration, no live-cluster coupling. Manual edits in `gdfkube-orgs` are preserved. Partial provisioning (e.g. AppProject committed but ClusterSet missing because of a prior crash) self-heals on the next group event. The trade-off — Camel cannot detect manifests that exist in Git but were never applied to the cluster — is acceptable because `argocd-org`'s ApplicationSet itself watches the same Git path and ArgoCD reports drift.

**D3. Render both charts even when only one file is missing.**
Helm render is cheap. Always rendering both into a single `outputDir` and then copying only the missing files keeps the route logic simple. The alternative (chart-aware "render only the chart that owns the missing file") would couple `OrgBootstrapRoute` to chart internals.

**D4. Resource names stay bare `<groupId>`; the `-clusterset` suffix is filename-only.**
Inherited from the previous change. `metadata.name` for ManagedClusterSet, ManagedClusterSetBinding, and AppProject = `<groupId>`. The `<groupId>-clusterset.yaml` filename only disambiguates the multi-doc ClusterSet+Binding manifest from the AppProject manifest sitting next to it.

**D5. Concatenate `rhacm-org`'s two template outputs into one file.**
`rhacm-org` renders ClusterSet and Binding as separate templates; we concatenate them with a `---` separator into `<groupId>-clusterset.yaml` to match the user's filename convention. Done with `Files.readAllBytes` + concat + write inline in the route — trivially simple, kept inline rather than abstracted.

**D6. Extract beans (`GitRepoBootstrapper`, `HelmTemplateRunner`); modify `HelmValuesBuilder` in place.**
Per CLAUDE.md "prefer modifying existing functions/services over creating new ones". The two extractions are mechanical refactors that pull out the *exact* code the new route needs. `HelmValuesBuilder.build(RequestEvent)` stays untouched; the new `buildForOrg(groupId, groupRepo)` lives next to it. This avoids a parallel `OrgValuesBuilder`.

**D7. Route count grows from 8 to 9; update the spec table accordingly.**
`camel-orchestrator-stack` requirement "Eight Camel routes SHALL be defined per the topology" must be modified to "Nine Camel routes …" with the new row appended. Renaming to "N routes" would invite spec edits every time the count changes; keeping the explicit number matches the existing style of that requirement.

**D8. DLQ piggy-backs on the existing `DlqHandlerRoute` pattern.**
`DlqHandlerRoute` already subscribes to `dlq.gdfkube.*`, so emitting on `dlq.gdfkube.groups` requires no edit there. The 9 mandatory DLQ headers per `kafka-broker-stack` are stamped by `OrgBootstrapRoute`'s `errorHandler(deadLetterChannel(...))`.

**D9. No `status-emitter`, no `stageUpdater`.**
Group events have no request stage; the timeline UI is per-request. Avoid emitting non-meaningful stage events.

**D10. Dedup cache is route-local, not shared.**
The 60s in-memory cache in `RequestRouterRoute` is keyed on requestId; reusing the same cache instance across routes would mix keyspaces. Each route gets its own cache keyed on the document's `_id`. Same TTL (60s) for consistency.

**D11. Configuration: zero new keys.**
All required values (`app.system.gitea-owner`, `app.system.gitea-external-url`, Mongo-stored Gitea PAT, `/opt/charts/{argocd-org,rhacm-org}` mount) already exist for the request pipeline.

## Risks / Trade-offs

[Replay storm on first deploy snapshots all existing groups → triggers a flurry of bootstraps] → **Mitigation**: Idempotent file-exists check absorbs replays of already-bootstrapped groups (audit emit `noop`). The 60s dedup cache absorbs Debezium retries within the window. For a never-before-bootstrapped batch of N groups, expect N first-time renders — bounded and one-shot.

[Helm chart drift between in-cluster manifests and `<groupId>-clusterset.yaml` (Camel never overwrites)] → **Mitigation**: ArgoCD's ApplicationSet watching `orgs/<groupId>/` reports drift normally. The trade-off (Camel does not force-resync) is the explicit design choice that keeps manual ops edits sticky.

[Helm render shells out to a subprocess; failure surface includes missing `/opt/charts/*` mount] → **Mitigation**: Existing healthcheck in `camel-orchestrator-stack` already requires the mount to be present for the request pipeline; if missing, the request pipeline also fails. New IT case `helmRenderFailure_dlq` covers the runtime failure path.

[Bean extraction risk: refactoring `RepoBootstrapRoute` and `HelmRenderRoute` could regress the request pipeline] → **Mitigation**: The existing `PipelineIntegrationTest` suite — including `goldenPath_existingRepoIsNotRecreated` — exercises both. Refactor passes the same tests. Both extractions are pure code moves; no behavior delta is intended.

[New route grows the Kafka consumer-group commit budget by ~1 commit per group event] → **Mitigation**: Group events are rare (admin-driven, not user-driven). Throughput delta is negligible compared to request traffic.

## Migration Plan

1. **Mongo**: Update `init-camel-collections.js` to enable change-stream pre-image on `groups` (idempotent on re-run). The `mongo-collections-init` Compose service re-runs on next stack up.
2. **Debezium**: Update `connector-config.json` adding `gdfkube.groups` to `collection.include.list`. The existing `register-connector.sh` PUTs the new config; Debezium snapshots the new collection on next reconnect.
3. **Camel code**: Land the bean extractions and new route in one PR. Existing `PipelineIntegrationTest` continues to pass; new `OrgBootstrapIntegrationTest` covers the new route.
4. **Helm chart access**: Confirm `/opt/charts/argocd-org` and `/opt/charts/rhacm-org` are present in the Camel container (they live under `gdfkube-src/gdfkube-infra/charts/infra/` which is bind-mounted at `/opt/charts:ro` per `camel-orchestrator-stack`).
5. **Stack restart**: `docker compose up -d gdfkube-debezium-init gdfkube-camel`. The connector picks up the new collection; the new route registers.
6. **Verification**: Create a group "Cultura" from the SPA; within seconds expect `gdfkube-cultura` and `gdfkube-orgs` repos in Gitea, the four files at `orgs/cultura/`, and audit log entries.

**Rollback**: `git revert` the merge commit. Re-run `register-connector.sh` to restore the old `collection.include.list`. The `gdfkube-cultura` and `gdfkube-orgs` repos and any committed manifests can stay (idempotency tolerates them); deleting them is optional cleanup.

## Open Questions

None — the prior plan-mode session resolved every open thread.
