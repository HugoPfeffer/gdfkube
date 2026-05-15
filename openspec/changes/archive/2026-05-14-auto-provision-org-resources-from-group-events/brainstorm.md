## Design Summary

The previous change removed two non-functional UI controls from the ITSM admin Group pages on the understanding that ManagedClusterSet binding and per-org repo/AppProject provisioning would become **automatic via Camel routes** on group lifecycle events. This change closes that backend gap.

When a group is created (or updated) in the ITSM admin SPA, the existing MongoDB → Debezium → Kafka path emits a CDC event on a new topic `dbz.gdfkube.groups`. A new Camel route `OrgBootstrapRoute` consumes that topic and idempotently produces the org-bootstrap GitOps content the demo expects: the per-org Gitea repo `gdfkube-{groupId}`, plus an AppProject + ApplicationSet (from the existing `argocd-org` Helm chart) and a ManagedClusterSet + ManagedClusterSetBinding (from the existing `rhacm-org` Helm chart) under `orgs/<groupId>/` in the central `gdfkube-orgs` Gitea repo.

Two reusable beans are factored out so the new route does not duplicate logic that already exists in the request pipeline: `GitRepoBootstrapper` (extracted from `RepoBootstrapRoute`) and `HelmTemplateRunner` (extracted from `HelmRenderRoute`). `HelmValuesBuilder` gains a `buildForOrg(groupId, groupRepo)` method alongside the existing `build(RequestEvent)` — both code paths sit side-by-side per the project's "modify don't add" rule.

This plan is strictly **rendered-manifests scope**: Camel writes GitOps content into the ephemeral Gitea instance. The **demo-bootstrap scope** (the top-level ArgoCD Application/ApplicationSet that points the platform at `gdfkube-orgs`) is an explicit non-goal.

## Alternatives Considered

### Option A: Group-event-driven Camel route writing into central `gdfkube-orgs` repo (chosen)
- **Approach**: New `OrgBootstrapRoute` consuming `dbz.gdfkube.groups`. Idempotency via git-file-exists check at `<workTree>/orgs/<groupId>/` against three target paths. Two helm renders per first-time event; zero renders on idempotent replays. Reuses existing pipeline beans by extracting `GitRepoBootstrapper` and `HelmTemplateRunner`.
- **Pros**: Single source of truth for org provisioning (the Mongo `groups` collection — the same store the SPA already PATCHes). Self-healing on partial state. Pure GitOps idempotency — no k8s client added to Camel, no live-cluster reads. Reuses three existing infra: Debezium connector, Helm chart catalog, GitProvider/JGit + ReentrantLock pattern. Aligns with the previous change's preview text (`{id} → {id}` binding).
- **Cons**: Need to modify the Debezium connector config (additive, no breaking change) and bump the Camel "8 routes" spec count to 9.
- **Why chosen**: Smallest delta against the existing pipeline. Keeps the manual-form path (`org-onboard`) free to coexist later if needed. Zero new infra components, zero new credentials.

### Option B: Backend (Express) directly POSTs to Gitea on group create
- **Approach**: ITSM Express server calls Gitea REST + git push from inside the API handler.
- **Pros**: Synchronous; the user sees the repo created when the API returns.
- **Cons**: Couples the SPA's create-group request to network calls against Gitea, helm CLI, and JGit — none of which Express has today. Duplicates the GitProvider/JGit/Helm logic that already lives in Camel. Loses the audit/DLQ/redelivery wrapper Camel provides for free. Cannot self-heal from partial failures (request returns success or fails — no follow-up).
- **Why not chosen**: Wrong architectural seam. Camel exists precisely for this kind of side-effecting work. Putting it in Express would re-create the pipeline machinery in a worse place.

### Option C: Treat org bootstrap as a regular form submission via a new `org-onboard` form
- **Approach**: Define a new Form definition `org-onboard` that, when submitted, flows through the existing `request-router` → `helm-render` → `git-push` pipeline using the `argocd-org` and `rhacm-org` charts.
- **Pros**: Uses the existing pipeline unchanged.
- **Cons**: Decouples group existence (in `groups` collection) from org-bootstrap state — admins would have to remember to also submit a separate form. Doubles the data model: a "group" plus an "org-onboard request". Breaks the previous-change UX promise that creating a group is sufficient.
- **Why not chosen**: Adds friction and a coordination requirement that the SPA does not surface. The agreed UX is one-step group creation. (Note: this path remains *available* as a separate later change if a manual re-bootstrap is ever needed — it is not foreclosed.)

## Agreed Approach

Option A. Group-event-driven `OrgBootstrapRoute` consuming `dbz.gdfkube.groups`, writing into central `gdfkube-orgs` under `orgs/<groupId>/`, with bean extractions to share idempotent repo-create + helm-template logic with the existing request pipeline.

## Key Decisions

- **Trigger**: New Debezium collection on `gdfkube.groups`. The existing `unwrap` + `reroute` SMTs apply unchanged. New topic: `dbz.gdfkube.groups`.
- **Pre-image**: Enable change-stream pre-image on `gdfkube.groups` in `init-camel-collections.js` (the same script that owns it for `requests` and `forms`).
- **Filter**: Accept `op ∈ {c, r, u}`; drop `op=d` with a debug log (no decommission flow). Apply the same 60s in-memory dedup cache `RequestRouterRoute` already uses.
- **Resource naming**: ManagedClusterSet `metadata.name` = ManagedClusterSetBinding `metadata.name` = AppProject `metadata.name` = `<groupId>`. Binding `metadata.namespace` = `<groupId>`. (Inherited from the previous change — no new schema field on `Group`.)
- **Rendered file layout** under `orgs/<groupId>/`: `appproject.yaml`, `applicationset.yaml`, `<groupId>-clusterset.yaml`. The third file is multi-doc YAML concatenating the two `rhacm-org` template outputs (ClusterSet + Binding) — file-only `-clusterset` suffix; in-cluster names stay bare.
- **Idempotency**: git-file-exists check at the three target paths; render only when at least one is missing; copy only the missing files; no overwrite of manual edits in `gdfkube-orgs`. Per-org repo idempotency stays delegated to `gitProvider.repoExists` exactly as today.
- **Output repo**: central `gdfkube-orgs` Gitea repo (rendered-manifests scope, ephemeral Gitea); created on first event via `GitRepoBootstrapper.ensure(...)`.
- **Bean reuse**: extract `GitRepoBootstrapper` from `RepoBootstrapRoute` and `HelmTemplateRunner` from `HelmRenderRoute`; both refactored routes preserve observable behavior. `HelmValuesBuilder.buildForOrg(...)` is added alongside `build(RequestEvent)`.
- **Route count**: Camel pipeline grows from 8 routes to 9. The `camel-orchestrator-stack` spec table needs the new row; no other route is renamed or removed.
- **DLQ**: New topic `dlq.gdfkube.groups` consumed by the existing `DlqHandlerRoute` via its `dlq.gdfkube.*` multi-pattern subscription — no DLQ-handler edit required.
- **No `status-emitter` invocation**: group events have no request stage. No `stageUpdater` either.
- **Configuration**: zero new keys. Reuses `app.system.gitea-owner`, `app.system.gitea-external-url`, the existing Mongo-stored Gitea PAT, and the existing `/opt/charts/{argocd-org,rhacm-org}` mount.

## Open Questions

None — the prior plan-mode session resolved naming, idempotency strategy, output-repo scope, and the demo-bootstrap-vs-rendered-manifests boundary with the user.
