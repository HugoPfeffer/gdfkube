# Containerize ITSM + Local MongoDB rs0 Stack — Implementation Plan

> **For agentic workers:** Use `superpowers:subagent-driven-development` to implement this plan task-by-task.

**Goal:** Ship the project's first production-runtime artifacts — a rootless ITSM SPA container image and a 3-node MongoDB `rs0` stack — wired together by a single repo-root `docker-compose.yml`, with no SPA → Mongo integration in this change.

**Architecture:** Multi-stage Dockerfile (`node:20-alpine` builder → `nginxinc/nginx-unprivileged:alpine` runtime on port 8080 with SPA-fallback) for the ITSM SPA; three `mongo:7.0` services (`mongo1`/`mongo2`/`mongo3`) named-volume-backed and bridged on `gdfkube-net`; a one-shot `mongo-init` service runs an idempotent `rs.initiate(...)` JS script after all three are healthy. Refer to `design.md` for decision rationale and `specs/itsm-container-image/spec.md` + `specs/mongodb-replica-set-stack/spec.md` for the testable contract.

**Tech Stack:** Docker, Docker Compose v2, Nginx (`nginxinc/nginx-unprivileged:alpine`), Node 20 (build only), MongoDB 7.0, `mongosh`.

---

## Task 1: ITSM build context hygiene

- [ ] **Step 1:** Create `gdfkube-src/gdfkube-itsm/.dockerignore` with one line per pattern: `node_modules`, `dist`, `.git`, `e2e/`, `playwright-report/`, `test-results/`, `coverage/`, `.env*`, `*.md`.
- [ ] **Step 2:** Verify the build context shrinks: from `gdfkube-src/gdfkube-itsm/`, run `docker build --no-cache --progress=plain -f - . <<'EOF'\nFROM busybox\nCOPY . /ctx\nRUN du -sh /ctx\nEOF` and confirm the printed size is in the low-MB range (no `node_modules` blowup).
- [ ] **Commit point:** `chore(itsm): add .dockerignore for build context hygiene`.

## Task 2: Nginx runtime config

- [ ] **Step 1:** Write `gdfkube-src/gdfkube-itsm/nginx.conf` with: `server { listen 8080; server_name _; root /usr/share/nginx/html; index index.html; ... }`. Inside the server block: a `location /assets/` block that adds `Cache-Control: public, max-age=31536000, immutable`; a `location = /index.html` block that adds `Cache-Control: no-cache`; a fallback `location /` with `try_files $uri $uri/ /index.html`. Enable `gzip on; gzip_types text/plain text/css application/javascript application/json image/svg+xml;`.
- [ ] **Step 2:** Lint the config syntactically: `docker run --rm -v "$PWD/gdfkube-src/gdfkube-itsm/nginx.conf:/etc/nginx/conf.d/default.conf:ro" nginxinc/nginx-unprivileged:alpine nginx -t`.

## Task 3: ITSM Dockerfile (multi-stage)

- [ ] **Step 1:** Create `gdfkube-src/gdfkube-itsm/Dockerfile`:
  - `FROM node:20-alpine AS builder` — `WORKDIR /app`; `COPY package.json package-lock.json ./`; `RUN npm ci`; `COPY . .`; `RUN npm run build`.
  - `FROM nginxinc/nginx-unprivileged:alpine AS runtime` — `COPY --from=builder /app/dist /usr/share/nginx/html`; `COPY nginx.conf /etc/nginx/conf.d/default.conf`; `EXPOSE 8080`; `HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD wget -qO- http://127.0.0.1:8080/ >/dev/null 2>&1 || exit 1`.
- [ ] **Step 2:** Build it: `docker build -t gdfkube-itsm:test gdfkube-src/gdfkube-itsm`. Confirm exit code 0.
- [ ] **Step 3:** Smoke run: `docker run --rm -d --name itsm-smoke -p 127.0.0.1:8080:8080 gdfkube-itsm:test`; wait 5s; `curl -fsS http://127.0.0.1:8080/ | grep -q 'id="root"'`; `curl -fsS http://127.0.0.1:8080/some/spa/deep/route | grep -q 'id="root"'`; `docker exec itsm-smoke id -u` must print a non-zero UID (e.g. `101`); `docker rm -f itsm-smoke`.
- [ ] **Commit point:** `feat(itsm): add multi-stage Dockerfile and nginx config`.

## Task 4: MongoDB init script

- [ ] **Step 1:** Create `gdfkube-src/gdfkube-infra/mongodb/init-rs.js`:
  ```js
  // Idempotent initiation of replica set rs0.
  let alreadyInitiated = false;
  try { alreadyInitiated = rs.status().ok === 1; } catch (e) { alreadyInitiated = false; }
  if (alreadyInitiated) { print("rs0 already initiated; nothing to do"); quit(0); }
  const result = rs.initiate({
    _id: "rs0",
    members: [
      { _id: 0, host: "mongo1:27017" },
      { _id: 1, host: "mongo2:27017" },
      { _id: 2, host: "mongo3:27017" },
    ],
  });
  if (result.ok !== 1) { print("rs.initiate failed: " + JSON.stringify(result)); quit(1); }
  print("rs0 initiated");
  ```
- [ ] **Step 2:** Lint by running it against a dummy single-node Mongo container if available: `docker run --rm -d --name mongo-lint mongo:7.0 mongod --replSet rs0 --bind_ip_all`; `docker run --rm --network container:mongo-lint -v "$PWD/gdfkube-src/gdfkube-infra/mongodb/init-rs.js:/scripts/init-rs.js:ro" mongo:7.0 mongosh --host 127.0.0.1:27017 /scripts/init-rs.js`. (Skip if local Docker bandwidth is constrained — full verification happens in Task 7.) Tear down with `docker rm -f mongo-lint`.

## Task 5: MongoDB infra README

- [ ] **Step 1:** Create `gdfkube-src/gdfkube-infra/mongodb/README.md` (one screen) covering: purpose of this directory, why `rs0` is mandatory (CDC oplog requirement) with a cross-link to `docs/03-mongodb.md`, what `mongo-init` does and why it is idempotent, and the difference between `docker compose down` (keeps named volumes) and `docker compose down -v` (full reset).
- [ ] **Commit point:** `feat(infra): add mongodb rs0 init script and README`.

## Task 6: Repo-root `docker-compose.yml`

- [ ] **Step 1:** Create `/workspace/docker-compose.yml` with top-level keys `services`, `networks`, `volumes`. Define network `gdfkube-net: { driver: bridge }`. Define volumes `mongo1-data`, `mongo2-data`, `mongo3-data` (defaults).
- [ ] **Step 2:** Define `itsm` service: `build: ./gdfkube-src/gdfkube-itsm`, `image: gdfkube-itsm:local`, `restart: unless-stopped`, `ports: ["127.0.0.1:8080:8080"]`, `networks: [gdfkube-net]`, `healthcheck` mirroring the Dockerfile healthcheck.
- [ ] **Step 3:** Define each `mongoN` service (loop conceptually for `N ∈ {1,2,3}`): `image: mongo:7.0`, `command: ["mongod", "--replSet", "rs0", "--bind_ip_all"]`, `volumes: ["mongoN-data:/data/db"]`, `networks: [gdfkube-net]`, `healthcheck: { test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand('ping').ok"], interval: 10s, timeout: 5s, retries: 5, start_period: 20s }`. Only `mongo1` adds `ports: ["127.0.0.1:27017:27017"]`.
- [ ] **Step 4:** Define `mongo-init`: `image: mongo:7.0`, `restart: "no"`, `depends_on: { mongo1: { condition: service_healthy }, mongo2: { condition: service_healthy }, mongo3: { condition: service_healthy } }`, `networks: [gdfkube-net]`, `volumes: ["./gdfkube-src/gdfkube-infra/mongodb/init-rs.js:/scripts/init-rs.js:ro"]`, `entrypoint: ["mongosh", "--host", "mongo1:27017", "/scripts/init-rs.js"]`.
- [ ] **Step 5:** `docker compose config` MUST parse without error. Fix any keys flagged.
- [ ] **Commit point:** `feat: add repo-root docker-compose for itsm + mongodb rs0`.

## Task 7: End-to-end verification (per `superpowers:verification-before-completion`)

- [ ] **Step 1:** `docker compose build` — exit 0; capture into `verify.md`.
- [ ] **Step 2:** `docker compose up -d` — exit 0.
- [ ] **Step 3:** Wait until `docker compose ps` reports `itsm`, `mongo1`, `mongo2`, `mongo3` as `healthy` and `mongo-init` exited with code 0.
- [ ] **Step 4:** `curl -fsS http://127.0.0.1:8080/ | grep -q 'id="root"'`; `curl -fsS http://127.0.0.1:8080/some/spa/deep/route | grep -q 'id="root"'`.
- [ ] **Step 5:** `curl -sI http://127.0.0.1:8080/` includes `Cache-Control: no-cache`; `curl -sI http://127.0.0.1:8080/assets/$(docker compose exec -T itsm sh -c 'ls /usr/share/nginx/html/assets | head -1')` includes `max-age=31536000` and `immutable`.
- [ ] **Step 6:** `docker compose exec -T mongo1 mongosh --quiet --eval 'rs.status().ok'` → `1`; `... 'rs.status().members.length'` → `3`; `... 'JSON.stringify(rs.status().members.map(m=>m.stateStr).sort())'` → `["PRIMARY","SECONDARY","SECONDARY"]`.
- [ ] **Step 7:** `docker compose run --rm mongo-init` exits 0 with no `already initialized` error.
- [ ] **Step 8:** `docker compose exec -T mongo1 mongosh --quiet gdfkube --eval 'db.smoke.insertOne({k:1})'`; `docker compose restart mongo1`; wait `healthy`; `... 'db.smoke.countDocuments({k:1})'` → `1`.
- [ ] **Step 9:** `docker compose down -v && docker compose up -d`; once `mongo-init` has exited 0, `... 'db.smoke.countDocuments({})'` → `0`.
- [ ] **Step 10:** Paste stdout for every step into `openspec/changes/containerize-itsm-and-mongodb/verify.md`.
- [ ] **Step 11:** `pre-commit run --all-files` exits 0.
- [ ] **Commit point:** `chore: capture verify.md for containerize-itsm-and-mongodb`.

## Rollback

This change is purely additive. To roll back, delete the new files and the change is reversed:

- `gdfkube-src/gdfkube-itsm/Dockerfile`
- `gdfkube-src/gdfkube-itsm/.dockerignore`
- `gdfkube-src/gdfkube-itsm/nginx.conf`
- `gdfkube-src/gdfkube-infra/mongodb/init-rs.js`
- `gdfkube-src/gdfkube-infra/mongodb/README.md`
- `docker-compose.yml`

No pre-existing source is modified. The SPA continues to build and run via `npm run dev` / `npm run build` exactly as before. There are no schema migrations, no Kafka consumer-group rebalances, no Helm value migrations, and no production system to drain.
