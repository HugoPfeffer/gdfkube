## Why

After the previous change (`remove-deadcode-group-admin-controls`) removed the manual UI toggles for ManagedClusterSet binding and Auto-provision, the SPA's `NewGroupPage` preview still promises four artifacts that nothing in the system produces today — Camel only reacts to *request* events on `dbz.gdfkube.requests`, never to group lifecycle. The `argocd-org` and `rhacm-org` Helm charts have been orphans since they were authored. This change closes the backend gap: a new Camel route `OrgBootstrapRoute` reacts to MongoDB CDC events on `gdfkube.groups` and idempotently writes the per-org GitOps content the demo expects, finally wiring the orphaned charts to a real trigger.

## What Changes

**Debezium connector — `collection.include.list`**
- From: `gdfkube.requests,gdfkube.forms`
- To: `gdfkube.requests,gdfkube.forms,gdfkube.groups`
- Reason: New trigger source for group lifecycle events.
- Impact: Non-breaking; additive collection. Existing topics and consumer groups unchanged. New topic `dbz.gdfkube.groups`.

**MongoDB pre-image — `init-camel-collections.js`**
- From: pre-image enabled on `requests` and `forms`.
- To: also enabled on `groups`.
- Reason: `OrgBootstrapRoute` reads the unwrapped post-image; the pre-image is required for `op=u` events to expose `before`/`after` consistently with the other CDC topics. Idempotent on re-run.
- Impact: Non-breaking; one-time `collMod` per cold start.

**New Camel route `OrgBootstrapRoute`**
- Source: `kafka:dbz.gdfkube.groups?groupId=gdfkube-camel&autoOffsetReset=earliest&autoCommitEnable=false&allowManualCommit=true`.
- Filter: accept `op ∈ {c, r, u}`; drop `op=d`. 60s in-memory dedup cache keyed on group `_id`.
- Side effects: ensure per-org repo `gdfkube-{groupId}` exists; ensure central `gdfkube-orgs` repo exists; clone/pull `gdfkube-orgs` under per-repo `ReentrantLock`; render `argocd-org` + `rhacm-org`; copy only missing files into `<workTree>/orgs/<groupId>/`; commit + push.
- DLQ: `dlq.gdfkube.groups` (consumed by the existing `DlqHandlerRoute`).
- Reason: Closes the gap between the SPA preview and what the platform actually provisions.
- Impact: Camel route count grows from 8 to 9; `camel-orchestrator-stack` table updates.

**Bean extractions (no behavior change)**
- From: `gitProvider.repoExists`/`createRepo` inline in `RepoBootstrapRoute`; `helm template …` ProcessBuilder inline in `HelmRenderRoute` as a private method.
- To: New beans `GitRepoBootstrapper` and `HelmTemplateRunner` containing the same logic; both routes refactored to delegate.
- Reason: Per CLAUDE.md "prefer modifying existing functions/services over creating new ones" — the new route reuses these without duplication.
- Impact: Pure refactor. Existing `PipelineIntegrationTest` continues to pass with no test edits.

**`HelmValuesBuilder.buildForOrg(...)` (additive method)**
- From: only `build(RequestEvent)` exists.
- To: also `buildForOrg(String groupId, String groupRepo)` writing `/tmp/{groupId}-bootstrap-values.yaml` with `meta`/`system.naming`/`system.labels` shaped for `argocd-org` and `rhacm-org`. New `getChartRef(String)` and `getReleaseName(String)` overloads. Promote `buildLabels` from private to package-visible.
- Reason: The two charts need the existing `meta`/`system` value shape; building on the existing bean preserves a single source of truth for naming/labels.
- Impact: Existing `RequestEvent`-based callers untouched.

**Rendered file layout in `gdfkube-orgs` working tree**
- New paths: `orgs/<groupId>/{appproject.yaml, applicationset.yaml, <groupId>-clusterset.yaml}`.
- The third file is multi-doc YAML (ManagedClusterSet `---` ManagedClusterSetBinding) — file-only suffix; in-cluster `metadata.name` stays bare `<groupId>` (inherited from the previous change).

**Tests**
- New: `OrgBootstrapIntegrationTest` with 7 cases: first-time bootstrap (4 files), idempotent replay noop, partial-state self-heal, existing per-org repo + central repo still bootstraps, `op=d` dropped, replay-within-TTL deduped, helm-render failure → DLQ.
- Existing: `PipelineIntegrationTest` continues to pass unchanged.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `camel-orchestrator-stack`: route count grows from 8 to 9 (new row for `OrgBootstrapRoute` consuming `dbz.gdfkube.groups`); add a new requirement covering `OrgBootstrapRoute`'s filter, idempotency strategy, DLQ wiring, and rendered file layout. The `helm-render` and `repo-bootstrap` requirements stay observably unchanged but their internals delegate to extracted beans.
- `debezium-connect-stack`: `collection.include.list` includes `gdfkube.groups`; the requirement currently titled "Connector SHALL emit CDC events from gdfkube.requests and gdfkube.forms" is renamed/extended to also cover `gdfkube.groups → dbz.gdfkube.groups`.

## Impact

**Affected files (created)**
- `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/OrgBootstrapRoute.java`
- `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/bean/GitRepoBootstrapper.java`
- `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/bean/HelmTemplateRunner.java`
- `gdfkube-src/gdfkube-camel/src/test/java/gov/gdf/camel/routes/OrgBootstrapIntegrationTest.java`

**Affected files (modified)**
- `gdfkube-src/gdfkube-infra/debezium/connector-config.json` — extend `collection.include.list`.
- `gdfkube-src/gdfkube-infra/mongodb/init-camel-collections.js` — enable pre-image on `groups`.
- `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/RepoBootstrapRoute.java` — delegate to `GitRepoBootstrapper`.
- `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/HelmRenderRoute.java` — delegate to `HelmTemplateRunner`.
- `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/bean/HelmValuesBuilder.java` — add `buildForOrg`, `getChartRef(String)`, `getReleaseName(String)`; promote `buildLabels` to package-visible.

**Backend / API / SPA**
- No SPA change. No Express server change. No `/api/itsm/groups` contract change. The SPA's existing POST/PATCH already produces the Mongo writes that Debezium will now capture.

**Kafka topics (new)**
- `dbz.gdfkube.groups` — produced by Debezium, consumed by `OrgBootstrapRoute` (group `gdfkube-camel`).
- `dlq.gdfkube.groups` — produced by `OrgBootstrapRoute`'s error handler, consumed by the existing `DlqHandlerRoute` (no edit).

**Kafka consumer groups (existing reused)**
- `gdfkube-camel` continues as the single consumer group for all pipeline routes. Adding a new topic is non-disruptive — Kafka rebalances assignment, no offset reset needed.

**Helm chart catalog**
- No new charts. `infra/argocd-org` and `infra/rhacm-org` (already present) become live consumers of values produced by `HelmValuesBuilder.buildForOrg`.

**Configuration**
- Zero new keys. Reuses `app.system.gitea-owner`, `app.system.gitea-external-url`, the Mongo-stored Gitea PAT, and the existing `/opt/charts:ro` chart mount.

**Dependencies**
- Zero new Maven dependencies. Camel already has `camel-quarkus-kafka`, `camel-quarkus-mongodb`, JGit, and the helm CLI in the runtime image.

**Testing strategy**
- Unit: existing `HelmValuesBuilderTest` extended for the `buildForOrg` overload (assertion on the values YAML shape).
- Integration: new `OrgBootstrapIntegrationTest` (7 cases) using the existing `MockProfile` (`app.git.provider=mock`) and `AdviceWith` to swap the Kafka source for a `seda:` source (mirrors `PipelineIntegrationTest`'s pattern).
- Packaged-artifact smoke: existing `AppStartupIT` automatically picks up the new route — must continue to register `Started` for all 9 routes.
- E2E: SPA "create group Cultura" against the devcontainer Gitea + Mongo; assert the four files appear in `gdfkube-orgs`, audit_log records the `bootstrap` event, and replay (edit + save) is a `noop`.

**Blast radius**
- Camel pipeline: new route + bean factor-out. Refactor risk in two existing routes mitigated by unchanged `PipelineIntegrationTest`.
- Debezium: one new collection captured. New topic created on first event.
- MongoDB: one `collMod` to enable pre-image on `groups`. Idempotent.
- ArgoCD: nothing in this change. The demo-bootstrap step that points ArgoCD at `gdfkube-orgs` is the explicit non-goal — without it, Camel's output sits in Gitea unconsumed by ArgoCD until the separate demo-bootstrap change lands.
