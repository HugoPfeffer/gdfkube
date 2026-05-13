## 1. Scaffold the `gdfkube-src/gdfkube-infra/gitea/` scripts

- [x] 1.1 Create directory `/workspace/gdfkube-src/gdfkube-infra/gitea/`.
- [x] 1.2 Write `bootstrap.sh`: ensure `/data/itsm/`, idempotent `gitea admin user create` (swallow "user exists"), `generate-access-token --raw` with `--token-name "${GITEA_TOKEN_NAME}-$(date +%s)" --scopes all`, write token to `/data/itsm/token` with `chmod 600`, POST `/api/v1/orgs` treating 201/422 as success, log only `user=`/`org=`/`token-bytes=`.
- [x] 1.3 Write `seed-repos.sh`: read PAT from `/data/itsm/token` (abort if empty); POST `/api/v1/orgs/${GITEA_ORG}/repos` treating 201/409 as success; `cp -a /workspace-src/. "$WORK/"`; prune `node_modules`, `target`, `dist`, `build`, `.git`, `.DS_Store`; `git init -b main`, set local `user.email`/`user.name`, commit, force-push via `http://${GITEA_ADMIN_USERNAME}:${TOKEN}@gitea:3000/${GITEA_ORG}/${GITEA_REPO_MAIN}.git`; `set +x` around the URL assembly; log only repo name and commit short-SHA.
- [x] 1.4 Write `sync-token.sh`: `export GITEA_LOCAL_TOKEN=$(cat /data/itsm/token)` (abort if empty); `mongosh --quiet "mongodb://mongo1:27017/gdfkube?replicaSet=rs0" --eval '...db.gitea_settings.updateOne(...)...'`; `unset GITEA_LOCAL_TOKEN` at the end; ensure the token is never on the mongosh command line.
- [x] 1.5 `chmod +x` is not required (entrypoint will invoke `sh /script.sh`), but ensure scripts use `#!/bin/sh`, `set -eu`, and use POSIX-portable constructs only (all three images use BusyBox/Alpine-style sh in the gitea image; `mongo:7.0` uses bash but our scripts stay POSIX).

## 2. Add `gitea`, `gitea-bootstrap`, `gitea-repo-seed`, `gitea-token-sync` services to `docker-compose.yml`

- [x] 2.1 Add top-level `gitea-data:` volume to the `volumes:` block of `/workspace/docker-compose.yml`.
- [x] 2.2 Add `gitea` service: image `gitea/gitea:1.22`; network `gdfkube-net`; `ports: ["127.0.0.1:3001:3000"]`; volume `gitea-data:/data`; env `GITEA__database__DB_TYPE=sqlite3`, `GITEA__server__DOMAIN=gitea`, `GITEA__server__HTTP_PORT=3000`, `GITEA__server__ROOT_URL=http://127.0.0.1:3001/`, `GITEA__security__INSTALL_LOCK=true`, `GITEA__service__DISABLE_REGISTRATION=true`, `GITEA__log__LEVEL=warn`; healthcheck `curl -sf http://localhost:3000/api/v1/version` (test `["CMD-SHELL", "curl -sf http://localhost:3000/api/v1/version"]`).
- [x] 2.3 Add `gitea-bootstrap` service: image `gitea/gitea:1.22`; network `gdfkube-net`; volumes `gitea-data:/data` and `./gdfkube-src/gdfkube-infra/gitea/bootstrap.sh:/bootstrap.sh:ro`; env passthrough for `GITEA_ADMIN_USERNAME=${GITEA_ADMIN_USERNAME:-gdfkube-admin}`, `GITEA_ADMIN_PASSWORD=${GITEA_ADMIN_PASSWORD:-ChangeMeLocally123!}`, `GITEA_ADMIN_EMAIL=${GITEA_ADMIN_EMAIL:-admin@gdfkube.local}`, `GITEA_TOKEN_NAME=${GITEA_TOKEN_NAME:-itsm-local}`, `GITEA_ORG=${GITEA_ORG:-gdfkube}`; `depends_on: { gitea: { condition: service_healthy } }`; `restart: "no"`; `entrypoint: ["sh", "/bootstrap.sh"]`.
- [x] 2.4 Add `gitea-repo-seed` service: image `gitea/gitea:1.22`; network `gdfkube-net`; volumes `gitea-data:/data:ro`, `${COMPOSE_HOST_WORKSPACE:-.}/gdfkube-src:/workspace-src:ro`, `./gdfkube-src/gdfkube-infra/gitea/seed-repos.sh:/seed-repos.sh:ro`; env `GITEA_ADMIN_USERNAME=${GITEA_ADMIN_USERNAME:-gdfkube-admin}`, `GITEA_ORG=${GITEA_ORG:-gdfkube}`, `GITEA_REPO_MAIN=${GITEA_REPO_MAIN:-gdfkube-main}`; `depends_on: { gitea-bootstrap: { condition: service_completed_successfully } }`; `restart: "no"`; `entrypoint: ["sh", "/seed-repos.sh"]`.
- [x] 2.5 Add `gitea-token-sync` service: image `mongo:7.0`; network `gdfkube-net`; volumes `gitea-data:/data:ro`, `./gdfkube-src/gdfkube-infra/gitea/sync-token.sh:/scripts/sync-token.sh:ro`; env `GITEA_ORG=${GITEA_ORG:-gdfkube}`; `depends_on: { gitea-bootstrap: { condition: service_completed_successfully }, mongo-seed: { condition: service_completed_successfully } }`; `restart: "no"`; `entrypoint: ["sh", "/scripts/sync-token.sh"]`.
- [x] 2.6 Confirm all four new services attach to `gdfkube-net` and that every host-port mapping is loopback-only (`127.0.0.1:`).

## 3. Wire downstream consumers

- [x] 3.1 In the existing `gdfkube-itsm-api` block (`docker-compose.yml:47-66`), add `gitea-token-sync: { condition: service_completed_successfully }` to `depends_on`. Keep all existing edges intact.
- [x] 3.2 In the existing `gdfkube-camel` block (`docker-compose.yml:273-298`), add `gitea-repo-seed: { condition: service_completed_successfully }` to `depends_on`. Keep all existing edges intact.
- [x] 3.3 In the same `gdfkube-camel` block, add env overrides `APP_SYSTEM_GITEA_EXTERNAL_URL=http://gitea:3000` and `APP_SYSTEM_GITEA_OWNER=${GITEA_ORG:-gdfkube}` (Quarkus binds these to `app.system.gitea-external-url` and `app.system.gitea-owner`).

## 4. Document the local Gitea overrides in `.env.example`

- [x] 4.1 If `/workspace/.env.example` does not exist, create it; otherwise append.
- [x] 4.2 Append a `# Local Gitea bootstrap` section with: `GITEA_ADMIN_USERNAME=gdfkube-admin`, `GITEA_ADMIN_PASSWORD=ChangeMeLocally123!   # trufflehog:ignore`, `GITEA_ADMIN_EMAIL=admin@gdfkube.local`, `GITEA_TOKEN_NAME=itsm-local`, `GITEA_ORG=gdfkube`.
- [x] 4.3 Confirm the `# trufflehog:ignore` comment is on the password line (no other line needs it).

## 5. Confirm explicitly-untouched files

- [x] 5.1 Verify `gdfkube-src/gdfkube-infra/mongodb/seed-data/settings.json` is **not** modified by this change (still holds the production-shaped placeholder + `CHANGE_ME` token).
- [x] 5.2 Verify `gdfkube-src/gdfkube-infra/mongodb/seed-collections.js` is **not** modified (the existing `$setOnInsert` semantics remain correct).
- [x] 5.3 Verify `gdfkube-src/gdfkube-itsm/src/data/adminSeeds.ts` and `gdfkube-src/gdfkube-itsm/scripts/export-seed-data.mjs` are **not** modified.
- [x] 5.4 Verify `gdfkube-src/gdfkube-camel/src/main/resources/application.properties` is **not** modified (env overrides cover it).

## 6. Local smoke verification

- [ ] 6.1 From `/workspace`, run `docker compose down -v` to wipe state.
- [ ] 6.2 (Optional) `cp .env.example .env`.
- [ ] 6.3 Run `docker compose up -d gitea gitea-bootstrap gitea-repo-seed gitea-token-sync mongo1 mongo-init mongo-seed gdfkube-itsm-api itsm gdfkube-camel`.
- [ ] 6.4 `docker compose ps` — confirm `gitea-bootstrap`, `gitea-repo-seed`, and `gitea-token-sync` all show `Exited (0)`.
- [ ] 6.5 In a browser, visit `http://127.0.0.1:3001/`, log in as `gdfkube-admin` / `$GITEA_ADMIN_PASSWORD`. Confirm: org `gdfkube` exists; repo `gdfkube/gdfkube-main` exists on `main` with a non-empty initial commit; the repo contains `gdfkube-infra/charts/{cluster-request,namespace-request,scale-patch,infra}/`; registration is disabled.
- [ ] 6.6 Via MongoDB MCP `find`, query `gdfkube.gitea_settings` for `{_id:"gitea"}` and confirm `endpoint=http://gitea:3000`, `owner=gdfkube`, `token` is a 40+ char string (not `CHANGE_ME`), `updatedBy=gitea-init`.
- [ ] 6.7 In the ITSM SPA, log in as Maria → user menu → Settings. Confirm endpoint shows `http://gitea:3000`, owner shows `gdfkube`, token shows `***` masked. Toggle reveal and confirm the live token is shown.
- [ ] 6.8 API smoke from inside the container: `docker compose exec gdfkube-itsm-api sh -c 'TOK=$(mongosh --quiet "mongodb://mongo1:27017/gdfkube?replicaSet=rs0" --eval "print(db.gitea_settings.findOne({_id:\"gitea\"}).token)" | tail -n1); wget -qO- --header="Authorization: token $TOK" http://gitea:3000/api/v1/repos/gdfkube/gdfkube-main'` — expect repo JSON.
- [ ] 6.9 Camel smoke: submit a sample request through the ITSM flow that triggers `RepoBootstrapRoute`; confirm a new `gdfkube/gdfkube-<org>` repo appears in Gitea rendered from templates under `gdfkube/gdfkube-main` at `gdfkube-infra/charts/`.

## 7. Idempotency and safety checks

- [ ] 7.1 Re-run `docker compose up -d` — confirm bootstrap services re-run cleanly (user-exists swallowed, fresh token rotated, repos force-pushed, mongo `$set` overwrites). No error logs in the four new services.
- [ ] 7.2 `docker compose logs gitea-bootstrap gitea-repo-seed gitea-token-sync` — confirm the raw token value does NOT appear (only byte-counts, repo names, commit SHAs).
- [ ] 7.3 Run `docker compose down -v && docker compose up -d` and re-run 6.4–6.6 to confirm a clean re-provision yields the same end state with a new token.
- [ ] 7.4 Run `pre-commit run --all-files` (per `CLAUDE.md` Git section) — trufflehog must stay clean.

## 8. Update OpenSpec workflow state

- [ ] 8.1 Once 6.x and 7.x pass, mark the change ready for archive by running `openspec status --change "add-local-gitea-compose"` and confirming all artifacts up to `verify` are done.
- [ ] 8.2 Author `verify.md` and `retrospective.md` per `openspec instructions <id>` (these come after `/opsx:apply`, not in this propose step).
