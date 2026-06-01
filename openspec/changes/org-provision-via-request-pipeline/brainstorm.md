## Design Summary

Org repositories and their ArgoCD scaffolding manifests must be created **only when a real ITSM request is provisioned**, not during platform bootstrap. Today, the deploy-time seed of the `groups` collection — replayed by Debezium's `initial` snapshot onto `dbz.gdfkube.groups` — drives `OrgBootstrapRoute` to create per-org repos and `gdfkube-orgs/orgs/*` scaffolding for all 7 demo orgs at once. ArgoCD's discovery ApplicationSet then tries to sync those empty/incomplete orgs and fails.

The agreed fix moves org-scaffolding creation into the request pipeline (`repo-bootstrap`), keyed by the request's `requesterGroupName`, and removes the `groups` CDC trigger entirely. Demo groups stay seeded in MongoDB because the ITSM SPA reads `/api/itsm/groups`; only the CDC-driven, deploy-time provisioning is removed.

## Alternatives Considered

### Option A: Trigger org bootstrap from the request pipeline
- **Approach**: Extract `OrgBootstrapRoute.processGroupEvent(...)` into a reusable `OrgBootstrapper` CDI bean; invoke it from `RepoBootstrapRoute` for `event.requesterGroupName`. Remove the `dbz.gdfkube.groups` consumer and drop `groups` from Debezium CDC.
- **Pros**: Org repos created exclusively via the request pipeline — matches the intended behavior. Idempotent (file-existence check + repo lock). Reuses all existing collaborators; no new external dependency. Eliminates the deploy-time fan-out at its source.
- **Cons**: Couples scaffolding creation to the first provisioned request for each org (slightly larger first-request latency). Requires refactoring a route into a bean and updating tests.
- **Why not chosen**: Chosen.

### Option B: Keep group-triggered, skip snapshot (`op=r`) events
- **Approach**: Leave `OrgBootstrapRoute` on the groups topic but ignore Debezium snapshot reads; only react to genuine runtime group inserts.
- **Pros**: Smallest code change; no pipeline refactor.
- **Cons**: The 7 pre-seeded demo orgs would have **no** scaffolding, so requests against them would never deploy (no new group insert happens on a request). Breaks the demo's primary path.
- **Why not chosen**: Leaves real requests with no scaffolding; does not restore the intended end-to-end flow.

### Option C: Gate group bootstrap on an "active/requested" flag
- **Approach**: Keep group-triggered, but only bootstrap orgs explicitly marked active by the ITSM request flow (a field on the group doc).
- **Pros**: Keeps a single bootstrap trigger; selective.
- **Cons**: Adds a new field + write path + CDC round-trip just to gate; more moving parts and more drift surface than invoking the logic directly from the request pipeline.
- **Why not chosen**: More complexity for the same outcome Option A achieves directly.

## Agreed Approach

**Option A.** Move org-scaffolding logic into a reusable `OrgBootstrapper` bean, invoke it from `repo-bootstrap` keyed by `requesterGroupName`, and remove the groups CDC trigger. Keep MongoDB group seeding for the SPA. This makes org repo + manifest creation happen exclusively through the ITSM request data pipeline and stops ArgoCD from syncing broken org manifests at bootstrap.

## Key Decisions

- Extract, don't duplicate: the scaffolding logic becomes a bean reused by the request pipeline (project value: change services over adding new ones; driftless).
- Scaffolding is ensured **before** workloads are pushed, so ArgoCD's per-org ApplicationSet can discover `clusters/{release}/`.
- Remove `gdfkube.groups` from Debezium `collection.include.list`, drop its pre-image enable and the `dbz.gdfkube.groups` / `dlq.gdfkube.groups` topics — groups CDC now feeds nothing.
- Failures during scaffolding flow to the existing `dlq.gdfkube.repo-bootstrap`.
- Idempotency comes from the existing file-existence check + per-repo `ReentrantLock`.

## Open Questions

- None blocking. Coordinate the proposal with the active `run-verification-gates-on-auto-provision` change, which touches the same auto-provision path. The OpenShift `targetRevision` pre-deploy blocker (memory) still applies before any real cluster bootstrap test.
