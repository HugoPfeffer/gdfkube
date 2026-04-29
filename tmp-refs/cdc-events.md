# CDC Events API

This document defines the CDC (Change Data Capture) event contract between MongoDB, Debezium, Kafka, and the Camel consumer in the gdfkube pipeline.

## Pipeline Flow

The CDC pipeline processes form submissions through five stages:

1. Node.js app inserts document into MongoDB `requests` collection
2. MongoDB change stream captures the oplog event
3. Debezium connector reads the change stream and transforms it
4. Debezium publishes structured event to Kafka topic `dbz.gdfkube.requests`
5. Camel consumer reads event, filters for creates (`op='c'`), and processes

## Kafka Topic Contract

The CDC pipeline uses a stable topic naming convention. For complete Kafka and CDC naming standards, see [Development and Deployment Standards](../standards/development-deployment.md#kafka-and-cdc).

**Key contracts:**

- **Topic**: `dbz.gdfkube.requests`
- **DLQ Topic**: `dbz.gdfkube.requests.dlq`
- **Connector**: `mongodb-requests`
- **Consumer group**: `gdfkube-camel-consumer`

## Event Structure

### Debezium Event Envelope

Debezium wraps MongoDB changes in a standard envelope with the following fields:

```json
{
  "op": "c",
  "before": null,
  "after": "{\"formId\":\"cluster-request\",\"requestId\":\"01HQXYZ...\",\"createdAt\":{\"$date\":\"2026-02-12T10:30:00.000Z\"},\"meta\":{\"requesterName\":\"admin\",\"requesterGroupName\":\"admin\"},\"vars\":{\"clusterName\":\"my-cluster\"}}",
  "source": {
    "connector": "mongodb",
    "name": "dbz",
    "db": "gdfkube",
    "collection": "requests",
    "snapshot": "false"
  },
  "ts_ms": 1705315800000
}
```

**Envelope Fields:**

| Field    | Type           | Description                                              |
| -------- | -------------- | -------------------------------------------------------- |
| `op`     | string         | Operation type: `c` (create), `u` (update), `d` (delete) |
| `before` | string or null | Document state before change (null for inserts)          |
| `after`  | string         | JSON-serialized document state after change              |
| `source` | object         | Metadata about the change source                         |
| `ts_ms`  | number         | Timestamp in milliseconds since epoch                    |

The Camel consumer filters for `op='c'` only, ignoring updates and deletes.

### Request Document Schema

The `after` field contains a JSON string that the consumer parses into the request document:

```json
{
  "formId": "cluster-request",
  "requestId": "01HQXYZ123456789ABCDEFGHIJ",
  "createdAt": { "$date": "2026-02-12T10:30:00.000Z" },
  "meta": {
    "requesterName": "admin",
    "requesterGroupName": "admin"
  },
  "vars": {
    "clusterName": "my-cluster",
    "replicas": 3
  }
}
```

**Request Document Fields:**

| Field                     | Type   | Required | Description                                                     |
| ------------------------- | ------ | -------- | --------------------------------------------------------------- |
| `formId`                  | string | Yes      | References `formSchemas.formId`, used for content-based routing |
| `requestId`               | string | Yes      | ULID unique identifier generated at submission                  |
| `createdAt`               | object | Yes      | MongoDB Extended JSON date (Camel converts to ISO-8601)         |
| `meta.requesterName`      | string | Yes      | Username who submitted the form                                 |
| `meta.requesterGroupName` | string | Yes      | User's group, used as organization identifier                   |
| `vars`                    | object | Yes      | Dynamic key-value pairs from form fields                        |

The `vars` object contains arbitrary fields defined by the form schema. Field names and types vary by `formId`.

## Schema Lookup Interface

The Camel consumer retrieves form metadata by calling the Node.js app:

**Request:**

```
GET http://{NODE_APP_HOST}:{NODE_APP_PORT}/api/schema/{formId}
```

**Response:**

```json
{
  "formId": "cluster-request",
  "title": "Request HyperShift Cluster",
  "templateFieldIdentifier": "clusterName",
  "fields": [...]
}
```

The `templateFieldIdentifier` field tells the consumer which `vars` field identifies the resource name (e.g., `clusterName` for cluster requests).

## Processing Headers

After parsing the CDC event, the Camel route sets these exchange headers:

| Header                    | Source                          | Description                  |
| ------------------------- | ------------------------------- | ---------------------------- |
| `formId`                  | `after.formId`                  | Form identifier for routing  |
| `requestId`               | `after.requestId`               | Unique request ID            |
| `org`                     | `after.meta.requesterGroupName` | Organization (maps to repos) |
| `templateFieldIdentifier` | Schema lookup response          | Field name for resource name |
| `resourceName`            | `vars[templateFieldIdentifier]` | Resolved resource name       |
| `customerRepoName`        | Computed: `gdfkube-{org}`       | Target customer repo         |

The `customerRepoName` header determines the Git repository where manifests are committed.

## Connector Configuration

Local and OpenShift environments configure the Debezium MongoDB connector differently. Local uses minimal settings for immediate failure feedback, while OpenShift adds error tolerance and dead letter queue routing.

For complete connector configurations with all settings, see [Development and Deployment Standards](../standards/development-deployment.md#connector-configuration).

**Key differences:**

- Local: `errors.tolerance: none` (fail fast)
- OpenShift: `errors.tolerance: all` with DLQ routing to `dbz.gdfkube.requests.dlq`
- Both: `capture.mode: change_streams_update_full` for complete document snapshots

## Error Handling

The pipeline handles errors at two levels:

**Connector level:**

- Dead letter queue `dbz.gdfkube.requests.dlq` captures events the connector cannot process
- DLQ messages include error context headers for debugging
- Connector continues processing subsequent events despite failures

**Consumer level:**

- Camel consumer uses `doTry/doCatch` blocks with rollback processors
- Failed repo creation triggers idempotent rollback via `giteaRepoRollback` processor
- Multi-repo operations roll back completely on partial failure

## Related Documentation

- [Development and Deployment Standards](../standards/development-deployment.md) — Topic naming conventions, environment variables, complete connector configurations
- [Camel Consumer Architecture](../architecture/camel-consumer.md) — Route processing details, processors, template context
- [Node.js Application API](node-app.md) — Form schema API, request submission flow
