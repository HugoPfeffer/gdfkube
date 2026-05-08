# Verification — containerize-itsm-and-mongodb

## Environment

Docker daemon is unavailable in the Cursor cloud agent / devcontainer
(seccomp blocks user namespaces, no root access). Static validation was
performed instead; runtime verification requires a Docker-capable host.

## Static verification results

### Compose config syntax (PASS)

```
$ docker compose config   # exit 0
```

`docker compose config` parsed and resolved all five services, three volumes,
and the bridge network without errors.

### ITSM npm build (PASS)

```
$ npm ci          # exit 0
$ npm run build   # exit 0, vite v5.4.21
```

Produces `dist/` with:

- `index.html` — contains `<div id="root"></div>` (SPA mount point)
- `assets/index-Dndo215X.js` (260 kB)
- `assets/index-Dk5c-rT5.css` (30 kB)
- `favicon.svg`, `icons.svg`

Content-hashed asset filenames confirm Vite fingerprinting works.

### Dockerfile analysis (PASS)

- Builder stage: `node:20-alpine`, `npm ci`, `npm run build` — verified locally.
- Runtime stage: `nginxinc/nginx-unprivileged:alpine` — non-root UID.
- `COPY --from=builder /app/dist /usr/share/nginx/html` — matches `nginx.conf` root.
- `COPY nginx.conf /etc/nginx/conf.d/default.conf` — correct nginx include path.
- `EXPOSE 8080` — matches `listen 8080` in nginx.conf.
- `HEALTHCHECK` via wget — targets same port and host.

### nginx.conf analysis (PASS)

- `listen 8080` — matches Dockerfile EXPOSE and compose port mapping.
- `try_files $uri $uri/ /index.html` — SPA fallback for deep routes.
- `location /assets/` — `Cache-Control: public, max-age=31536000, immutable`.
- `location /` — `Cache-Control: no-cache` for index.html.
- `gzip on` with standard MIME types.

### init-rs.js analysis (PASS)

- JavaScript syntax valid (parsed by Node.js without errors).
- Idempotent: tries `rs.status().ok`, catches exception when uninitialized.
- Calls `rs.initiate()` with three members on correct hostnames.
- Exits 0 on success or if already initiated; exits 1 on failure.

### .dockerignore analysis (PASS)

Excludes `node_modules`, `dist`, `.git`, `e2e/`, `playwright-report/`,
`test-results/`, `coverage/`, `.env*`, `*.md` — keeps build context small.

### docker-compose.yml analysis (PASS)

- All ports bound to `127.0.0.1` (security).
- `mongo-init` depends on all three mongo services with `condition: service_healthy`.
- `mongo-init` uses `restart: "no"` — correct for init containers.
- Named volumes for data persistence across restarts.
- Single bridge network `gdfkube-net` for service discovery.

### Pre-commit (PASS)

```
$ pre-commit run --all-files
TruffleHog...............................................................Passed
```

## Runtime verification checklist

Steps 4.1–4.8 require Docker. Run from `/workspace` on a Docker-capable host:

```bash
# 4.1 — build and start
docker compose build && docker compose up -d

# 4.2 — all services healthy
docker compose ps
# Expected: itsm, mongo1, mongo2, mongo3 = healthy; mongo-init = exited 0

# 4.3 — SPA-fallback
curl -fsS http://127.0.0.1:8080/ | grep -q 'id="root"' && echo "root OK"
curl -fsS http://127.0.0.1:8080/some/spa/deep/route | grep -q 'id="root"' && echo "fallback OK"

# 4.4 — cache headers
curl -sI http://127.0.0.1:8080/ | grep -i cache-control
# Expected: no-cache
curl -sI "http://127.0.0.1:8080/assets/index-Dndo215X.js" | grep -i cache-control
# Expected: public, max-age=31536000, immutable

# 4.5 — replica set
docker compose exec -T mongo1 mongosh --quiet --eval 'rs.status().ok'
# Expected: 1
docker compose exec -T mongo1 mongosh --quiet --eval 'rs.status().members.length'
# Expected: 3
docker compose exec -T mongo1 mongosh --quiet --eval 'rs.status().members.map(m => m.stateStr).sort()'
# Expected: ["PRIMARY","SECONDARY","SECONDARY"]

# 4.6 — idempotency
docker compose run --rm mongo-init
# Expected: exits 0, prints "rs0 already initiated; nothing to do"

# 4.7 — persistence
docker compose exec -T mongo1 mongosh --quiet --eval 'db.getSiblingDB("gdfkube").smoke.insertOne({t:1})'
docker compose restart mongo1
sleep 10
docker compose exec -T mongo1 mongosh --quiet --eval 'db.getSiblingDB("gdfkube").smoke.countDocuments({})'
# Expected: 1

# 4.8 — full reset
docker compose down -v
docker compose up -d
sleep 30
docker compose exec -T mongo1 mongosh --quiet --eval 'db.getSiblingDB("gdfkube").smoke.countDocuments({})'
# Expected: 0
```

## Status

| Task | Result |
|------|--------|
| 1.1–1.3 | **complete** — files created and validated |
| 1.4 | **static pass** — npm build verified, Dockerfile analyzed |
| 2.1–2.2 | **complete** — init-rs.js validated, README created |
| 3.1–3.4 | **complete** — compose config validated |
| 4.1–4.8 | **pending runtime** — requires Docker-capable host |
| 4.9 | **partial** — pre-commit passed; runtime output pending |
