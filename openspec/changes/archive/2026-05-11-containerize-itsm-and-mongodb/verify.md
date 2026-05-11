# Verification — containerize-itsm-and-mongodb

## Environment

Verified inside the project devcontainer with Docker-from-Docker
(Docker 29.4.3, Compose v5.1.3, Docker socket shared from host).
Bind mounts use `COMPOSE_HOST_WORKSPACE` env variable to remap paths
from container `/workspace` to host path.

## Runtime verification results

### 4.1 — Build and start (PASS)

```
$ docker compose build   # exit 0
$ docker compose up -d   # exit 0
```

Both images (`gdfkube-itsm:local` and `workspace-gdfkube-itsm-api`)
build successfully. All services start in correct dependency order:
mongo1/2/3 → mongo-init → mongo-seed → gdfkube-itsm-api → itsm.

### 4.2 — All services healthy (PASS)

```
$ docker compose ps -a
NAME                           IMAGE                        STATUS                      PORTS
workspace-gdfkube-itsm-api-1   workspace-gdfkube-itsm-api   Up (healthy)                3000/tcp
workspace-itsm-1               gdfkube-itsm:local           Up (healthy)                127.0.0.1:8080->8080/tcp
workspace-mongo-init-1         mongo:7.0                    Exited (0)
workspace-mongo-seed-1         mongo:7.0                    Exited (0)
workspace-mongo1-1             mongo:7.0                    Up (healthy)                127.0.0.1:27017->27017/tcp
workspace-mongo2-1             mongo:7.0                    Up (healthy)                27017/tcp
workspace-mongo3-1             mongo:7.0                    Up (healthy)                27017/tcp
```

All long-running services healthy. Init containers exited 0.

### 4.3 — SPA-fallback (PASS)

```
$ docker exec workspace-itsm-1 wget -qO- http://127.0.0.1:8080/ | grep 'id="root"'
id="root"

$ docker exec workspace-itsm-1 wget -qO- http://127.0.0.1:8080/some/spa/deep/route | grep 'id="root"'
id="root"
```

Deep routes serve `index.html` via `try_files` SPA-fallback.

### 4.4 — Cache headers (PASS)

```
$ docker exec workspace-itsm-1 wget -qS http://127.0.0.1:8080/ -O /dev/null
  Cache-Control: no-cache

$ docker exec workspace-itsm-1 wget -qS http://127.0.0.1:8080/assets/index-BnzTKdAO.js -O /dev/null
  Cache-Control: public, max-age=31536000, immutable
```

- Root: `no-cache` (ensures fresh index.html on deploy).
- Hashed assets: `immutable` with 1-year max-age.

### 4.5 — Replica set (PASS)

```
$ docker compose exec -T mongo1 mongosh --quiet --eval 'rs.status().ok'
1

$ docker compose exec -T mongo1 mongosh --quiet --eval 'rs.status().members.length'
3

$ docker compose exec -T mongo1 mongosh --quiet --eval 'rs.status().members.map(m => m.stateStr).sort()'
["PRIMARY","SECONDARY","SECONDARY"]
```

Three-node rs0 replica set fully operational.

### 4.6 — Idempotency (PASS)

```
$ docker compose run --rm mongo-init
rs0 already initiated; nothing to do
# exit 0
```

Re-running `mongo-init` is a no-op; exits cleanly.

### 4.7 — Persistence (PASS)

```
$ docker compose exec -T mongo1 mongosh --quiet --eval 'db.getSiblingDB("gdfkube").smoke.insertOne({t:1})'
{ acknowledged: true, insertedId: ObjectId('...') }

$ docker compose restart mongo1
# waited 15s for re-election

$ docker compose exec -T mongo1 mongosh --quiet --eval 'db.getSiblingDB("gdfkube").smoke.countDocuments({})'
1
```

Data survives container restart (named volumes persist).

### 4.8 — Full reset (PASS)

```
$ docker compose down -v
# volumes removed

$ docker compose up -d
# full stack re-created from scratch

$ docker compose exec -T mongo1 mongosh --quiet --eval 'db.getSiblingDB("gdfkube").smoke.countDocuments({})'
0
```

`down -v` removes volumes; subsequent `up` starts with a clean slate.

### 4.9 — Pre-commit (PASS)

```
$ pre-commit run --all-files
TruffleHog...............................................................Passed
```

No secrets detected in any new files.

## Additional fixes during verification

1. **server/.dockerignore**: Removed `tsconfig.json` from exclusion list (needed by builder stage).
2. **server TypeScript errors**: Fixed `@types/express@5` compat issues (spread on `unknown`, pino-http import, `req.params` typing).
3. **seed-collections.js**: Replaced deprecated `cat()` with `fs.readFileSync()` for mongosh compatibility; added wait-for-primary loop.
4. **docker-compose.yml**: Added `${COMPOSE_HOST_WORKSPACE:-.}` prefix to bind mount paths for Docker-from-Docker devcontainer compatibility; changed mongo-seed entrypoint to use replica set connection string for primary-aware writes.

## Status

| Task | Result |
|------|--------|
| 1.1–1.3 | **complete** — files created and validated |
| 1.4 | **PASS** — image builds, serves on 8080, runs as non-root |
| 2.1–2.2 | **complete** — init-rs.js validated, README created |
| 3.1–3.4 | **complete** — compose config validated and runtime-tested |
| 4.1 | **PASS** — build + up -d succeed |
| 4.2 | **PASS** — all services healthy, init containers exit 0 |
| 4.3 | **PASS** — SPA fallback works for deep routes |
| 4.4 | **PASS** — cache headers correct |
| 4.5 | **PASS** — rs0 with 3 members, PRIMARY + 2×SECONDARY |
| 4.6 | **PASS** — idempotent, exits 0 with no error |
| 4.7 | **PASS** — data persists across restart |
| 4.8 | **PASS** — full reset clears all data |
| 4.9 | **PASS** — pre-commit clean |
