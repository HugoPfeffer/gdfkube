# Plan — Containerize gdfkube-itsm + provide a MongoDB rs0 container stack

## Context

`gdfkube-src/gdfkube-itsm/` is a buildable React 18 + Vite + TypeScript SPA (see `package.json`, `vite.config.ts`) that today only ships as source — there is no production-runnable artifact. The wider `gdfkube` project is Kubernetes-targeted with a documented MongoDB-rs0 → Debezium → Kafka → Camel pipeline (`docs/03-mongodb.md`, `docs/00-architecture-overview.md`), but **none** of those backend components have been implemented yet, and **no** application Dockerfiles exist anywhere in the repo (only `.devcontainer/Dockerfile`).

This change introduces the first production-runtime artifacts for the project:

1. A container image that builds and serves the ITSM SPA.
2. A locally runnable 3-node MongoDB replica-set (`rs0`) stack matching `docs/03-mongodb.md`.

A repo-root `docker-compose.yml` brings both up so the demo can be exercised with `docker compose up`.

**Out of scope (explicitly):** wiring the SPA to MongoDB. The SPA today reads only from in-memory seeds (`src/data/seeds.ts`) and the container ships with no `MONGO_URL`, no fetch calls. Backend wiring lands in a separate future change. Kubernetes manifests, Helm charts, ArgoCD applications, and CI image-build/publish are also out of scope.

## Goals / Non-goals

**Goals**
- `gdfkube-src/gdfkube-itsm/Dockerfile` produces a small, rootless, production image that serves the built SPA on port 8080 with SPA-fallback routing.
- A 3-node MongoDB `rs0` replica set stands up via compose with persistent volumes and an idempotent `rs.initiate()` step.
- A single `docker compose up` from the repo root brings the whole stack up; `docker compose down -v` cleans it.
- Mirrors the topology described in `docs/03-mongodb.md` (MongoDB 7.x, replica set named `rs0`, no sharding, no arbiter) so a future Debezium integration can hit a real oplog.
- All changes authored as a proper OpenSpec change under `openspec/changes/` per CLAUDE.md.

**Non-goals**
- No Kubernetes manifests, no Helm chart, no ArgoCD Application — those follow in a separate spec.
- No CI workflow changes (no image build/push). The existing `.github/workflows/gdfkube-itsm-ci.yml` is untouched.
- No Express/Camel/Debezium/Kafka. Only the two containers requested.
- No SPA → Mongo wiring. The SPA's behavior is identical to today; only its packaging changes.
- No update to `docs/03-mongodb.md` "Implementation Status: Planned" — that doc describes the K8s StatefulSet target, which remains future work.

## Architecture

### Container 1 — ITSM SPA

Multi-stage Dockerfile in `gdfkube-src/gdfkube-itsm/Dockerfile`:

- **Stage `builder`** (`node:20-alpine`): `COPY package*.json`, `npm ci`, `COPY .` (with `.dockerignore` excluding `node_modules`, `dist`, `.git`, `e2e`, etc.), `npm run build` → `/app/dist`.
- **Stage `runtime`** (`nginxinc/nginx-unprivileged:alpine` — official, runs as UID 101, listens on 8080 by default, no root needed): copy `nginx.conf` to `/etc/nginx/conf.d/default.conf`, copy `--from=builder /app/dist` to `/usr/share/nginx/html`. `EXPOSE 8080`. Health check via `wget -qO- http://127.0.0.1:8080/` (busybox wget ships in the image).

Companion files:
- `gdfkube-src/gdfkube-itsm/nginx.conf` — minimal config: `listen 8080`, `root /usr/share/nginx/html`, `try_files $uri $uri/ /index.html` for SPA-fallback, `gzip on` for text types, long-cache headers for `/assets/*` (Vite hashes filenames) and `Cache-Control: no-cache` for `/index.html`.
- `gdfkube-src/gdfkube-itsm/.dockerignore` — excludes `node_modules`, `dist`, `.git`, `e2e/`, `playwright-report/`, `test-results/`, `coverage/`, `.env*`, `*.md`.

### Containers 2–4 + init — MongoDB rs0

Defined directly in `docker-compose.yml` using upstream `mongo:7.0` — no custom Dockerfile needed for Mongo:

- `mongo1`, `mongo2`, `mongo3`: each runs `mongod --replSet rs0 --bind_ip_all`, mounts a named volume (`mongo1-data`, `mongo2-data`, `mongo3-data`) at `/data/db`, and exposes port 27017 only on the internal compose network. `mongo1` additionally maps host `127.0.0.1:27017` for local dev tooling. Each service has a healthcheck running `mongosh --quiet --eval "db.adminCommand('ping').ok"`.
- `mongo-init`: a one-shot `mongo:7.0` service (`restart: "no"`) that `depends_on` all three with `condition: service_healthy`, then runs an idempotent script: if `rs.status().ok != 1`, call `rs.initiate({_id: "rs0", members: [{_id:0, host:"mongo1:27017"}, {_id:1, host:"mongo2:27017"}, {_id:2, host:"mongo3:27017"}]})`; otherwise exit 0. Script lives at `gdfkube-src/gdfkube-infra/mongodb/init-rs.js` and is bind-mounted read-only into the init container.

### docker-compose.yml (repo root)

- Services: `itsm`, `mongo1`, `mongo2`, `mongo3`, `mongo-init`.
- Single network `gdfkube-net` (bridge) for service discovery by name.
- Named volumes: `mongo1-data`, `mongo2-data`, `mongo3-data` (Docker-managed, no host bind so nothing leaks into the worktree).
- Port bindings (all to `127.0.0.1` only): `8080:8080` for ITSM, `27017:27017` for mongo1.
- `itsm` has no `MONGO_URL` env — integration is out of scope.

## Files created or modified

**Source artifacts (new):**
- `gdfkube-src/gdfkube-itsm/Dockerfile`
- `gdfkube-src/gdfkube-itsm/.dockerignore`
- `gdfkube-src/gdfkube-itsm/nginx.conf`
- `gdfkube-src/gdfkube-infra/mongodb/init-rs.js`
- `gdfkube-src/gdfkube-infra/mongodb/README.md` (one-screen explanation of the init flow + why rs0 is mandatory, cross-linking `docs/03-mongodb.md`)
- `docker-compose.yml` (repo root)

**OpenSpec change (new):** `openspec/changes/2026-05-06-containerize-itsm-and-mongodb/`
- `README.md` — one-line title.
- `brainstorm.md` — captures the user choices already made (compose scope, nginx multi-stage, 3-node rs0, file layout).
- `proposal.md` — Why / What Changes / Capabilities (New: `itsm-container-image`, `mongodb-replica-set-stack`; Modified: none) / Impact, mirroring the structure used in `openspec/changes/archive/2026-05-06-build-itsm-portal/proposal.md`.
- `design.md` — Context / Goals & Non-Goals / Decisions (D1 nginx-unprivileged on 8080, D2 multi-stage build with node:20-alpine, D3 upstream `mongo:7.0` over Bitnami, D4 3-node rs0 in compose mirroring `docs/03-mongodb.md`, D5 idempotent JS init over shell, D6 named volumes over bind mounts, D7 compose at repo root, D8 no SPA→Mongo wiring this change) / Risks / Migration / Open Questions.
- `specs/itsm-container-image/spec.md` — `### Requirement:` + `#### Scenario:` (Given/When/Then) covering: image builds from source, image runs rootless on 8080, SPA-fallback returns `index.html` for unknown routes, `/assets/*` cache headers, healthcheck succeeds.
- `specs/mongodb-replica-set-stack/spec.md` — covers: stack starts with three `mongod` processes, `rs.status().ok === 1` after init completes, three members with one PRIMARY and two SECONDARY, data persists across `docker compose restart` (volume-backed), init is idempotent (re-running the init service does not error).
- `tasks.md` — numbered groups with checkboxes:
  1. ITSM image (Dockerfile, .dockerignore, nginx.conf)
  2. MongoDB stack (init-rs.js, infra README)
  3. Compose wiring (docker-compose.yml)
  4. Verification (run the commands in §Verification, paste output into `verify.md`)
- `plan.md` — short execution-order summary of `tasks.md` plus rollback (just delete the new files; nothing existing is modified).
- `verify.md` — empty skeleton; filled with command output during execution per the `superpowers:verification-before-completion` skill.
- `retrospective.md` — empty skeleton; filled at archive time.

**Existing files referenced (read-only):**
- `gdfkube-src/gdfkube-itsm/package.json` — confirms `npm run build` script and React 18 / Vite 5.
- `gdfkube-src/gdfkube-itsm/vite.config.ts` — confirms `dist/` output dir.
- `docs/03-mongodb.md` — source of truth for MongoDB version (7.x), replica-set name (`rs0`), topology (3 nodes, no sharding, no arbiter), database name (`gdfkube`).
- `openspec/changes/archive/2026-05-06-build-itsm-portal/{proposal,design,tasks}.md` and `specs/*/spec.md` — structural template for the new OpenSpec change.

## Verification

End-to-end check, run from `/workspace`:

```bash
docker compose build
docker compose up -d
docker compose ps   # itsm, mongo1, mongo2, mongo3 = healthy; mongo-init = exited 0

# SPA serves and SPA-fallback works
curl -fsS http://127.0.0.1:8080/ | grep -q 'id="root"'
curl -fsS http://127.0.0.1:8080/some/spa/deep/route | grep -q 'id="root"'

# Replica set is up with 3 members and exactly one PRIMARY
docker compose exec -T mongo1 mongosh --quiet --eval 'rs.status().ok'                              # 1
docker compose exec -T mongo1 mongosh --quiet --eval 'rs.status().members.length'                  # 3
docker compose exec -T mongo1 mongosh --quiet --eval \
  'JSON.stringify(rs.status().members.map(m => m.stateStr).sort())'                                # ["PRIMARY","SECONDARY","SECONDARY"]

# Init is idempotent
docker compose run --rm mongo-init                                                                 # exits 0, no rs.initiate error

# Persistence: data survives a restart
docker compose exec -T mongo1 mongosh --quiet gdfkube --eval 'db.smoke.insertOne({k:1})'
docker compose restart mongo1
docker compose exec -T mongo1 mongosh --quiet gdfkube --eval 'db.smoke.countDocuments({k:1})'      # 1

# Cleanup
docker compose down -v
```

The OpenSpec `verify.md` will capture the actual stdout for each of these commands per `superpowers:verification-before-completion`.

## Risks & open considerations

- **`nginxinc/nginx-unprivileged:alpine`** is the official Nginx Inc. unprivileged variant; if a constraint forbids non-`docker.io/library/*` images, fall back to `nginx:alpine` plus a custom config that runs as the `nginx` user on 8080 (slightly more setup, same outcome).
- **3-node rs0 in compose** is heavier than a single-node-rs but the user explicitly chose it to mirror `docs/03-mongodb.md` and keep parity with the eventual K8s topology.
- **CDC realism caveat:** the compose `rs0` does have an oplog (so future Debezium can attach), but the topology differs from K8s StatefulSet hostnames (`gdfkube-mongo-{0,1,2}.gdfkube-mongo-svc:27017`). The compose connection string uses `mongo{1,2,3}:27017`. This is documented in `design.md` as a known parity gap — acceptable because integration is out of scope here.
- **No CI image build** is intentional; if Hugo wants registry-pushed images later, that's a follow-up change touching `.github/workflows/`.
