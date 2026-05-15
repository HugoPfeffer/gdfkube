# Observability

> **Implementation Status:** Deferred
> **Source:** Not covered in handoff

## Specs

_No specs yet — this component is not contracted._

## Status

This iteration intentionally defers the observability story. The handoff
does not pin down a stack, and getting the pipeline functionally complete is
the higher priority. A future PRD will turn this stub into a full plan.

## What a Future PRD Should Cover

Per component, decide:

- **Strimzi Kafka** — JMX exporter, broker/topic/consumer-group lag metrics, alerting on DLQ ingress rate.
- **Debezium** — connector status (running/failed), task-level lag, error-DLQ count.
- **Camel (Quarkus)** — Micrometer + per-route metrics (in/out counts, error rate, retry count, processing time). Health probes.
- **MongoDB** — official Mongo Prometheus exporter, replica-set status, oplog window.
- **Express API** — request/error metrics, SSE connection count.
- **ArgoCD** — built-in metrics endpoint; sync status, out-of-sync count.
- **RHACM** — policy compliance metrics; ManagedCluster `Available` state.
- **HyperShift** — control-plane Pod readiness, NodePool replica health.

Across the board: structured JSON logs with `requestId` propagated as a
correlation field so the same ULID can trace from form submit to cluster
ready.

## Likely Stack (not yet decided)

- Metrics: Prometheus + Grafana (OpenShift Monitoring user workload variant).
- Logs: Loki or OpenShift Logging.
- Tracing: out of scope for the demo (would require OpenTelemetry instrumentation in Express + Camel).
- Alerting: Alertmanager fronting on-call channels.

## Decisions Resolved

- Observability is deferred. No exporters, dashboards, or alerts in this iteration.

## Open Questions

(Everything.) Nothing in this doc is canonical; treat the bullets above as
options for the future PRD's brainstorm.

## References

- [05-kafka.md](./05-kafka.md) — DLQ alerting threshold mentioned (>15min unacked) is the only observability commitment so far.
- [06-camel.md](./06-camel.md) — `dlq_log` collection is the manual visibility surface in the absence of dashboards.
