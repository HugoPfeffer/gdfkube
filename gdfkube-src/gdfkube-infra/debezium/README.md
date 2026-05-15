# Debezium MongoDB Connector

Captures MongoDB change streams via Kafka Connect and publishes CDC events to Kafka topics.

## Connector REST lifecycle

Register or update the connector (idempotent PUT):

```
PUT http://localhost:8083/connectors/gdfkube-mongo-source/config
Content-Type: application/json
Body: <connector-config.json contents>
```

Inspect connector status:

```
GET http://localhost:8083/connectors/gdfkube-mongo-source/status
```

Delete the connector:

```
DELETE http://localhost:8083/connectors/gdfkube-mongo-source
```

## Reset path

```
docker compose down -v
```

This wipes all worker state because the three Connect-internal topics (`connect-configs`, `connect-offsets`, `connect-status`) are stored in Kafka without a host volume. On next `docker compose up`, the connector must be re-registered from scratch.

## Topic-prefix mapping

The connector uses topic prefix `dbz.gdfkube`. Debezium produces events on `dbz.gdfkube.gdfkube.<collection>` by default, but the RegexRouter SMT strips the extra database prefix so events arrive on:

- `dbz.gdfkube.requests` — CDC events from the `requests` collection
- `dbz.gdfkube.forms` — CDC events from the `forms` collection
- `dbz.gdfkube.groups` — CDC events from the `groups` collection

## Dead-letter queue

Connector-level errors are routed to `dlq.gdfkube.debezium`. Context headers are enabled on DLQ records so the original topic, partition, offset, and exception are preserved for debugging.
