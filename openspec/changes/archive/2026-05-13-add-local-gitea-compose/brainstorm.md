## Design Summary

Add a local Gitea container to `docker-compose.yml` and wire it into the existing init-job pattern so a fresh `docker compose up` produces a working end-to-end demo: a running Gitea, a `gdfkube` org, a `gdfkube/gdfkube-main` repo mirrored from `gdfkube-src/`, and a freshly-minted PAT auto-written into Mongo's `gitea_settings` singleton. The committed seed file stays a placeholder; live values are produced at boot.

## Alternatives Considered

### Option A: Single monolithic `gitea-init` sidecar
- **Approach**: One container does admin-create, token-gen, org-create, repo-mirror push, and mongo upsert.
- **Pros**: Fewer services, simpler `depends_on` graph.
- **Cons**: Mixes responsibilities; the API has to wait on the bulky workspace mirror+push before it can read its token; harder to retry just the Mongo sync; the only image with both `gitea` CLI and `mongosh` would need to be custom-built.
- **Why not chosen**: Conflates two independent concerns (credential bootstrap vs. repo content seeding) and forces the API to wait on slow work unrelated to it.

### Option B: Split into four sidecars — `gitea` + `gitea-bootstrap` + `gitea-repo-seed` + `gitea-token-sync` *(chosen)*
- **Approach**: `gitea` runs the server. `gitea-bootstrap` (gitea image) creates the admin, generates the token, creates the org, and drops the token at `/data/itsm/token`. `gitea-repo-seed` (gitea image) mirrors the `gdfkube-src/` subtree into `gdfkube/gdfkube-main`. `gitea-token-sync` (mongo:7.0) upserts the live endpoint/owner/token into `gdfkube.gitea_settings`. Each sidecar uses its native image, so no custom builds.
- **Pros**: Tight per-container responsibility; matches the existing `mongo-init`/`mongo-seed`/`kafka-init` init-job pattern; the API can boot as soon as `gitea-token-sync` completes — it does not have to wait on the bulky repo push; reuses `mongo:7.0` that's already in the compose file.
- **Cons**: Four new services instead of one; slightly more wiring in `docker-compose.yml`.
- **Why chosen**: Aligns with the project's existing init-job convention, keeps the API's critical-path boot fast, and avoids a custom multi-tool image.

### Option C: Provision Gitea via a pre-baked image with admin/token/org/repo baked in at build time
- **Approach**: Build a custom `gdfkube-gitea` image with the org, admin, and seed repo committed inside.
- **Pros**: Zero runtime bootstrap; instant start.
- **Cons**: Tokens-in-image is a secret-leak risk (would trip trufflehog); image stale w.r.t. workspace edits between rebuilds; demos lose the "fresh start" semantic; conflicts with the no-secrets-in-code rule.
- **Why not chosen**: Hard-codes secrets, drifts from workspace truth, violates `/workspace/.claude/rules/no-secrets-in-code.md`.

## Agreed Approach

**Option B** — four small services that each match the existing init-job convention:

1. `gitea` (gitea/gitea:1.22, SQLite, healthcheck on `/api/v1/version`, bound to `127.0.0.1:3001`).
2. `gitea-bootstrap` (gitea image, restart:"no") — idempotent admin user + scoped PAT to `/data/itsm/token` + org creation via API.
3. `gitea-repo-seed` (gitea image, restart:"no") — `cp -a /workspace-src` → prune bloat → `git init/commit/push --force` to `gdfkube/gdfkube-main`.
4. `gitea-token-sync` (mongo:7.0, restart:"no") — `mongosh` upsert of `endpoint`/`owner`/`token`/`updatedBy=gitea-init` into `gdfkube.gitea_settings`.

`gdfkube-itsm-api` waits on `gitea-token-sync` (fast). `gdfkube-camel` waits on `gitea-repo-seed` (so chart templates resolve) and gets `APP_SYSTEM_GITEA_EXTERNAL_URL=http://gitea:3000` + `APP_SYSTEM_GITEA_OWNER=gdfkube` env overrides.

## Key Decisions

- **Image**: `gitea/gitea:1.22` (pinned stable; ships `git` + `curl`, so no extra tooling layer needed for the two gitea-based sidecars).
- **DB**: SQLite — sufficient for single-node dev, avoids adding another Postgres.
- **Host port**: `127.0.0.1:3001:3000` — loopback-only, mirrors `mongo1`/`kafka1` exposure pattern.
- **No SSH port**: HTTP+token is enough for Camel/CLI/CI; reduces attack surface.
- **Registration disabled** via `GITEA__service__DISABLE_REGISTRATION=true`; install lock set so the web installer is skipped.
- **Token storage**: a fresh PAT is generated each boot (uniquely-named via `$(date +%s)` suffix so re-runs don't collide); written to `/data/itsm/token` (chmod 600) on a private named volume `gitea-data` shared with the two sidecars; the mongosh sidecar reads it from disk and passes it via env (never argv) into the update query.
- **Seed source**: only `gdfkube-src/` is mirrored into `gdfkube/gdfkube-main`. Helm chart templates already live at `gdfkube-src/gdfkube-infra/charts/` and ride along inside the same repo — no separate templates repo.
- **Bloat prune list** during seed: `node_modules`, `target`, `dist`, `build`, `.git`, `.DS_Store`.
- **Force-push**: re-runs `--force` the workspace contents over `main`, so the repo reflects the current workspace on every `docker compose up`.
- **Mongo write semantics**: `$set` on `_id="gitea"` (the seed file uses `$setOnInsert`, so this sidecar correctly refreshes mutable fields without fighting the seed step).
- **No edits to** the committed `seed-data/settings.json` placeholder, `seed-collections.js`, `adminSeeds.ts`, `export-seed-data.mjs`, or Camel's `application.properties` — the runtime sidecar + env overrides cover all of it.
- **`.env.example`**: documents five `GITEA_*` overrides (`GITEA_ADMIN_USERNAME`, `GITEA_ADMIN_PASSWORD` w/ `# trufflehog:ignore`, `GITEA_ADMIN_EMAIL`, `GITEA_TOKEN_NAME`, `GITEA_ORG`); compose env uses `${VAR:-default}` so a missing `.env` still boots cleanly.
- **Out of scope**: prod Gitea install (deferred to RHACM/ArgoCD), SSH clones, encryption-at-rest for the PAT (accepted risk per `add-gitea-settings/design.md`), TLS on loopback Gitea.

## Open Questions

- None — the input plan resolved each open trade-off (`gdfkube-src/`-only mirror, no SSH port, SQLite, force-push on re-run, mongosh sidecar reads token via env). Proceed to design + tasks.
