# Phase 1 — CDC ingest: Mongo → Debezium → Kafka with per-form-type topics

| Field         | Value                              |
| ------------- | ---------------------------------- |
| Status        | Not started                        |
| Predecessor   | [Phase 0](phase-0-foundation.md)   |
| Successor     | [Phase 2](phase-2-helm-charts.md)  |

## 1. Scope

Wire up the CDC pipeline end of the system: MongoDB pre-and-post-images, the Debezium connector, the per-form-type topic split, and a minimal Node-app write path that feeds it. **No consumer yet.** Goal: posting a form submission produces a clean envelope on the right topic, observable by a developer with `kafka-console-consumer`.

In:

- MongoDB initialised with `requests` collection, `changeStreamPreAndPostImages: { enabled: true }`.
- `connector.json` extended with the Debezium SMT chain that routes by `formId`:
  - Capture mode: `change_streams_update_full_with_pre_and_post_images`.
  - `RegexRouter` SMT producing `dbz.gdfkube.requests.<formId>` topic names.
  - DLQ config: `errors.tolerance: all`, `errors.deadletterqueue.topic.name: dbz.gdfkube.requests.dlq`, `errors.deadletterqueue.context.headers.enable: true`.
- Node app gains a minimal `POST /api/requests` endpoint that validates `formId ∈ {cluster-request, namespace-request, scale-request}` (the three form IDs the remix bundle defines — see Phase 0 §0.3) and writes to Mongo. No UI, no auth — `curl` is the test harness.
- Node app gains a minimal `POST /api/approvals` endpoint that writes a decision document to the `approvals` collection (see §3.6). No auth in this phase.
- Mongo init creates **two** collections (`requests`, `approvals`), both with `changeStreamPreAndPostImages: { enabled: true }`.
- The Debezium connector's `mongodb.collection.include.list` covers both collections; its `RegexRouter` SMT routes `requests` events to `dbz.gdfkube.requests.<formId>` and `approvals` events to `dbz.gdfkube.approvals` (single topic).
- `Taskfile.yaml` gets `cdc:tail <formId>`, `cdc:approvals` (tails the approval stream), and `dlq:tail` helpers.
- The four expected topics (`dbz.gdfkube.requests.cluster-request`, `dbz.gdfkube.requests.namespace-request`, `dbz.gdfkube.requests.scale-request`, `dbz.gdfkube.approvals`) are auto-created by the connector on first event of each kind.

## 2. Out of scope

- Camel consumer (Phase 3 / 4).
- Form schema validation beyond `formId` enum.
- Authentication / RBAC on the endpoint.
- Helm charts (Phase 2).
- Form UI (handled by remix bundle, integrated later).

## 3. Architecture

### 3.1 Stable Kafka contracts

The remix bundle exposes three form types today (`cluster-request`, `namespace-request`, `scale-request`) and the catalog is expected to grow. v2's topic layout is designed for that growth: each form type gets its own topic, derived from a single MongoDB collection by Debezium's routing transform. New form types are an additive change (one more topic, one more route) — they do not require a schema migration of `requests` or a re-partition of an existing topic.

| Item                | Value                                                                                                                              | Notes                                                                                                                                                                                                                                                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Topic prefix        | `dbz`                                                                                                                              | Debezium `topic.prefix`                                                                                                                                                                                                                                                                                                              |
| Source DB           | `gdfkube`                                                                                                                          | Single MongoDB DB                                                                                                                                                                                                                                                                                                                    |
| Source collection   | `requests`                                                                                                                         | Single capture collection — `formId` is a field on the document, used for routing                                                                                                                                                                                                                                                    |
| Topic naming        | `dbz.gdfkube.requests.<formId>`                                                                                                    | **Per-form-type topic.** Examples: `dbz.gdfkube.requests.cluster-request`, `dbz.gdfkube.requests.namespace-request`, `dbz.gdfkube.requests.scale-request`. Implemented via Debezium SMT `RegexRouter` keyed off `after.formId` (or `before.formId` on deletes — see §3.4 below).        |
| DLQ topic           | `dbz.gdfkube.requests.dlq`                                                                                                         | Single DLQ shared across form types — header `formId` carries provenance                                                                                                                                                                                                                                                             |
| Consumer group      | `gdfkube-camel-consumer`                                                                                                           | Reserved name (no consumer in this phase). Phase 3 subscribes one route; Phase 4 subscribes the full pattern.                                                                                                                                                                                                                       |
| Connector name      | `mongodb-requests`                                                                                                                 | Strimzi `KafkaConnector` and local Score `resources:` entry share this name                                                                                                                                                                                                                                                          |
| Capture mode        | `change_streams_update_full_with_pre_and_post_images`                                                                              | **Change from v1.** Requires `db.runCommand({ collMod: "requests", changeStreamPreAndPostImages: { enabled: true } })`                                                                                                                                                                                                               |
| Form-type onboarding | Add `formId` to the `formSchemas` collection → Debezium routes auto-create the topic → register a Camel consumer route for it     | No connector reconfiguration, no consumer-group rebalance for existing form types                                                                                                                                                                                                                                                    |

**Why per-form-type topics rather than one topic + dispatch-in-consumer.** Three reasons: (a) operational — failures and lag are observable per form type without filtering; (b) blast radius — a poison message in `namespace-request` does not stall `cluster-request`; (c) future scaling — a high-volume form type can be partitioned independently. The cost is one more SMT in the connector and one more route per form type; both are cheap.

### 3.2 Event envelope

```json
{
  "op": "c | u | d",
  "before": "<JSON string of full document, populated on u and d>",
  "after":  "<JSON string of full document, populated on c and u>",
  "source": { "name": "dbz", "db": "gdfkube", "collection": "requests", "...": "..." },
  "ts_ms": 1705312200456
}
```

The Debezium SMT chain extracts `formId` from `after` (or `before` on deletes) and routes the record to `dbz.gdfkube.requests.<formId>`. The envelope shape itself is identical across topics — consumers only need to know which form type they handle.

### 3.3 DLQ topic contract (this phase: topic only)

- OpenShift connector: `errors.tolerance: all`, `errors.deadletterqueue.topic.name: dbz.gdfkube.requests.dlq`, `errors.deadletterqueue.context.headers.enable: true`.
- Local connector: same settings, but with a 1-partition DLQ created at compose-up.
- A small `dlq-tail` task replays the last N DLQ messages with their headers — operator-debugging affordance, not a re-processor.
- Phase 1 only establishes the topic and the connector-side flag set. Consumer-side DLQ **reasons** (`unknown_formId`, `chart_render_failed`, etc.) are introduced in Phase 5.

### 3.4 Pre-image mechanics (closes L5)

MongoDB Change Streams emit only the document `_id` on a `delete` op unless pre-images are enabled at the collection level (`changeStreamPreAndPostImages: { enabled: true }`) and the connector is started with `capture.mode = change_streams_update_full_with_pre_and_post_images`. With both flips, every delete carries the full `before` document the saga needs to compute the resource path. v2 makes this configuration mandatory; the soft-delete trick (`status='deleting'`) used by v1 is deleted.

The Mongo init script that runs at compose-up (and inside the Bitnami Helm chart's pre-install hook on OCP) executes:

```javascript
db.createCollection("requests");
db.runCommand({
  collMod: "requests",
  changeStreamPreAndPostImages: { enabled: true }
});
```

### 3.5 Connector parity (closes L13 concrete payload)

`gdfkube-src/connector.json` is the **byte-identical** payload supplied to:

- Local Kafka Connect, via `scripts/register-connector.sh` (`POST /connectors`).
- OpenShift, via a Strimzi `KafkaConnector` CR template that `valuesFrom` the same JSON.

The score-parity CI gate (Phase 0) runs `diff -u` between the two and fails on any non-zero output. Adding new SMTs requires a single edit to `connector.json` — drift is impossible without breaking CI.

### 3.6 Approvals — second collection, second CDC stream

The remix's `approvals.jsx` defines a real backend concern: requests carry `status: "approval"` until an admin signs off. v2 implements this as a **second Mongo collection** rather than as an `approvalStatus` field on the request, so the CDC envelopes stay clean and the approval lifecycle has its own observability.

| Item                       | Value                                                                                       | Notes                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Source collection          | `approvals`                                                                                 | Sibling collection in the same `gdfkube` DB; pre-and-post-images enabled identically to `requests`                |
| Topic                      | `dbz.gdfkube.approvals`                                                                     | Single topic — no per-formId split (approvals are uniform across forms)                                            |
| Connector strategy         | Same `mongodb-requests` connector instance, `mongodb.collection.include.list` = both names  | One connector, two collections. Avoids drift between two parallel connector configs.                                |
| Document shape             | `{ requestId, formId, decision: "approved" \| "rejected", decidedBy, decidedAt, policyChecks: [...] }` | `requestId` is the foreign key back to the `requests` doc. `policyChecks` is an array of `{name, status, message}` mirroring the remix UX. |
| Node app endpoint          | `POST /api/approvals` — admin-only in scope of Phase 1's `curl` harness                     | Phase 1 ships the endpoint; auth/RBAC stays out of scope until cutover.                                            |
| DLQ                        | Same `dbz.gdfkube.requests.dlq` (shared)                                                    | DLQ records carry collection name in the `__source.collection` header.                                              |

The Camel saga (Phase 4) joins these two streams: `requests` `op=c` queues a pending render; the saga blocks until a matching approval event with `decision: "approved"` arrives on the same `requestId`. A `decision: "rejected"` event closes out the queued render with no manifests written. Phase 3 (MVP) does **not** implement the join — it auto-approves every request to keep the spine demonstrable; the join lands in Phase 4 alongside the saga runner.

## 4. Lessons applied in this phase

### L5 — Debezium delete events have no `before` payload by default

**Origin (v1).** v1 sidesteps the missing-`before` problem with a soft-delete (`status: 'deleting'`) update event. Pre-image capture (MongoDB 6.0+) is the principled fix. Reference: `add-request-deletion` proposal.

**Action in Phase 1.** Mandate pre-image enablement on the `requests` collection at compose-up and inside the OCP Bitnami Helm chart's pre-install hook. Flip the connector's capture mode to `change_streams_update_full_with_pre_and_post_images`. The soft-delete trick is removed from the Node app's contract — a delete is a Mongo `deleteOne`. With both flips, every delete carries the full `before` document the saga (Phase 4) needs to compute the resource path.

### L13 — Connector parity drifts

**Origin (v1).** Local `register-connector.sh` was missing `capture.mode` while OpenShift `KafkaConnector` set it explicitly. Reference: `add-request-deletion` proposal §6.

**Action in Phase 1.** `gdfkube-src/connector.json` is the byte-identical payload supplied to local Kafka Connect (via `scripts/register-connector.sh`) and to the Strimzi `KafkaConnector` CR template (via `valuesFrom`). The score-parity CI gate (scaffolded in Phase 0) is extended in Phase 1 to cover the new SMT block. Drift is impossible without breaking CI.

## 5. Deliverables

- `gdfkube-src/mongo/init/01-requests.js` — `requests` collection creation + `collMod` for pre-and-post-images.
- `gdfkube-src/mongo/init/02-approvals.js` — `approvals` collection creation + `collMod` for pre-and-post-images.
- `gdfkube-src/connector.json` — finalised SMT chain (covers both collections in `mongodb.collection.include.list`; one `RegexRouter` per source collection).
- `gdfkube-src/scripts/register-connector.sh` — local REST registration; **byte-identical** payload to the Strimzi `KafkaConnector` CR (see Acceptance).
- `gdfkube-src/node/src/routes/requests.ts` — `POST /api/requests` endpoint.
- `gdfkube-src/node/src/routes/approvals.ts` — `POST /api/approvals` endpoint.
- `Taskfile.yaml` adds `cdc:tail`, `cdc:approvals`, `dlq:tail`, `cdc:topics` (lists the auto-created topics).
- Test fixtures: `gdfkube-src/tests/fixtures/cdc/{cluster-request,namespace-request,scale-request}.json` — example POST bodies. Field shapes match the remix bundle: `cluster-request` carries `vars.clusterName`, `vars.environment`, `vars.nodeCount`; `namespace-request` carries `vars.namespaceName`, `vars.cpuQuota`, `vars.memQuota` (no `Gi` suffix in the key — the unit lives in the field label only); `scale-request` carries `vars.clusterName`, `vars.newNodeCount`. `meta` carries `requesterName` (the login id, sourced from `user.username` in the remix's new-request.jsx) and `requesterGroupName` only — no `requesterUsername` field.
- Test fixtures: `gdfkube-src/tests/fixtures/cdc/approval-{approved,rejected}.json` — example approval-decision POST bodies for `POST /api/approvals`.

## 6. Working-project demo

```
$ task dev:up

# Submit one of each form type
$ for f in cluster-request namespace-request scale-request; do
    curl -fsS -XPOST http://localhost:8080/api/requests \
      -H 'content-type: application/json' \
      --data @gdfkube-src/tests/fixtures/cdc/$f.json
  done

# Each form lands on its own topic
$ task cdc:topics
dbz.gdfkube.requests.cluster-request
dbz.gdfkube.requests.namespace-request
dbz.gdfkube.requests.scale-request
dbz.gdfkube.requests.dlq

$ task cdc:tail -- cluster-request
{"op":"c","before":null,"after":"{\"_id\":...,\"formId\":\"cluster-request\",\"vars\":{...}}", ...}

# Delete a request → before payload populated thanks to pre-images
$ mongosh "$MONGO_URL" --eval 'db.requests.deleteOne({"requestId":"01HQ..."})'
$ task cdc:tail -- cluster-request | tail -1
{"op":"d","before":"{...full doc...}","after":null, ...}
```

## 7. Acceptance criteria (gate to Phase 2)

- [ ] All four expected topics auto-create on first event: `dbz.gdfkube.requests.{cluster-request,namespace-request,scale-request}` and `dbz.gdfkube.approvals`.
- [ ] An approval document posted to `POST /api/approvals` with `decision: "approved"` for an existing `requestId` lands on `dbz.gdfkube.approvals` carrying both `requestId` and `formId` in the payload (consumer-side join lands in Phase 4).
- [ ] `op=d` events carry a populated `before` payload (pre-images verified end-to-end).
- [ ] DLQ topic exists; a malformed payload (introduce a typo in `connector.json` SMT temporarily as a smoke test) lands there with `formId` in the headers.
- [ ] `register-connector.sh` config and the Strimzi `KafkaConnector` CR diff to **zero** lines (CI gate from Phase 0 still green; addresses L13).
- [ ] Posting a request whose `formId` is unknown returns `400` from the Node app **before** it reaches Mongo (cheap guard against spamming the DLQ).
- [ ] `task cdc:tail` and `task dlq:tail` work in both local compose and inside the devcontainer.

## 8. Test plan

| Test                    | Type        | How                                                                                               |
| ----------------------- | ----------- | ------------------------------------------------------------------------------------------------- |
| Form → topic routing    | Integration | Post each fixture; assert message count on each topic via `kafka-console-consumer --max-messages` |
| Pre-image on delete     | Integration | Insert + delete; assert `before != null` on the delete envelope                                   |
| Connector parity        | CI          | Existing Phase-0 diff job — extended to verify the new SMT block                                  |
| Unknown formId          | Unit        | Node app endpoint returns 400 for `formId=does-not-exist`                                         |
| DLQ headers             | Manual      | Force a payload that fails SMT; verify DLQ envelope has `__formId` header                         |
| Topic auto-creation     | Smoke       | `task cdc:topics` after a clean `dev:down && dev:up`                                              |

## 9. Risks and on-hold items

- The runtime schema-fetch indirection (a v1 plan: have the consumer call `GET /api/schema/{formId}` per event) is held pending Phase 3 — Phase 1 deliberately keeps the consumer out of scope, so the question doesn't bite yet. With per-form-type topics (this phase) plus a chart-per-form-type layout (Phase 2), the schema-fetch is likely retired in Phase 4.
- Topic-pattern vs per-route subscription is decided in Phase 4, not here. Phase 1 just ensures the topics exist and are discoverable.

## 10. References

- Debezium MongoDB connector documentation: capture modes (especially `change_streams_update_full_with_pre_and_post_images`)
- [Debezium SMT reference](https://debezium.io/documentation/reference/stable/transformations/index.html) — `RegexRouter`, error handling, DLQ
- MongoDB `collMod` + `changeStreamPreAndPostImages` documentation
- Strimzi `KafkaConnector` CR documentation
