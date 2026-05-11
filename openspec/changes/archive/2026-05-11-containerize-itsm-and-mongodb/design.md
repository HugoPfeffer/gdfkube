## Context

`gdfkube-src/gdfkube-itsm/` is a React 18 + Vite 5 + TypeScript SPA (`gdfkube-src/gdfkube-itsm/package.json`, `vite.config.ts`) that today only builds locally — there is no shipped image. The wider `gdfkube` project (`docs/00-architecture-overview.md`, `docs/03-mongodb.md`) is K8s-targeted with a planned MongoDB → Debezium → Kafka → Camel pipeline, but **none** of those backend components have been implemented and **no** application Dockerfiles exist anywhere in the repo (only `.devcontainer/Dockerfile`).

This change introduces the project's first production-runtime artifacts:

1. A multi-stage container image that builds and serves the ITSM SPA on port 8080.
2. A locally runnable 3-node MongoDB `rs0` replica-set stack matching the topology described in `docs/03-mongodb.md`.

A repo-root `docker-compose.yml` brings both up so the demo can be exercised with `docker compose up`. The SPA is **not** wired to MongoDB in this change — it continues to read from in-memory seeds (`gdfkube-itsm/src/data/seeds.ts`) and ships with no `MONGO_URL` env var or fetch calls. Backend integration lands in a separate future change.

**Stakeholders / consumers**
- Solo developer (Hugo) running the demo locally.
- Future Debezium CDC work that will attach to the rs0 oplog.
- Future K8s manifests / Helm chart authoring (not in this change), which will reuse the same image and a StatefulSet-based variant of the same rs0 topology.

**Constraints**
- Must mirror `docs/03-mongodb.md` (MongoDB 7.x, replica set named `rs0`, three nodes, no sharding/arbiter, database `gdfkube`).
- Must not modify `docs/03-mongodb.md` "Implementation Status: Planned" — that note describes the K8s StatefulSet target, which remains future work.
- Existing CI (`.github/workflows/gdfkube-itsm-ci.yml`) must remain untouched; no image push/registry configuration in this change.
- Pre-commit hook (trufflehog) and `pre-commit run --all-files` must pass over all new files.

## Goals / Non-Goals

**Goals**
- `gdfkube-src/gdfkube-itsm/Dockerfile` produces a small, rootless, production image that serves the built SPA on port 8080 with SPA-fallback routing.
- A 3-node MongoDB `rs0` replica set stands up via compose with persistent volumes and an idempotent `rs.initiate()` step.
- A single `docker compose up` from `/workspace` brings the whole stack up; `docker compose down -v` cleans it.
- Mirrors the topology described in `docs/03-mongodb.md` so a future Debezium integration can hit a real oplog.
- All changes authored as a proper OpenSpec change under `openspec/changes/` per `CLAUDE.md`.

**Non-Goals**
- No Kubernetes manifests, no Helm chart, no ArgoCD Application — those follow in a separate change.
- No CI workflow changes (no image build/push). `.github/workflows/gdfkube-itsm-ci.yml` is untouched.
- No Express/Camel/Debezium/Kafka. Only the ITSM SPA image and Mongo rs0 stack.
- No SPA → Mongo wiring. The SPA's behavior is identical to today; only its packaging changes.
- No update to `docs/03-mongodb.md` "Implementation Status: Planned" — that section describes the K8s StatefulSet target.

## Decisions

### D1 — Runtime image: `nginxinc/nginx-unprivileged:alpine` over `nginx:alpine`
**Choice**: Official Nginx Inc. unprivileged variant — runs as UID 101, listens on 8080 by default, no `NET_BIND_SERVICE` needed.
**Alternatives**:
- `nginx:alpine` (Docker Hub `library/*`) + custom config that switches user to `nginx` and listens on 8080 — works but adds a config burden.
- Static-file servers like `node:20-alpine` running `serve` — heavier image, less battle-tested as an HTTP edge.
**Why**: rootless out of the box; trivially K8s-friendly later (most clusters disallow root containers).
**Fallback**: if a constraint forbids non-`docker.io/library/*` images we fall back to `nginx:alpine` with a custom user/port config — same behavioral contract.

### D2 — Multi-stage build with `node:20-alpine` builder
**Choice**: `node:20-alpine` builder stage runs `npm ci` and `npm run build`; only the resulting `dist/` is copied into the runtime stage.
**Alternatives**: single-stage `node:20-alpine` running `serve` (much larger final image, includes node_modules and toolchain).
**Why**: keeps the runtime image small and free of source/build tooling; `node:20-alpine` is the smallest mainstream Node 20 base and matches the existing `.devcontainer` Node version.

### D3 — Upstream `mongo:7.0` over Bitnami
**Choice**: `docker.io/library/mongo:7.0`.
**Alternatives**: `bitnami/mongodb` with built-in replica-set bootstrap helpers.
**Why**: stays on upstream `library/*` images, which keeps behavior predictable and maps 1:1 to a future K8s StatefulSet built on the same image; avoids vendor-specific UID/entrypoint surprises that would leak into the demo.

### D4 — Three-node rs0 in compose, no arbiter, no sharding
**Choice**: three full data-bearing members (`mongo1`, `mongo2`, `mongo3`).
**Alternatives**: single-node replica set (`mongod --replSet rs0` with `rs.initiate()` against itself) — lighter, still produces an oplog; primary + secondary + arbiter — also lighter but uneven for CDC testing.
**Why**: mirrors `docs/03-mongodb.md` exactly; exercises election and member-state behavior so future Debezium tests don't re-encounter multi-node issues a 1-node setup can't surface.
**Trade-off**: ~3× the local resource use of a single-node rs.

### D5 — Idempotent JS init via a one-shot `mongo:7.0` service
**Choice**: `mongo-init` service (`restart: "no"`) `depends_on` all three nodes with `condition: service_healthy`, runs `mongosh /scripts/init-rs.js`. The script reads `rs.status().ok` first; if `1`, exit 0; otherwise call `rs.initiate({_id:"rs0", members:[{_id:0,host:"mongo1:27017"},{_id:1,host:"mongo2:27017"},{_id:2,host:"mongo3:27017"}]})`. Script is bind-mounted read-only.
**Alternatives**: a shell script with `mongosh --eval`; entrypoint init baked into a custom Mongo image; manual one-time `rs.initiate()` after first run.
**Why**: idempotency means re-running `docker compose up` (or `docker compose run --rm mongo-init`) never errors. JS over shell because the result-checking logic is more readable in a single `.js` file and runs natively under `mongosh`.

### D6 — Named Docker volumes over bind mounts
**Choice**: `mongo1-data`, `mongo2-data`, `mongo3-data` mounted at `/data/db`.
**Alternatives**: bind mounts to `./.mongo-data/{1,2,3}` so data is browsable from the host.
**Why**: keeps the worktree clean (no host paths leaking, no git-ignore juggling); `docker compose down -v` does a true full reset.

### D7 — `docker-compose.yml` at repo root
**Choice**: `/workspace/docker-compose.yml`.
**Alternatives**: under `gdfkube-src/` or in a new `deploy/` directory.
**Why**: `docker compose up` from where users naturally land is the most discoverable entrypoint; keeps the demo command boring.

### D8 — No SPA → Mongo wiring this change
**Choice**: ITSM service has no `MONGO_URL` env, no fetch calls, no client driver bundled.
**Alternatives**: pre-wire a placeholder client now.
**Why**: avoids dead code and keeps the SPA's behavior identical to today; integration is its own design problem (auth, schema, hostnames in compose vs K8s) and deserves its own change.

### D9 — Port bindings on `127.0.0.1` only
**Choice**: `127.0.0.1:8080:8080` and `127.0.0.1:27017:27017`.
**Alternatives**: bind on `0.0.0.0`.
**Why**: prevents accidentally exposing the demo on a developer's LAN; trufflehog/secret-scan posture is moot here, but a default-loopback bind is simply the safer demo default.

### D10 — File layout
**Choice**:
- ITSM image artifacts under `gdfkube-src/gdfkube-itsm/` (next to the SPA they package).
- Mongo init artifacts under a new `gdfkube-src/gdfkube-infra/mongodb/` directory (sibling to the existing `gdfkube-src/gdfkube-infra/`).
- `docker-compose.yml` at repo root.
**Why**: matches the project's `gdfkube-src/{component}` convention from `CLAUDE.md` and keeps each component's runtime config co-located with its source.

## Risks / Trade-offs

- **CDC realism caveat**: the compose `rs0` does have an oplog (so a future Debezium connector can attach), but the topology hostnames differ from the eventual K8s StatefulSet (`gdfkube-mongo-{0,1,2}.gdfkube-mongo-svc:27017`) — compose uses `mongo{1,2,3}:27017`. → **Mitigation**: when the SPA/Debezium integration lands, introduce a connection-string env var instead of a literal so compose and K8s both resolve cleanly. Documented as an Open Question, not blocking here.
- **Local resource use**: three full Mongo members + one Nginx container is heavier than a 1-node setup. → **Mitigation**: this is a deliberate parity choice; if it becomes painful for low-RAM dev machines, a `compose.override.yml` can drop `mongo2`/`mongo3` for a single-node-rs profile without changing the spec.
- **`nginxinc/nginx-unprivileged:alpine` registry**: official Nginx Inc. variant but not on `docker.io/library/*`. → **Mitigation**: D1 fallback to `nginx:alpine` with a custom config switching user/port — captured in Open Questions if the constraint surfaces.
- **Healthcheck false-positives**: `mongosh ... db.adminCommand('ping').ok` returns 1 even before rs is initiated, so `mongo-init` could race the readiness window. → **Mitigation**: the init script is *idempotent* and explicitly checks `rs.status().ok` first, so a no-op re-run on a successful round-trip is the worst case.
- **Persistence vs reset confusion**: developers may run `docker compose down` (keeps volumes) and wonder why old data persists. → **Mitigation**: `gdfkube-src/gdfkube-infra/mongodb/README.md` calls out the difference between `down` and `down -v`.

## Migration Plan

**Deploy**: this is additive — every file is new. There is no migration of data, schema, or configuration. `docker compose build && docker compose up -d` is the deploy command. No production system, no consumers, no Kafka topics, no Helm values are touched.

**Rollback**: delete the new files. Specifically:
- `gdfkube-src/gdfkube-itsm/Dockerfile`
- `gdfkube-src/gdfkube-itsm/.dockerignore`
- `gdfkube-src/gdfkube-itsm/nginx.conf`
- `gdfkube-src/gdfkube-infra/mongodb/init-rs.js`
- `gdfkube-src/gdfkube-infra/mongodb/README.md`
- `docker-compose.yml`

Pre-existing source (`gdfkube-itsm/src/**`, `gdfkube-itsm/package.json`, `vite.config.ts`, etc.) is untouched, so the SPA continues to build and run via `npm run dev` / `npm run build` exactly as before. There are no schema changes, no Kafka consumer-group rebalances, and no Helm value migrations to worry about.

## Open Questions

- **Image registry constraint** — if the team later forbids non-`docker.io/library/*` images, switch the runtime base from `nginxinc/nginx-unprivileged:alpine` to `nginx:alpine` with a custom config. No spec impact; only a Dockerfile and `nginx.conf` change.
- **Connection-string strategy across compose vs K8s** — to be resolved when the SPA → Mongo wiring change is proposed; will likely introduce a `MONGO_URL` env var with compose-default `mongodb://mongo1:27017,mongo2:27017,mongo3:27017/gdfkube?replicaSet=rs0`.
- **Image publishing** — out of scope here. A follow-up change can introduce a GitHub Actions workflow that builds and pushes the ITSM image to GHCR (or another registry) on tag.
