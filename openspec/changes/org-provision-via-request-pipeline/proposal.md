## Why

During platform bootstrap, ArgoCD tries to sync broken/incomplete org manifests. The deploy-time seed of the `groups` collection is replayed by Debezium's `initial` snapshot onto `dbz.gdfkube.groups`, and `OrgBootstrapRoute` — which has no intent gate — provisions per-org repos and `gdfkube-orgs/orgs/*` scaffolding for all 7 demo orgs at once. ArgoCD's discovery ApplicationSet then fails to sync orgs that have no real workloads. Fixing it now restores the intended behavior: org infrastructure is created only when a real request flows through the ITSM app.

## What Changes

**Org-scaffolding trigger**
- From: `org-bootstrap` route consumes `kafka:dbz.gdfkube.groups` and creates org repos + `gdfkube-orgs/orgs/{org}/` scaffolding for every existing/seeded group (including Debezium snapshot `op=r` events) at deploy time.
- To: The `org-bootstrap` route is re-pointed to `from("direct:org-bootstrap")` and invoked by the request pipeline's `repo-bootstrap` step, keyed by the provisioned request's `requesterGroupName`, before workloads are pushed. All its idempotency/dedup/Clock/cleanup/DLQ machinery is retained.
- Reason: Deploy-time fan-out makes ArgoCD attempt broken org deploys during bootstrap.
- Impact: Non-breaking for the ITSM SPA; changes when/how org scaffolding gets created. `org-bootstrap` is no longer a Kafka consumer.

**Groups CDC**
- From: Debezium captures `gdfkube.groups` → topic `dbz.gdfkube.groups`; pre-image enabled for `groups`.
- To: `gdfkube.groups` removed from `collection.include.list`; the `dbz.gdfkube.groups` topic and the `groups` pre-image enable are removed. MongoDB group **seeding** is unchanged (the SPA reads `/api/itsm/groups`). The `dlq.gdfkube.groups` topic is retained as `org-bootstrap`'s DLQ.
- Reason: The groups CDC source now feeds nothing; removing it eliminates the deploy-time trigger at its source.
- Impact: Non-breaking; no consumer of groups CDC remains.

## Capabilities

### New Capabilities
- `org-provisioning-trigger`: When (and only when) an ITSM request is provisioned, the per-org Gitea repo and the `gdfkube-orgs/orgs/{org}/` ArgoCD scaffolding are created idempotently; deploy-time seeding never creates org repos or scaffolding.

### Modified Capabilities
- `camel-orchestrator-stack`: `org-bootstrap` route is sourced from `direct:org-bootstrap` (invoked by `repo-bootstrap`) instead of `kafka:dbz.gdfkube.groups`, keyed by `requesterGroupName`.
- `debezium-connect-stack`: connector no longer captures `gdfkube.groups`.
- `kafka-broker-stack`: the `dbz.gdfkube.groups` topic is removed from the catalog.
- `org-bootstrap-test-determinism`: the route's source/test harness changes from a Kafka consumer to a `direct:` sub-route invocation.

## Impact

- **Camel** (`gdfkube-camel`): `OrgBootstrapRoute` source `kafka:dbz.gdfkube.groups` → `direct:org-bootstrap`, reads org id from an exchange property, op-header filtering removed; `RepoBootstrapRoute` sets the org id and calls `direct:org-bootstrap` before `git-push`. Dedup/Clock/cleanup/DLQ unchanged.
- **Kafka topics**: `dbz.gdfkube.groups` removed (10 catalog topics). `dlq.gdfkube.groups` retained as `org-bootstrap`'s DLQ; consumer group `gdfkube-camel` no longer subscribes to the groups source topic.
- **Debezium**: `connector-config.json` and `init-jobs/configmaps.yaml` drop `gdfkube.groups` from `collection.include.list`, the `groups` pre-image enable, and the `dbz.gdfkube.groups` topic; `debezium/README.md` updated.
- **MongoDB**: no schema change; group seeding retained.
- **No dependency/version changes.**
- **Testing**: `OrgBootstrapIntegrationTest` drives `direct:org-bootstrap` with an org-id property; add a `PipelineIntegrationTest` assertion that provisioning a request creates `orgs/{org}/` scaffolding; confirm no Kafka groups consumer remains.
