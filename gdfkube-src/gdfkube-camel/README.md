# gdfkube-camel

Quarkus + Apache Camel orchestrator that consumes Kafka CDC events, renders
Helm charts, pushes manifests to Git, and emits pipeline-status events.

## Build

```bash
./mvnw package
./mvnw package -DskipTests   # skip tests
```

## Docker

```bash
./mvnw package -DskipTests
docker build -f Dockerfile.jvm -t gdfkube-camel:dev .
```

## Profiles

| Profile | Git provider | Notes |
|---------|-------------|-------|
| `%dev`  | `MockGitProvider` | No real Git calls; fast local iteration |
| `%prod` | `GiteaGitProvider` | Talks to Gitea instance configured via env vars |

Set `APP_GIT_PROVIDER` to override at runtime.

## Helm CLI

The container image bundles a **SHA-pinned** Helm binary (see `Dockerfile.jvm`).
When upgrading Helm, update both the `HELM_VERSION` ARG and the
`HELM_SHA256` ARG with the checksum from
`https://get.helm.sh/helm-<version>-linux-amd64.tar.gz.sha256sum`.
