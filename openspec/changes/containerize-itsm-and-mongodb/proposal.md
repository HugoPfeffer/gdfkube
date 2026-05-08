## Why

`gdfkube-src/gdfkube-itsm/` is a buildable Vite SPA with no production-runnable artifact today, and the documented MongoDB → Debezium → Kafka → Camel pipeline (`docs/00-architecture-overview.md`, `docs/03-mongodb.md`) has no implementation yet. The repo has zero application Dockerfiles. To unblock end-to-end demos, future Debezium CDC work, and eventual K8s manifests, the project needs (1) a runnable image of the ITSM SPA and (2) a local MongoDB `rs0` replica set that mirrors the documented topology so a real oplog exists for Debezium to attach to later.

## What Changes

**Production runtime artifact for ITSM SPA (new)**
- From: source-only build via `npm run build` with no shipped image.
- To: multi-stage `Dockerfile` (`node:20-alpine` builder → rootless `nginxinc/nginx-unprivileged:alpine` runtime on port 8080) at `gdfkube-src/gdfkube-itsm/Dockerfile`, with a minimal `nginx.conf` providing SPA-fallback routing and asset cache headers, plus a `.dockerignore`.
- Reason: enables containerized demos and is a prerequisite for any future K8s deployment.
- Impact: non-breaking (source build path unchanged); adds new files only.

**Local MongoDB rs0 replica set (new)**
- From: no MongoDB infrastructure of any kind in the repo.
- To: 3-node `mongo:7.0` replica set named `rs0` with named volumes (`mongo{1,2,3}-data`) and a one-shot init service running an idempotent `rs.initiate()` from `gdfkube-src/gdfkube-infra/mongodb/init-rs.js`.
- Reason: matches `docs/03-mongodb.md` (MongoDB 7.x, rs0, three nodes, no sharding/arbiter) so future Debezium CDC has a real oplog to read.
- Impact: non-breaking; introduces a new `gdfkube-src/gdfkube-infra/mongodb/` directory.

**Repo-root compose entrypoint (new)**
- From: no `docker-compose.yml` in the repo.
- To: `docker-compose.yml` at `/workspace` defining `itsm`, `mongo1`, `mongo2`, `mongo3`, `mongo-init`; one bridge network `gdfkube-net`; ports bound to `127.0.0.1` only (`8080:8080` for ITSM, `27017:27017` for `mongo1`).
- Reason: gives the demo a single `docker compose up` entrypoint; `docker compose down -v` cleans state fully.
- Impact: non-breaking; the SPA still has no `MONGO_URL` and continues reading from in-memory seeds — backend integration is explicitly out of scope.

## Capabilities

### New Capabilities
- `itsm-container-image`: the build/runtime contract for the ITSM SPA container — multi-stage build, rootless runtime on port 8080, SPA-fallback routing, asset cache headers, healthcheck.
- `mongodb-replica-set-stack`: the local Mongo `rs0` topology contract — three `mongod` processes, idempotent replica-set initiation, persistent volume-backed data, 3 members with one PRIMARY and two SECONDARY post-init.

### Modified Capabilities
None — no existing specs are altered. (`docs/03-mongodb.md` is documentation, not an OpenSpec spec, and its "Implementation Status: Planned" note correctly describes the still-future K8s StatefulSet target.)

## Impact

**Code & files (new only)**
- `gdfkube-src/gdfkube-itsm/Dockerfile`
- `gdfkube-src/gdfkube-itsm/.dockerignore`
- `gdfkube-src/gdfkube-itsm/nginx.conf`
- `gdfkube-src/gdfkube-infra/mongodb/init-rs.js`
- `gdfkube-src/gdfkube-infra/mongodb/README.md`
- `docker-compose.yml` (repo root)

**Pinned dependencies (image tags)**
- `node:20-alpine` (builder) — aligns with `gdfkube-itsm/package.json` `engines`/Vite 5 expectations.
- `nginxinc/nginx-unprivileged:alpine` (runtime) — official Nginx Inc. unprivileged variant; fallback `nginx:alpine` if a registry constraint forbids non-`docker.io/library/*` images.
- `mongo:7.0` — matches `docs/03-mongodb.md` MongoDB 7.x.
No version conflicts with the existing stack (no prior images shipped).

**APIs / endpoints / topics / consumers**
- New local endpoints: ITSM at `http://127.0.0.1:8080/`, Mongo at `mongodb://127.0.0.1:27017/?replicaSet=rs0` (local-only).
- No HTTP API contracts change. No Kafka topics created (Debezium not in scope). No downstream consumers exist yet.

**Testing strategy**
- *Unit*: none — there is no application code change; only image/compose configuration.
- *Integration / runtime verification*: end-to-end `docker compose build && up -d` with assertions on (a) ITSM serving `index.html` at `/` and at deep SPA routes via SPA-fallback, (b) `rs.status().ok === 1` with three members and exactly one PRIMARY, (c) idempotency of `mongo-init` on re-run, (d) data persistence across `docker compose restart mongo1`. Captured as command output in `verify.md` per the `superpowers:verification-before-completion` skill.
- *Contract*: not applicable — no producer/consumer pair is wired in this change.

**Out of scope (explicit non-impact)**
- No Kubernetes manifests, Helm charts, or ArgoCD applications.
- No CI workflow changes; `.github/workflows/gdfkube-itsm-ci.yml` is untouched, no image is pushed to a registry.
- No SPA → MongoDB wiring; ITSM behavior is identical to today.
- No Express, Camel, Debezium, or Kafka components.
