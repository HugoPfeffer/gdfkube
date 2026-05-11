## ADDED Requirements

### Requirement: ITSM image SHALL build deterministically from source via a multi-stage Dockerfile

The ITSM SPA SHALL ship a multi-stage `Dockerfile` at `gdfkube-src/gdfkube-itsm/Dockerfile` that produces a single runtime image from the source in `gdfkube-src/gdfkube-itsm/`. The build MUST use `node:20-alpine` for the build stage with `npm ci` against `package-lock.json` and `npm run build` to produce `dist/`, and a separate runtime stage that contains only the built static assets and an HTTP server — no Node toolchain, no `node_modules`. A `gdfkube-src/gdfkube-itsm/.dockerignore` MUST exclude `node_modules`, `dist`, `.git`, `e2e/`, `playwright-report/`, `test-results/`, `coverage/`, `.env*`, and `*.md` from the build context.

#### Scenario: Image builds from a clean checkout

- **GIVEN** a clean checkout of the repository at `/workspace`
- **WHEN** `docker build -t gdfkube-itsm:test gdfkube-src/gdfkube-itsm` is run
- **THEN** the build SHALL succeed without network access to anything beyond the configured npm registry and the configured Docker registry
- **AND** the resulting image SHALL contain `/usr/share/nginx/html/index.html` produced by `npm run build`
- **AND** the resulting image SHALL NOT contain a `node_modules` directory or any source TypeScript files

---

### Requirement: ITSM container SHALL serve the SPA rootless on port 8080

The runtime stage MUST run as a non-root user and listen on TCP port 8080 with no `NET_BIND_SERVICE` capability. The image MUST expose port 8080 and the served document root MUST be the contents of the build stage's `dist/` directory.

#### Scenario: Container serves index.html on port 8080 as non-root

- **GIVEN** the ITSM image has been built
- **WHEN** the container is started and `curl -fsS http://127.0.0.1:8080/` is issued from the host
- **THEN** the response SHALL be HTTP 200 and contain the string `id="root"` (the SPA mount point)
- **AND** `docker exec <container> id -u` SHALL return a non-zero UID (proving the process is not root)

---

### Requirement: SPA-fallback routing SHALL serve index.html for unknown paths

For any request to a path that does not resolve to an asset under the document root, the server MUST respond with the contents of `/index.html` so client-side routing in the SPA works. Paths that resolve to a real file under the document root (including `/assets/*` and `/index.html` itself) MUST be served as-is.

#### Scenario: Deep SPA route returns the SPA shell

- **GIVEN** the ITSM container is running on `http://127.0.0.1:8080`
- **WHEN** `curl -fsS http://127.0.0.1:8080/some/spa/deep/route` is issued
- **THEN** the response SHALL be HTTP 200 and contain `id="root"`
- **AND** the response body SHALL match the body returned for `GET /`

#### Scenario: Real asset is served verbatim and not rewritten

- **GIVEN** the ITSM container is running
- **WHEN** an asset under `/assets/<hashed-name>.js` (Vite-emitted) is requested
- **THEN** the response SHALL be HTTP 200 with `Content-Type: application/javascript` (or text/javascript)
- **AND** the body SHALL NOT be the contents of `index.html`

---

### Requirement: Cache headers SHALL distinguish hashed assets from index.html

Because Vite emits content-hashed filenames under `/assets/`, those responses MUST be served with a long-lived `Cache-Control` header (`public, max-age=31536000, immutable` or stricter equivalent). `/index.html` MUST be served with `Cache-Control: no-cache` so navigation always fetches a current shell.

#### Scenario: Hashed asset gets a long cache header

- **GIVEN** the ITSM container is running
- **WHEN** `curl -sI http://127.0.0.1:8080/assets/<any-hashed-asset>` is issued
- **THEN** the `Cache-Control` header value SHALL include `max-age=31536000` and `immutable`

#### Scenario: index.html is not cached

- **GIVEN** the ITSM container is running
- **WHEN** `curl -sI http://127.0.0.1:8080/` is issued
- **THEN** the `Cache-Control` header value SHALL include `no-cache`

---

### Requirement: Container SHALL expose a healthcheck that reflects HTTP readiness

The image MUST declare a Docker `HEALTHCHECK` that probes the local listener (e.g. `wget -qO- http://127.0.0.1:8080/`). The container MUST report `healthy` once Nginx is serving the SPA shell.

#### Scenario: Healthcheck transitions to healthy

- **GIVEN** the ITSM container has been started under `docker compose`
- **WHEN** up to 60 seconds elapse
- **THEN** `docker compose ps` SHALL report the `itsm` service in state `healthy`
