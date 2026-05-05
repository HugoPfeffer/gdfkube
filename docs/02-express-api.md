# Express API

> **Implementation Status:** Planned
> **Source:** Handoff `app.jsx` (REST shape) + `gdfkube-src/gdfkube-itsm/src/types.ts` (payload shape)
> **Last validated:** 2026-05-05

## Role in the Pipeline

```
[Portal] ──REST──▶ [Express] ──Mongoose──▶ [MongoDB]
                       │
                       └─Kafka consumer──▶ SSE stream to portal
```

The thin REST layer between the portal and MongoDB. Validates form
submissions, assigns ULIDs, persists request documents, exposes read
endpoints, and streams pipeline events back to the portal.

## Responsibilities

- Validate POST payloads against the FormDef schema.
- Assign a ULID `requestId` (Crockford base32; sortable by submission time).
- Insert/update request documents in MongoDB. Mongoose handles schema validation.
- Expose read endpoints for the portal (catalog, lists, detail).
- Subscribe to `gdfkube.pipeline.status` and stream stage events to subscribed clients via SSE.
- **Does NOT** render manifests, write to Git, or talk to ArgoCD/Kafka producers in the provisioning path. State changes flow through CDC.

## Design

### Tech

- Node.js 20 + Express 4.
- Mongoose for the MongoDB driver and schema validation.
- `kafkajs` for the consumer that powers SSE.
- `ulid` for `requestId` generation.

### Topology

- Single Deployment in namespace `gdfkube-itsm` (or co-located with the portal).
- Stateless. Horizontal scale OK (each replica subscribes to the status topic with a unique consumer group id `itsm-sse-{podName}`).

### REST Contract

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/itsm/forms` | List active FormDefs. |
| `GET` | `/api/itsm/forms/:id` | Get one FormDef (schema + topic). |
| `POST` | `/api/itsm/requests` | Submit a new request. Returns `{ id }` (ULID). |
| `GET` | `/api/itsm/requests` | List requests (filter by status, formId, requesterGroup). |
| `GET` | `/api/itsm/requests/:id` | Full request document. |
| `GET` | `/api/itsm/requests/:id/events` | **SSE stream** of pipeline stage events for this request. |
| `POST` | `/api/itsm/requests/:id/approvals` | Record an approval decision. Body: `{ action, comment? }`. |
| `GET` | `/api/itsm/users` | (admin) Users. |
| `POST` | `/api/itsm/users` | (admin) Create a user. |
| `PATCH` | `/api/itsm/users/:id` | (admin) Update a user. |
| `GET` | `/api/itsm/forms` (admin variant) | List all FormDefs including disabled. |
| `POST` | `/api/itsm/forms` | (admin) Create a form. |
| `PATCH` | `/api/itsm/forms/:id` | (admin) Update form. |

### Submit Flow

1. Validate body against the target FormDef's `fields[]` (types, required, min/max, options, regex).
2. Generate ULID `requestId = ulid()`.
3. Build the request document:
   ```json
   {
     "_id": "<requestId>",
     "formId": "cluster-request",
     "env": "production",
     "status": "approval",
     "stage": 0,
     "submittedAt": "<ISO-8601>",
     "requester": { "id": "u-joao", "name": "João Silva", "email": "...", "role": "operator", "group": "saude" },
     "requesterGroupName": "saude",
     "vars": { "clusterName": "vacinacao", "nodeCount": 3, ... },
     "meta": { "correlationId": "<requestId>", "submittedAt": "...", "formId": "cluster-request" },
     "policyChecks": [],
     "approvalChain": []
   }
   ```
4. Insert into `gdfkube.requests`. Mongoose enforces schema.
5. Return `201 { id: requestId }`.
6. **Debezium picks it up.** Express does NOT publish to Kafka directly — CDC owns that channel.

### Approval Flow

1. POST `/api/itsm/requests/:id/approvals` with `{ action: 'approved' | 'rejected' | 'requested_changes', comment? }`.
2. Verify the caller is a SETIC platform admin (demo: ITSM `admin` user). Reject otherwise.
3. Push `{ actor, action, comment, at }` onto `approvalChain`.
4. If `action === 'approved'`: set `status = 'provisioning'`, `stage = 1`. CDC fires the update event downstream.
5. If `action === 'rejected'`: set `status = 'failed'`, `reason = comment`.

### SSE Endpoint

- `GET /api/itsm/requests/:id/events` opens an EventSource.
- Express maintains an in-memory subscription map keyed by `requestId`.
- The Kafka consumer (`gdfkube.pipeline.status`, key = `requestId`) routes incoming events to subscribed connections.
- Heartbeat every 15s. Reconnection is the client's concern.

### Identity & Auth (demo)

- Static user list, hardcoded at boot:
  - `u-joao`: João Silva, `operator`, group `saude`.
  - `u-maria`: Maria Costa, `admin`, group `setic`.
- Username chosen via header `X-Demo-User` (or boot-config). No password, no JWT.
- All mutations capture the static user as `requester` / `actor`.
- **This is demo only.** Real auth is a future PRD item.

## Interfaces

| Direction | Counterpart | Protocol |
|---|---|---|
| Inbound | Portal | HTTPS / JSON, HTTPS / SSE |
| Outbound | MongoDB | TCP / Mongoose (replica-aware) |
| Inbound (consumer) | Kafka `gdfkube.pipeline.status` | TCP / kafkajs |

## Operational Concerns

- **Idempotency:** ULID generation + Mongo `_id` collision check makes submit safe to retry. Approval is not idempotent — duplicate POSTs append duplicate decisions; the front-end must dedupe on client.
- **Validation:** all schema validation is server-side Mongoose. The portal repeats validation for UX, never as the source of truth.
- **No backpressure:** the SSE consumer is per-request; if the topic backlog grows, late subscribers will catch up from `auto.offset.reset = latest` and may miss stages. For the demo, this is acceptable.

## Decisions Resolved

- Auth: static user list for demo (deferred Keycloak/OIDC).
- Status push: SSE from Express subscribed to `gdfkube.pipeline.status`.
- Approval scope: single SETIC platform admin (ITSM `admin` user).
- Express does NOT produce to Kafka. Only consumes from `gdfkube.pipeline.status` for SSE.

## Open Questions

- Rate limiting per requester / per form? Not specified.
- Pagination defaults for `/api/itsm/requests`? Not specified.
- Failure surface: should rejected and DLQ-stuck requests differ in the API representation?

## References

- `gdfkube-src/gdfkube-itsm/src/types.ts` — `Request`, `User`, `FormDef`, `ApprovalDecision` shapes.
- [03-mongodb.md](./03-mongodb.md) — schema and indexes the API depends on.
- [04-debezium.md](./04-debezium.md) — what consumes the writes Express makes.
- [05-kafka.md](./05-kafka.md) — `gdfkube.pipeline.status` topic the SSE endpoint subscribes to.
