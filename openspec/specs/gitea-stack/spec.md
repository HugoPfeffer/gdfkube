## ADDED Requirements

### Requirement: Stack SHALL run a single Gitea server on gdfkube-net

The repo-root `docker-compose.yml` MUST define a service named `gitea` running image `gitea/gitea:1.22`. The service MUST be attached to `gdfkube-net`. It MUST mount a Docker-managed named volume `gitea-data` at `/data` and MUST expose container port `3000` to the host at `127.0.0.1:3001` only. No SSH port (container `22`) MAY be published. The service MUST declare a healthcheck running `curl -sf http://localhost:3000/api/v1/version`. The service MUST set the following Gitea config via env: `GITEA__database__DB_TYPE=sqlite3`, `GITEA__server__DOMAIN=gitea`, `GITEA__server__HTTP_PORT=3000`, `GITEA__server__ROOT_URL=http://127.0.0.1:3001/`, `GITEA__security__INSTALL_LOCK=true`, `GITEA__service__DISABLE_REGISTRATION=true`, `GITEA__log__LEVEL=warn`.

#### Scenario: Gitea container comes up healthy

- **GIVEN** a clean checkout at `/workspace`
- **WHEN** `docker compose up -d gitea` is run
- **THEN** within 60 seconds `docker compose ps gitea` SHALL report state `healthy`
- **AND** the service SHALL be running image `gitea/gitea:1.22`

#### Scenario: Gitea is reachable on loopback only

- **GIVEN** the `gitea` service is healthy
- **WHEN** the host issues `curl -sf http://127.0.0.1:3001/api/v1/version`
- **THEN** the request SHALL succeed with HTTP 200
- **AND** `docker-compose.yml` SHALL contain no Gitea host-port mapping that omits the `127.0.0.1:` prefix
- **AND** `docker-compose.yml` SHALL NOT publish any host port for the Gitea SSH service

#### Scenario: Web installer and self-registration are disabled

- **GIVEN** the `gitea` service is healthy
- **WHEN** the host issues `curl -sf http://127.0.0.1:3001/user/sign_up`
- **THEN** the response SHALL indicate registration is disabled (no usable sign-up form rendered)
- **AND** no `/install` route SHALL be reachable

---

### Requirement: gitea-bootstrap SHALL idempotently provision the admin, PAT, and org

The `gitea-bootstrap` service MUST use image `gitea/gitea:1.22`, set `restart: "no"`, depend on `gitea` with `condition: service_healthy`, and mount the `gitea-data` volume read-write and the script `gdfkube-src/gdfkube-infra/gitea/bootstrap.sh` read-only. It MUST consume the environment variables `GITEA_ADMIN_USERNAME`, `GITEA_ADMIN_PASSWORD`, `GITEA_ADMIN_EMAIL`, `GITEA_TOKEN_NAME`, and `GITEA_ORG` (each with a `${VAR:-default}` fallback in compose). On run, the service MUST:

1. Ensure `/data/itsm/` exists.
2. Create the admin user via `gitea admin user create` (the user-already-exists case MUST exit 0).
3. Generate a fresh Personal Access Token via `gitea admin user generate-access-token --token-name "${GITEA_TOKEN_NAME}-<unix-seconds>" --scopes all --raw` and write its raw value to `/data/itsm/token` with mode `600`.
4. Create the `${GITEA_ORG}` organization via `POST /api/v1/orgs`; HTTP 201 or 422 (already exists) MUST be treated as success. Any other status MUST fail the container.
5. Log only non-sensitive details (e.g., username, org, token byte-count). The raw token MUST NOT appear in logs.

#### Scenario: First run creates admin, token, and org

- **GIVEN** the `gitea` service is healthy and `/data/itsm/token` does not yet exist
- **WHEN** `docker compose up gitea-bootstrap` runs
- **THEN** `gitea-bootstrap` SHALL exit with code 0
- **AND** `/data/itsm/token` SHALL exist on the `gitea-data` volume with a non-empty value and mode `600`
- **AND** `GET /api/v1/orgs/${GITEA_ORG}` (with admin basic auth) SHALL return HTTP 200

#### Scenario: Re-run rotates the token without errors

- **GIVEN** `gitea-bootstrap` has previously exited 0 and the org already exists
- **WHEN** `docker compose up gitea-bootstrap` runs a second time
- **THEN** the run SHALL exit with code 0
- **AND** `/data/itsm/token` SHALL contain a new (rotated) token value
- **AND** the existing admin user and org SHALL be unchanged
- **AND** `docker compose logs gitea-bootstrap` SHALL NOT contain the raw token value

---

### Requirement: gitea-repo-seed SHALL mirror gdfkube-src/ into gdfkube/gdfkube-main

The `gitea-repo-seed` service MUST use image `gitea/gitea:1.22`, set `restart: "no"`, and depend on `gitea-bootstrap` with `condition: service_completed_successfully`. It MUST mount the `gitea-data` volume at `/data` read-only (to read `/data/itsm/token`), mount the host workspace's `gdfkube-src/` directory at `/workspace-src` read-only via `${COMPOSE_HOST_WORKSPACE:-.}/gdfkube-src:/workspace-src:ro`, and mount `gdfkube-src/gdfkube-infra/gitea/seed-repos.sh` read-only. It MUST consume `GITEA_ADMIN_USERNAME`, `GITEA_ORG`, and `GITEA_REPO_MAIN` (default `gdfkube-main`). On run, the service MUST:

1. Read the PAT from `/data/itsm/token`; abort non-zero if empty.
2. Ensure repo `${GITEA_ORG}/${GITEA_REPO_MAIN}` exists via `POST /api/v1/orgs/${GITEA_ORG}/repos` with body `{name, auto_init:false, default_branch:"main"}`. HTTP 201 and 409 MUST both be treated as success.
3. Copy `/workspace-src/.` into a temp dir, prune the paths `node_modules`, `target`, `dist`, `build`, `.git`, `.DS_Store`, `git init -b main`, commit with author `gitea-bootstrap <bootstrap@gdfkube.local>`, and push `--force` to `http://${GITEA_ADMIN_USERNAME}:${TOKEN}@gitea:3000/${GITEA_ORG}/${GITEA_REPO_MAIN}.git`.
4. Log only the repo name and commit short-SHA. The raw token MUST NOT appear in logs.

#### Scenario: First run creates the repo and pushes the workspace mirror

- **GIVEN** `gitea-bootstrap` has exited 0 and the workspace `gdfkube-src/` is populated
- **WHEN** `docker compose up gitea-repo-seed` runs
- **THEN** `gitea-repo-seed` SHALL exit with code 0
- **AND** `GET /api/v1/repos/${GITEA_ORG}/gdfkube-main` SHALL return HTTP 200
- **AND** the repo's default branch SHALL be `main`
- **AND** the repo SHALL contain the directory `gdfkube-infra/charts/`

#### Scenario: Re-run force-pushes current workspace contents

- **GIVEN** `gitea-repo-seed` has previously exited 0 and the workspace has since been edited
- **WHEN** `docker compose up gitea-repo-seed` runs a second time
- **THEN** the run SHALL exit with code 0
- **AND** the latest commit on `gdfkube-main` SHALL reflect the current workspace contents

#### Scenario: Pruned paths are not present in the pushed repo

- **GIVEN** the workspace contains directories named `node_modules`, `target`, `dist`, `build`, or `.git` under `gdfkube-src/`
- **WHEN** `gitea-repo-seed` exits 0
- **THEN** the repo `gdfkube/gdfkube-main` SHALL NOT contain any entry named `node_modules`, `target`, `dist`, `build`, or a nested `.git`

---

### Requirement: gitea-token-sync SHALL upsert live Gitea settings into Mongo

The `gitea-token-sync` service MUST use image `mongo:7.0`, set `restart: "no"`, and declare `depends_on`:
- `gitea-bootstrap` with `condition: service_completed_successfully`
- `mongo-seed` with `condition: service_completed_successfully`

It MUST mount the `gitea-data` volume at `/data` read-only (to read `/data/itsm/token`) and mount `gdfkube-src/gdfkube-infra/gitea/sync-token.sh` read-only. It MUST NOT declare a dependency on `gitea-repo-seed`. On run, the service MUST:

1. Read the PAT from `/data/itsm/token` and place it in env var `GITEA_LOCAL_TOKEN`; abort non-zero if empty.
2. Run `mongosh --quiet "mongodb://mongo1:27017/gdfkube?replicaSet=rs0"` with a `db.gitea_settings.updateOne({_id:"gitea"}, {$set:{endpoint:"http://gitea:3000", owner:process.env.GITEA_ORG, token:process.env.GITEA_LOCAL_TOKEN, updatedBy:"gitea-init", updatedAt:new Date()}}, {upsert:true})`.
3. Pass the token to mongosh exclusively via environment variables (it MUST NOT appear on the command line, so it cannot show in `ps`).

#### Scenario: First run upserts the live values into the singleton

- **GIVEN** `gitea-bootstrap` and `mongo-seed` have both exited 0
- **WHEN** `docker compose up gitea-token-sync` runs
- **THEN** `gitea-token-sync` SHALL exit with code 0
- **AND** `db.gitea_settings.findOne({_id:"gitea"})` SHALL return a document with `endpoint="http://gitea:3000"`, `owner="${GITEA_ORG}"`, a `token` whose length is at least 40 characters and is NOT `"CHANGE_ME"`, `updatedBy="gitea-init"`, and a `updatedAt` set within the last 60 seconds

#### Scenario: Re-run refreshes the token in place

- **GIVEN** the singleton already holds a previous token written by a prior `gitea-token-sync` run
- **WHEN** `gitea-token-sync` runs again after `gitea-bootstrap` rotates the token
- **THEN** the run SHALL exit with code 0
- **AND** the singleton's `token` field SHALL equal the contents of `/data/itsm/token`
- **AND** the placeholder seed value (`CHANGE_ME`) SHALL NOT reappear

#### Scenario: Token never appears on the mongosh command line

- **GIVEN** `gitea-token-sync` is running
- **WHEN** `docker inspect` or `ps` is inspected for the running container
- **THEN** no command-line argument SHALL contain the raw PAT value

---

### Requirement: Downstream services SHALL wait on the appropriate Gitea sidecars

The existing `gdfkube-itsm-api` service in `docker-compose.yml` MUST add a `depends_on` edge `gitea-token-sync: { condition: service_completed_successfully }`. The existing `gdfkube-camel` service MUST add `depends_on` edge `gitea-repo-seed: { condition: service_completed_successfully }` and MUST set environment overrides `APP_SYSTEM_GITEA_EXTERNAL_URL=http://gitea:3000` and `APP_SYSTEM_GITEA_OWNER=gdfkube` (or `${GITEA_ORG:-gdfkube}`).

#### Scenario: API does not start until the live token is in Mongo

- **GIVEN** a clean `docker compose down -v` state
- **WHEN** `docker compose up -d gdfkube-itsm-api` is run
- **THEN** `gitea-token-sync` SHALL reach `Exited (0)` before `gdfkube-itsm-api` enters state `running`

#### Scenario: Camel reads the local Gitea endpoint and owner

- **GIVEN** the full stack is up and `gitea-repo-seed` has exited 0
- **WHEN** `docker compose exec gdfkube-camel env` is inspected
- **THEN** `APP_SYSTEM_GITEA_EXTERNAL_URL` SHALL equal `http://gitea:3000`
- **AND** `APP_SYSTEM_GITEA_OWNER` SHALL equal `gdfkube`

#### Scenario: API can reach Gitea with the seeded token

- **GIVEN** the full stack is up
- **WHEN** `docker compose exec gdfkube-itsm-api` issues an HTTP GET to `http://gitea:3000/api/v1/repos/gdfkube/gdfkube-main` carrying the token from `db.gitea_settings`
- **THEN** the response SHALL be HTTP 200 with a repo JSON body

---

### Requirement: Gitea state SHALL persist across container restarts via the gitea-data volume

The Gitea SQLite database and the bootstrap-shared `/data/itsm/token` file MUST live on a Docker-managed named volume `gitea-data`. The volume MUST be declared at the top level of `docker-compose.yml`. State written before a `docker compose restart gitea` MUST be readable after the restart.

#### Scenario: Org and repo survive a Gitea container restart

- **GIVEN** the stack is healthy with `gdfkube` org and `gdfkube-main` repo created
- **WHEN** `docker compose restart gitea` is run and `gitea` returns to `healthy`
- **THEN** `GET /api/v1/orgs/gdfkube` SHALL still return HTTP 200
- **AND** `GET /api/v1/repos/gdfkube/gdfkube-main` SHALL still return HTTP 200

#### Scenario: docker compose down -v wipes Gitea state and next up re-seeds it

- **GIVEN** the stack was previously running with org and repo present
- **WHEN** `docker compose down -v` is run, then `docker compose up -d` is re-run
- **THEN** all three Gitea init sidecars SHALL exit 0
- **AND** the org `gdfkube` and repo `gdfkube/gdfkube-main` SHALL be present again
- **AND** `db.gitea_settings.findOne({_id:"gitea"}).token` SHALL be a fresh non-placeholder value

---

### Requirement: No live Gitea secret SHALL be committed to the repo

The committed `gdfkube-src/gdfkube-infra/mongodb/seed-data/settings.json` placeholder MUST remain unchanged by this change (still ships `endpoint=https://gitea-gitea.apps.gdfkube.gov`, `token=CHANGE_ME`). Any defaults appearing in `.env.example` MUST be placeholders (e.g., `GITEA_ADMIN_PASSWORD=ChangeMeLocally123!`) and MUST carry a `# trufflehog:ignore` comment so the pre-commit trufflehog scan stays green. Live tokens MUST only exist at runtime: in the `gitea-data` volume's `/data/itsm/token` file and in the Mongo `gitea_settings.token` field.

#### Scenario: trufflehog pre-commit hook stays green

- **GIVEN** all files in this change are staged
- **WHEN** `pre-commit run --all-files` is executed
- **THEN** trufflehog SHALL report no findings
- **AND** the run SHALL exit with code 0

#### Scenario: Committed seed file remains a placeholder

- **GIVEN** this change is merged
- **WHEN** `gdfkube-src/gdfkube-infra/mongodb/seed-data/settings.json` is read
- **THEN** the file SHALL show `token` equal to `"CHANGE_ME"` and `endpoint` equal to the production placeholder URL
