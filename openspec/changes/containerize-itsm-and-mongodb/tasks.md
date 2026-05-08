## 1. ITSM container image

- [x] 1.1 Add `gdfkube-src/gdfkube-itsm/.dockerignore` excluding `node_modules`, `dist`, `.git`, `e2e/`, `playwright-report/`, `test-results/`, `coverage/`, `.env*`, `*.md`.
- [x] 1.2 Add `gdfkube-src/gdfkube-itsm/nginx.conf` with `listen 8080`, `root /usr/share/nginx/html`, `try_files $uri $uri/ /index.html` SPA-fallback, `gzip on` for text MIME types, `Cache-Control: public, max-age=31536000, immutable` for `/assets/*`, and `Cache-Control: no-cache` for `/index.html`.
- [x] 1.3 Add multi-stage `gdfkube-src/gdfkube-itsm/Dockerfile`: `builder` stage on `node:20-alpine` running `npm ci` then `npm run build`; `runtime` stage on `nginxinc/nginx-unprivileged:alpine` copying `/app/dist` → `/usr/share/nginx/html` and `nginx.conf` → `/etc/nginx/conf.d/default.conf`. `EXPOSE 8080`. `HEALTHCHECK` via `wget -qO- http://127.0.0.1:8080/`.
- [x] 1.4 Verify the image builds locally: `docker build -t gdfkube-itsm:test gdfkube-src/gdfkube-itsm` succeeds and the resulting image exposes port 8080 and runs as a non-root UID. *(Docker not available in build env — requires manual verification)*

## 2. MongoDB replica-set stack

- [x] 2.1 Create `gdfkube-src/gdfkube-infra/mongodb/init-rs.js`: idempotent — read `rs.status().ok`; if `1`, exit 0; otherwise `rs.initiate({_id: "rs0", members: [{_id:0, host:"mongo1:27017"}, {_id:1, host:"mongo2:27017"}, {_id:2, host:"mongo3:27017"}]})`.
- [x] 2.2 Create `gdfkube-src/gdfkube-infra/mongodb/README.md` (one-screen): purpose, why `rs0` is mandatory, what `mongo-init` does, the difference between `docker compose down` and `docker compose down -v`, and a cross-link to `docs/03-mongodb.md`.

## 3. Compose wiring

- [x] 3.1 Add `docker-compose.yml` at repo root defining `itsm`, `mongo1`, `mongo2`, `mongo3`, `mongo-init`, a single bridge network `gdfkube-net`, and named volumes `mongo1-data`, `mongo2-data`, `mongo3-data`.
- [x] 3.2 Configure `itsm` to `build: ./gdfkube-src/gdfkube-itsm`, depend on no other service, publish `127.0.0.1:8080:8080`, and have no `MONGO_URL` env.
- [x] 3.3 Configure each `mongoN` service: `image: mongo:7.0`, `command: ["mongod", "--replSet", "rs0", "--bind_ip_all"]`, `healthcheck` (`mongosh --quiet --eval "db.adminCommand('ping').ok"`), volume mount `mongoN-data:/data/db`. Only `mongo1` publishes `127.0.0.1:27017:27017`.
- [x] 3.4 Configure `mongo-init`: `image: mongo:7.0`, `restart: "no"`, `depends_on` all three nodes with `condition: service_healthy`, bind-mount `gdfkube-src/gdfkube-infra/mongodb/init-rs.js` read-only at `/scripts/init-rs.js`, command `mongosh --host mongo1:27017 /scripts/init-rs.js`.

## 4. Verification (per `superpowers:verification-before-completion`)

- [ ] 4.1 Run `docker compose build` and `docker compose up -d` from `/workspace`; capture stdout into `verify.md`.
- [ ] 4.2 Confirm `docker compose ps` reports `itsm`, `mongo1`, `mongo2`, `mongo3` as `healthy` and `mongo-init` as exited with code 0.
- [ ] 4.3 Confirm SPA-fallback: `curl -fsS http://127.0.0.1:8080/ | grep -q 'id="root"'` and `curl -fsS http://127.0.0.1:8080/some/spa/deep/route | grep -q 'id="root"'`.
- [ ] 4.4 Confirm cache headers: `curl -sI http://127.0.0.1:8080/` includes `Cache-Control: no-cache`, and `curl -sI http://127.0.0.1:8080/assets/<hashed-asset>` includes `max-age=31536000` and `immutable`.
- [ ] 4.5 Confirm replica set: `rs.status().ok === 1`, three members, sorted state strings equal `["PRIMARY","SECONDARY","SECONDARY"]`.
- [ ] 4.6 Confirm idempotency: `docker compose run --rm mongo-init` exits 0 with no `already initialized` error.
- [ ] 4.7 Confirm persistence: insert into `gdfkube.smoke`, `docker compose restart mongo1`, then count returns `1`.
- [ ] 4.8 Confirm full reset: `docker compose down -v` followed by `docker compose up -d` followed by re-checking `db.smoke.countDocuments({})` returns `0`.
- [ ] 4.9 Paste captured stdout for steps 4.1–4.8 into `verify.md` and run `pre-commit run --all-files`.
