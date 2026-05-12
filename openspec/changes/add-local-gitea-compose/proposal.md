## Why

The `add-gitea-settings` change taught the ITSM API and UI to read/write a Gitea endpoint/owner/token from a Mongo singleton, but there is no local Gitea instance for `docker compose up` to point at: the committed seed ships an `apps.gdfkube.gov` placeholder URL and a `CHANGE_ME` token, so the end-to-end demo path (Camel → Gitea repo bootstrap) is broken on a fresh stack. Adding a containerised Gitea now — with a token and seed repo provisioned at boot — closes that gap before the next demo and unblocks the Camel `RepoBootstrapRoute` flow already coded against `app.system.gitea-external-url`.

## What Changes

**Compose stack** (additive)
- From: `docker-compose.yml` has no Gitea service; ITSM API and Camel start with a placeholder `gitea_settings` and an unreachable production-shaped URL.
- To: Four new services (`gitea`, `gitea-bootstrap`, `gitea-repo-seed`, `gitea-token-sync`) plus a `gitea-data` named volume; `gdfkube-itsm-api` and `gdfkube-camel` get `depends_on` edges, and `gdfkube-camel` gets `APP_SYSTEM_GITEA_EXTERNAL_URL` + `APP_SYSTEM_GITEA_OWNER` env overrides.
- Reason: Make the local demo path work end-to-end without manual provisioning.
- Impact: Non-breaking. Existing services keep their data; only new top-level volumes are introduced.

**Runtime seeding of `gitea_settings`** (additive)
- From: The committed `seed-data/settings.json` placeholder is the only writer into `gitea_settings`; the doc is unusable for live Gitea calls.
- To: A `gitea-token-sync` sidecar (mongo:7.0, mongosh) upserts `endpoint=http://gitea:3000`, `owner=gdfkube`, `token=<freshly generated PAT>`, `updatedBy=gitea-init`, `updatedAt=<now>` into the same singleton on every boot.
- Reason: The Settings UI and Camel both need real values; the committed seed must stay placeholder so the repo carries no secrets.
- Impact: Compatible with `seed-collections.js:74-81`'s `$setOnInsert` semantics — `mongo-seed` and `gitea-token-sync` do not fight each other.

**No source edits to API/UI/Camel/seed**
- The committed `settings.json`, `seed-collections.js`, `adminSeeds.ts`, `export-seed-data.mjs`, and Camel `application.properties` are intentionally untouched. The runtime sidecars and Camel env overrides cover all of it.

**`.env.example`** (new or appended)
- Documents five `GITEA_*` overrides (`GITEA_ADMIN_USERNAME`, `GITEA_ADMIN_PASSWORD` + `# trufflehog:ignore`, `GITEA_ADMIN_EMAIL`, `GITEA_TOKEN_NAME`, `GITEA_ORG`). Compose env uses `${VAR:-default}` so a missing `.env` still boots.

## Capabilities

### New Capabilities

- `gitea-stack`: A docker-compose stack providing a single-node Gitea (1.22, SQLite, loopback host port `127.0.0.1:3001`) plus three init-job sidecars that idempotently (a) create an admin user, (b) mint a per-boot PAT to `/data/itsm/token`, (c) create the `gdfkube` org, (d) mirror the workspace's `gdfkube-src/` subtree into `gdfkube/gdfkube-main` via force-push, and (e) upsert the live `endpoint`/`owner`/`token`/audit fields into Mongo's `gitea_settings` singleton. The stack exposes its endpoint at `http://gitea:3000` on the internal bridge network and gates `gdfkube-itsm-api` and `gdfkube-camel` on completion of the relevant sidecars.

### Modified Capabilities

None. The change is purely additive at the compose-stack layer — no existing capability's requirements change.

## Impact

- **Files modified**: `/workspace/docker-compose.yml` (4 new services, 1 new volume, 2 new `depends_on` edges, 2 new env overrides on `gdfkube-camel`).
- **Files created**:
  - `/workspace/gdfkube-src/gdfkube-infra/gitea/bootstrap.sh`
  - `/workspace/gdfkube-src/gdfkube-infra/gitea/seed-repos.sh`
  - `/workspace/gdfkube-src/gdfkube-infra/gitea/sync-token.sh`
  - `/workspace/.env.example` (create or append)
- **Files explicitly untouched**: `seed-data/settings.json`, `seed-collections.js`, `adminSeeds.ts`, `export-seed-data.mjs`, Camel `application.properties`.
- **Dependencies pinned**: `gitea/gitea:1.22` (new pull; chosen because it ships `git` + `curl` + `gitea` CLI, avoiding a custom image). `mongo:7.0` reused — already pulled by `mongo-seed` (`docker-compose.yml:21`). No conflicts with existing pinned versions.
- **Blast radius**:
  - **Services**: 4 new (`gitea`, `gitea-bootstrap`, `gitea-repo-seed`, `gitea-token-sync`); 2 existing services gain `depends_on` edges (`gdfkube-itsm-api`, `gdfkube-camel`) and `gdfkube-camel` gains 2 env overrides.
  - **API endpoints**: none changed. The existing `GET/PATCH /api/itsm/settings` continues to work; it now returns real values instead of placeholders.
  - **Kafka topics**: none.
  - **MongoDB collections**: only `gdfkube.gitea_settings` is *written* by the new code — same doc, same `_id="gitea"`, no schema changes.
  - **Downstream consumers**: Camel's `RepoBootstrapRoute` (`gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/RepoBootstrapRoute.java:43-54`) gains a working endpoint; `GiteaGitProvider.java:38-60` is unchanged.
  - **Host ports**: `127.0.0.1:3001` newly bound (Gitea HTTP); no SSH port.
  - **Volumes**: new top-level `gitea-data` named volume.
- **Testing strategy**:
  - **Integration / smoke (manual, scripted in `verify.md`)**: `docker compose down -v && docker compose up -d` → check `docker compose ps` shows the three init sidecars `Exited (0)`; verify the org+repo via Gitea API; verify Mongo's `gitea_settings` via the MongoDB MCP `find`; verify the API container can reach Gitea using the seeded token; verify Camel can render templates from `gdfkube/gdfkube-main`.
  - **Idempotency**: re-run `docker compose up -d` and confirm bootstrap services exit cleanly (user-exists swallowed, fresh token rotated, repo force-pushed, mongo `$set` overwrites).
  - **Pre-commit**: `pre-commit run --all-files` must remain green; trufflehog is the gating check.
  - **Unit/contract tests**: none added — the change is shell-script + compose YAML; the underlying Gitea behavior is upstream, and the API/Camel code under test was already covered by `add-gitea-settings` tests.
