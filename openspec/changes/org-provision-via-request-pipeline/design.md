## Context

The provisioning pipeline is event-driven: MongoDB → Debezium (CDC) → Kafka → Camel → Gitea → ArgoCD. Two Camel consumers exist today:

- `RequestRouterRoute` consumes `dbz.gdfkube.requests`, **gated on `status == "provisioning"`** (a real approval), then runs `helm-render → git-push → repo-bootstrap` and pushes per-request workloads to `gdfkube-{org}/clusters/{release}/`.
- `OrgBootstrapRoute` consumes `dbz.gdfkube.groups` and, with **no intent gate** (accepts every op except delete), creates the per-org repo `gdfkube-{org}`, the central `gdfkube-orgs` repo, and renders `orgs/{org}/{appproject,applicationset,{org}-clusterset}.yaml` from the `argocd-org` + `rhacm-org` charts.

Debezium runs `snapshot.mode: "initial"` over `gdfkube.groups`, so the 7 seeded demo groups are replayed as `op=r` events at startup and `OrgBootstrapRoute` provisions all of them at once. The demo ArgoCD discovery ApplicationSet (`platform/manifests/argocd-demo/org-repos-discovery.yaml`) then tries to sync every `orgs/*`, including orgs with no real workloads — producing broken/incomplete syncs during bootstrap.

The per-org scaffolding in `gdfkube-orgs/orgs/{org}/` is what makes ArgoCD discover an org's workloads (the per-org ApplicationSet watches `gdfkube-{org}/clusters/*`). It is produced **only** by `OrgBootstrapRoute` — the request pipeline never creates it. So the scaffolding step must move into the request pipeline rather than simply be suppressed.

## Goals / Non-Goals

**Goals:**
- Org repos and `orgs/{org}/` scaffolding are created **only** when an ITSM request is provisioned.
- Deploy-time bootstrap creates no org repos or scaffolding; ArgoCD bootstraps cleanly.
- Idempotent: repeated provisioning for the same org is a noop.
- Reuse existing logic/collaborators; no new dependencies; no drift left behind.

**Non-Goals:**
- Changing MongoDB group seeding (the SPA still reads `/api/itsm/groups`).
- Changing the request approval flow, form schemas, or per-request workload rendering.
- Changing the demo ArgoCD discovery ApplicationSet or chart templates.

## Decisions

**D1 — Re-point the existing `org-bootstrap` route's source (don't extract a bean, don't add a route).** The request pipeline is already composed of `direct:` sub-routes (`helm-render`, `git-push`, `repo-bootstrap`, `status-emitter`). Change `OrgBootstrapRoute`'s `from("kafka:dbz.gdfkube.groups")` to `from("direct:org-bootstrap")` and have it read the org id from an exchange property instead of parsing a group CDC body. All existing machinery — per-repo `ReentrantLock`, file-existence idempotency check, dedup cache keyed by org id, `Clock`-driven TTL, `onCompletion` temp-dir cleanup, helm render via `HelmTemplateRunner`/`HelmValuesBuilder.buildForOrg`, `buildClusterSetContent`/`findRenderedFile` — is retained unchanged. The op-header filtering (`c`/`r`/`u`/`d`) is removed because the caller (the request pipeline) only invokes it for a real provisioning. *Alternatives:* extract a `OrgBootstrapper` bean and delete the route (more churn — invalidates the route topology and the `org-bootstrap-test-determinism` test machinery); keep the Kafka source and filter `op=r` (rejected: seeded orgs would never get scaffolding — Option B in brainstorm). The `direct:` sub-route is idiomatic here and minimizes blast radius.

**D2 — Invoke from `repo-bootstrap`.** `RepoBootstrapRoute` already ensures the per-org repo `gdfkube-{org}` from `event.requesterGroupName`; after that, set the org id as an exchange property and `.to("direct:org-bootstrap")`. This runs **before** `git-push` writes workloads, guaranteeing ArgoCD can discover `clusters/{release}/`. `repo-bootstrap` is already the "ensure the org's git surface exists" step, so org scaffolding belongs there.

**D3 — Remove the groups CDC source.** Drop `gdfkube.groups` from Debezium `collection.include.list` (both `debezium/connector-config.json` and `init-jobs/configmaps.yaml`), remove the `groups` pre-image enable, remove the `dbz.gdfkube.groups` topic creation (kafka-init script + configmaps + catalog), and update `debezium/README.md`. MongoDB group **seeding** is retained (the ITSM SPA reads `/api/itsm/groups`).

**D4 — Failure handling and DLQ topic.** `org-bootstrap` keeps its own `deadLetterChannel("kafka:dlq.gdfkube.groups")` and the existing `dlq-handler` (multi-pattern `dlq.gdfkube.*`) continues to persist it. The DLQ topic name `dlq.gdfkube.groups` is retained as-is to avoid rippling a cosmetic rename through the kafka-init script, configmaps, and three specs — a deliberate simplicity/blast-radius trade-off; only the now-unused `dbz.gdfkube.groups` source topic is removed.

## Risks / Trade-offs

- **First-request latency** for an org now includes scaffolding render+push. → Idempotent file-existence check means only the first provisioned request per org pays it; subsequent requests are noops.
- **Kafka consumer group rebalance**: `gdfkube-camel` drops the `dbz.gdfkube.groups` subscription. → No data loss — groups CDC fed only `OrgBootstrapRoute`; the topics are removed in the same change. On an existing cluster, the stale topics/connector offsets can be left to age out or be pruned by the init jobs re-applying config.
- **Removing topics on a live cluster**: removing `dbz.gdfkube.groups` from the connector means Debezium stops capturing groups. → Acceptable; nothing consumes it. Verify no other route/consumer references the topic before merge.
- **Concurrent provisioning of the same org**: two requests racing on scaffolding. → Existing per-repo `ReentrantLock` on `gdfkube-orgs` plus the missing-file check serialize and de-duplicate writes.

## Migration Plan

1. Land the Camel change (re-point `org-bootstrap` to `direct:`, wire `repo-bootstrap` → `direct:org-bootstrap`) and the Debezium/topic config edits together so source and generated manifests stay in sync (no drift).
2. Deploy: init jobs re-apply Debezium connector config (groups dropped) and topic set; `gdfkube-camel` redeploys without the groups consumer.
3. Verify clean bootstrap (no org repos / no `orgs/*`), then submit+approve a request and confirm the org's scaffolding + workloads appear and ArgoCD syncs cleanly.
4. **Rollback**: revert the change set; re-adding `gdfkube.groups` to the connector + topics restores the prior (broken-at-bootstrap) behavior. No data migration is required either direction.

## Open Questions

- Coordinate sequencing with the active `run-verification-gates-on-auto-provision` change, which also touches the auto-provision path. Confirm no overlapping edits to `RepoBootstrapRoute`/`git-push` before implementing.
