## ADDED Requirements

### Requirement: Service SHALL initialize a Kafka consumer for pipeline stage events at startup

The Express service MUST add `kafkajs ^2.2.4` as a dependency and MUST initialize a kafkajs consumer at process startup, before binding the HTTP listener. The consumer MUST be configured as:

| Setting | Value |
|---|---|
| `brokers` | from `KAFKA_BOOTSTRAP_SERVERS` env (default `kafka1:19092,kafka2:19092,kafka3:19092` in Compose) |
| `groupId` | `itsm-sse-${HOSTNAME}` (per-replica fan-out) |
| `topic` | `gdfkube.pipeline.status` |
| `fromBeginning` | `false` (auto.offset.reset=latest) |

`${HOSTNAME}` MUST be read from `process.env.HOSTNAME` (the container hostname); this maps to the pod name in K8s and a container-id-hash in Compose. The service MUST NOT initialize any Kafka producer — Express remains a non-producer.

#### Scenario: Consumer is initialized before HTTP listener binds

- **GIVEN** the Express container starts
- **WHEN** the startup sequence runs
- **THEN** the kafkajs consumer SHALL connect to the Kafka cluster
- **AND** the consumer SHALL subscribe to `gdfkube.pipeline.status`
- **AND** the HTTP listener SHALL bind only after the consumer reports `connected`
- **AND** no Kafka producer SHALL be initialized

#### Scenario: Consumer group ID is per-replica

- **GIVEN** the Express container is running with `HOSTNAME=itsm-api-abc123`
- **WHEN** the consumer connects to Kafka
- **THEN** the consumer group ID SHALL be exactly `itsm-sse-itsm-api-abc123`

#### Scenario: Compose service has the new env and depends_on

- **GIVEN** the repo-root `docker-compose.yml`
- **WHEN** the `gdfkube-itsm-api` service definition is inspected
- **THEN** the service SHALL declare `KAFKA_BOOTSTRAP_SERVERS=kafka1:19092,kafka2:19092,kafka3:19092` in its env
- **AND** the service SHALL declare `depends_on` for `kafka1`/`kafka2`/`kafka3` with `condition: service_healthy`

---

### Requirement: Consumer SHALL fan out stage events to an in-memory subscription map

The service MUST maintain an in-memory `Map<requestId, Set<Response>>` of SSE subscribers. On each consumed message, the service MUST parse the value as JSON, extract the `requestId` from the parsed payload (or fall back to the message key), and write the event to every subscribed `Response` whose key matches the `requestId`. A message that fails JSON parse MUST be logged and dropped (no DLQ produce).

#### Scenario: Event fans out to all matching subscribers

- **GIVEN** two SSE clients are subscribed to the same `requestId`
- **WHEN** a stage event arrives on `gdfkube.pipeline.status` with that `requestId`
- **THEN** both clients SHALL receive the event as an SSE `data:` line within 1 second

#### Scenario: Unparseable message is dropped without crashing the consumer

- **GIVEN** the consumer is running
- **WHEN** a message with a non-JSON body lands on `gdfkube.pipeline.status`
- **THEN** the consumer SHALL log an error and continue processing subsequent messages
- **AND** the service SHALL NOT crash

---

### Requirement: Service SHALL expose GET /api/itsm/requests/:id/events as an SSE stream

A new route `GET /api/itsm/requests/:id/events` MUST be registered. The route MUST:

1. Return `404 Not Found` if no document with `_id == :id` exists in the `requests` collection.
2. Respond `200 OK` with these headers:
   - `Content-Type: text/event-stream`
   - `Cache-Control: no-cache`
   - `Connection: keep-alive`
3. Emit a synthetic first event derived from the request document's current `stage` field. If `stage == 0`, the synthetic event MUST use `stageName == "form"`. The synthetic event MUST conform to the `StageEvent` schema (defined below) with `status == "ok"` and `at` set to the current UTC time.
4. Register the response in the subscription map under the request's `_id`.
5. Deregister the response from the map on client disconnect (`req.on('close')`).
6. Send a heartbeat comment `:\n\n` every 15 seconds to keep proxies alive.

#### Scenario: 404 for unknown request

- **GIVEN** no request document with `_id == "BAD"` exists
- **WHEN** a client issues `GET /api/itsm/requests/BAD/events`
- **THEN** the response SHALL be `404 Not Found`

#### Scenario: Synthetic first event on stage 0

- **GIVEN** a request `X` exists with `stage == 0` (default)
- **WHEN** a client issues `GET /api/itsm/requests/X/events`
- **THEN** the response SHALL be `200 OK` with `Content-Type: text/event-stream`
- **AND** the first SSE `data:` line SHALL parse as JSON with `stage == 0`, `stageName == "form"`, and `status == "ok"`

#### Scenario: Synthetic first event on stage 5

- **GIVEN** a request `Y` exists with `stage == 5` (git stage already passed)
- **WHEN** a client subscribes to its events stream
- **THEN** the first SSE event SHALL have `stage == 5` and `stageName == "git"`

#### Scenario: Live event after subscription

- **GIVEN** a client is subscribed to request `Z`
- **WHEN** Camel `status-emitter` produces an event for `Z` on `gdfkube.pipeline.status` with `stage == 4`
- **THEN** the client SHALL receive an SSE `data:` line whose JSON has `stage == 4` and `stageName == "camel"`

#### Scenario: Heartbeat keeps the connection open

- **GIVEN** a client is subscribed
- **AND** no events flow for at least 15 seconds
- **WHEN** the connection is inspected
- **THEN** the server SHALL have sent at least one `:\n\n` heartbeat comment
- **AND** the connection SHALL remain open

#### Scenario: Subscription is removed on disconnect

- **GIVEN** a client is subscribed
- **WHEN** the client closes the connection
- **THEN** the subscription map for that `requestId` SHALL no longer contain that Response
- **AND** subsequent events for that `requestId` SHALL NOT attempt writes to the disconnected response

---

### Requirement: StageEvent payload schema SHALL be defined and validated

The canonical `StageEvent` JSON schema for messages on `gdfkube.pipeline.status` (produced by Camel `status-emitter` and re-emitted by Express SSE) MUST be:

```json
{
  "requestId": "string (ULID matching Request._id)",
  "stage": "integer 0..6",
  "stageName": "one of: form, mongo, debezium, kafka, camel, git, argocd",
  "status": "one of: ok, fail",
  "at": "ISO-8601 UTC timestamp string",
  "detail": "optional human-readable string"
}
```

The mapping from `stage` (integer) to `stageName` (string) MUST be the fixed array `["form", "mongo", "debezium", "kafka", "camel", "git", "argocd"]`. The service MUST validate incoming Kafka messages against this schema; messages that fail validation MUST be logged and dropped. Express MUST re-emit valid messages as SSE `data:` lines without transforming the payload.

#### Scenario: Valid message is re-emitted verbatim

- **GIVEN** a message `{"requestId":"R","stage":3,"stageName":"kafka","status":"ok","at":"2026-05-11T12:00:00Z"}` arrives on `gdfkube.pipeline.status`
- **WHEN** a client is subscribed to request `R`
- **THEN** the client SHALL receive an SSE `data:` line whose JSON exactly matches the input payload

#### Scenario: Schema-invalid message is dropped

- **GIVEN** a message `{"requestId":"R","stage":42}` arrives on `gdfkube.pipeline.status`
- **WHEN** the consumer processes it
- **THEN** the message SHALL be logged as an error and dropped
- **AND** no SSE event SHALL be emitted to subscribers

---

### Requirement: OpenAPI spec SHALL document the SSE endpoint and StageEvent schema

The file `gdfkube-src/gdfkube-itsm/server/src/openapi.yaml` MUST be updated to include:

1. A `GET /api/itsm/requests/{id}/events` operation under the existing `paths` section with a `200 OK` response of `text/event-stream` and a `404 Not Found` response.
2. A `StageEvent` schema under `components.schemas` matching the payload schema above.
3. A `$ref` to `StageEvent` in the SSE response description.

The existing contract test `__tests__/openapi.test.ts` MUST continue to pass.

#### Scenario: SSE route is in the OpenAPI spec

- **GIVEN** the change is applied
- **WHEN** `openapi.yaml` is parsed
- **THEN** the document SHALL contain `paths['/api/itsm/requests/{id}/events'].get`
- **AND** the operation SHALL declare a `200` response with content type `text/event-stream`
- **AND** the operation SHALL declare a `404` response

#### Scenario: StageEvent schema is defined

- **GIVEN** the change is applied
- **WHEN** `openapi.yaml` is parsed
- **THEN** the document SHALL contain `components.schemas.StageEvent`
- **AND** the schema SHALL declare required properties `requestId`, `stage`, `stageName`, `status`, `at`

#### Scenario: OpenAPI contract test passes

- **GIVEN** the change is applied
- **WHEN** `npm test --workspace gdfkube-src/gdfkube-itsm/server -- __tests__/openapi.test.ts` is run
- **THEN** the test SHALL pass with no missing-route or schema-mismatch failures

---

### Requirement: Request Submit Endpoint behavior SHALL remain unchanged

The existing `POST /api/itsm/requests` endpoint behavior MUST NOT change as part of this capability. Specifically:

- The endpoint MUST continue to persist the request to MongoDB `gdfkube.requests`.
- The endpoint MUST NOT produce any message to Kafka.

This requirement explicitly preserves the contract from the existing `itsm-express-api` spec. It is restated here to make the "Express remains a Kafka non-producer" decision testable in the context of this change.

#### Scenario: Submit does not produce to Kafka

- **GIVEN** the full stack is running with the new consumer initialized
- **WHEN** a client submits `POST /api/itsm/requests` with a valid payload
- **THEN** a new document SHALL exist in MongoDB `gdfkube.requests`
- **AND** no message keyed by the new request's `_id` SHALL appear on `gdfkube.pipeline.status` until Camel `status-emitter` produces one
- **AND** no message produced by the Express service SHALL appear on any Kafka topic
