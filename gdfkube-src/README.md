# gdfkube v2

gdfkube v2 — form submission becomes Git commit becomes cluster manifest. Backend pipeline; frontend ships separately as the gdfkube-itsm remix bundle.

## Quickstart

- `task dev:up` — boots Mongo, Kafka, Kafka Connect, Gitea, two dummy workloads via compose
- `task test` — runs unit + parity + chart-lint + helm-dry-run
- `task test:watch` — TDD inner loop
- `task dev:down` — tears down all services

## Inspect each running service

```bash
docker compose ps
docker compose logs -f mongo
docker compose logs -f kafka
docker compose logs -f kafka-connect
docker compose logs -f gitea
docker compose logs -f node-dummy
docker compose logs -f camel-dummy
```

Confirm the connector registered:

```bash
curl -fsS http://localhost:8083/connectors | jq
```

## Naming and label conventions (locked in §0.3 of the phase plan)

| Resource | Convention |
|----------|-----------|
| HostedCluster `metadata.name` | `hc-{org}-{cluster}` |
| HostedCluster namespace | `clusters` (standard HyperShift) |
| ManagedCluster `metadata.name` | `{cluster}` (form's `vars.clusterName` verbatim) |
| ApplicationSet `metadata.name` | `appset-{org}-{cluster}` |
| AppProject `metadata.name` | `{org}` (single AppProject per org) |
| Resource label | `gdfkube.gov/org: {{ meta.requesterGroupName }}` |
| Clusterset membership label | `cluster.open-cluster-management.io/clusterset: {org}` |

## Repo layout

- **gdfkube-infra/** — platform-once infrastructure (shared by all orgs)
- **gdfkube-orgs/** — per-customer manifests and configuration
- **camel/** — Camel-Quarkus consumer (Debezium → Kafka → manifests)
- **node/** — Node.js application
- **scripts/** — utility scripts
- **tests/** — test suites
- **gdfkube-itsm/** — frontend remix bundle (shipped separately)
