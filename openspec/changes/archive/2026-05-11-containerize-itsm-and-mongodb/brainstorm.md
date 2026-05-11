## Design Summary

Introduce the project's first production-runtime container artifacts: (1) a multi-stage Dockerfile that builds and serves the gdfkube-itsm SPA via rootless Nginx on port 8080, and (2) a 3-node MongoDB `rs0` replica-set stack defined in a repo-root `docker-compose.yml`. The two stacks come up together via `docker compose up`, but the SPA is **not** wired to MongoDB in this change — backend integration is a separate future change.

This mirrors the topology described in `docs/03-mongodb.md` (MongoDB 7.x, replica set `rs0`, three nodes, no sharding/arbiter) so a future Debezium CDC integration can attach to a real oplog. The doc's "Implementation Status: Planned" note remains accurate because that document describes the K8s StatefulSet target, which is still future work.

## Alternatives Considered

### Option A: Two containers + repo-root compose (chosen)
- **Approach**: ITSM image built from `gdfkube-src/gdfkube-itsm/Dockerfile`; MongoDB rs0 via three `mongo:7.0` services in `docker-compose.yml`, plus a one-shot init service running an idempotent `rs.initiate()` script.
- **Pros**: Matches `docs/03-mongodb.md` topology (3 nodes, rs0, no sharding); compose at repo root makes `docker compose up` from `/workspace` the obvious entrypoint; named Docker volumes keep nothing in the worktree.
- **Cons**: Heavier locally than a single Mongo node; compose hostnames (`mongo{1,2,3}`) won't match the eventual K8s StatefulSet hostnames (`gdfkube-mongo-{0,1,2}.gdfkube-mongo-svc`), introducing a parity gap.
- **Why chosen**: Honors the documented backend topology and keeps the demo runnable with zero install beyond Docker.

### Option B: Single-node replica set
- **Approach**: One `mongod --replSet rs0` container with `rs.initiate()` against itself.
- **Pros**: Simpler compose, lower resource use, faster startup; still produces an oplog for CDC.
- **Cons**: Diverges from the documented 3-node target; doesn't exercise election / member-state behavior; future Debezium tests would re-encounter multi-node issues that a 1-node setup can't surface.
- **Why not chosen**: User explicitly opted for parity with `docs/03-mongodb.md`.

### Option C: Bitnami `bitnami/mongodb` chart-style image with built-in rs init
- **Approach**: Use Bitnami's MongoDB image which includes replica-set bootstrap helpers via env vars.
- **Pros**: Less init scripting; opinionated defaults.
- **Cons**: Adds a vendor-specific image to a project otherwise pinned to upstream `library/*` images; behavioral surprises (Bitnami's UID handling, custom entrypoints) leak into the demo; harder to map 1:1 to a future K8s StatefulSet using upstream `mongo`.
- **Why not chosen**: Upstream `mongo:7.0` keeps the surface minimal and CDC-aligned with `docs/03-mongodb.md`.

## Agreed Approach

Option A. Multi-stage Dockerfile (`node:20-alpine` builder → `nginxinc/nginx-unprivileged:alpine` runtime on port 8080 with SPA-fallback), plus a 3-node `mongo:7.0` rs0 stack with a one-shot idempotent JS init container. Single repo-root `docker-compose.yml` wires both. No SPA→Mongo connection in this change.

## Key Decisions

- **D1 — Runtime image**: `nginxinc/nginx-unprivileged:alpine` (rootless, listens on 8080, no NET_BIND privileges needed). Fallback `nginx:alpine` if a constraint forbids non-`docker.io/library/*` images.
- **D2 — Builder image**: `node:20-alpine`, multi-stage to keep the runtime image free of `node_modules` and the Node toolchain.
- **D3 — Mongo image**: upstream `mongo:7.0` over Bitnami. Mirrors `docs/03-mongodb.md` (MongoDB 7.x).
- **D4 — Topology**: 3-node rs0 in compose, no arbiter, no sharding — mirrors documented K8s target.
- **D5 — Init**: idempotent JavaScript script (`init-rs.js`) executed by a one-shot `mongo:7.0` service that `depends_on: { condition: service_healthy }` for all three nodes; re-running it does not error.
- **D6 — Storage**: named Docker volumes (`mongo{1,2,3}-data`) over bind mounts so the worktree stays clean and `docker compose down -v` does a full reset.
- **D7 — Compose location**: repo root (`/workspace/docker-compose.yml`) so the demo entrypoint is `docker compose up` from where users naturally land.
- **D8 — Integration scope**: SPA does not connect to Mongo in this change. The ITSM service has no `MONGO_URL` and continues to read from in-memory seeds.
- **D9 — Port exposure**: bind to `127.0.0.1` only — `8080:8080` for ITSM, `27017:27017` for `mongo1` (local tooling). Other Mongo nodes are reachable only on the internal compose network.
- **D10 — File layout**: ITSM build artifacts under `gdfkube-src/gdfkube-itsm/`; Mongo init script and supporting README under a new `gdfkube-src/gdfkube-infra/mongodb/` directory; compose at repo root.

## Open Questions

- **Hostname parity gap with K8s**: documented and accepted as out-of-scope here; revisit when SPA/Debezium integration lands so the connection-string strategy can converge across compose and K8s targets.
- **CI image publishing**: intentionally not part of this change. If/when registry-pushed images are needed, a follow-up change will touch `.github/workflows/`.
