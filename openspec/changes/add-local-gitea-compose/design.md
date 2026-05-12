## Context

The `add-gitea-settings` and in-flight `fix-gitea-settings-review` changes have already taught the ITSM API how to talk to a Gitea server: the singleton `gitea_settings` document (`endpoint`, `owner`, `token`, `updatedBy`, `updatedAt`), the admin Settings UI with masked/reveal-able token, and the audit trail. The Camel side, `RepoBootstrapRoute` (`gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/RepoBootstrapRoute.java:43-54`), is already coded to create `gdfkube/gdfkube-<org>` repos on demand against whatever endpoint `app.system.gitea-external-url` resolves to.

The gap: there is **no local Gitea instance** in `docker-compose.yml`. The committed seed file (`gdfkube-src/gdfkube-infra/mongodb/seed-data/settings.json`) ships `endpoint: "https://gitea-gitea.apps.gdfkube.gov"` and `token: "CHANGE_ME"` — placeholders that 404/401 against any real call. A fresh `docker compose up` therefore produces a broken end-to-end demo path.

Additionally, the GitOps story needs one repo present on day 1: `gdfkube/gdfkube-main`, a mirror of the workspace's `gdfkube-src/` subtree. The Helm chart templates Camel renders (`gdfkube-src/gdfkube-infra/charts/{cluster-request,namespace-request,scale-patch,infra}/`) live inside that tree, so they ride along inside the same repo rather than being split out.

Constraints in play:
- `/workspace/CLAUDE.md` — prefer modifying existing services over new ones; never commit secrets; eliminate drift; trufflehog pre-commit hook is enforced.
- `/workspace/.claude/rules/no-secrets-in-code.md` — placeholders need `# trufflehog:ignore`; never log live tokens.
- `add-gitea-settings/design.md` — already accepted that the PAT lives unencrypted in Mongo for v1 (admin-only RBAC, single-tenant demo).
- Existing init-job convention: `mongo-init`, `mongo-seed`, `kafka-init`, `gdfkube-connect-topics-init`, `gdfkube-debezium-init` all use `restart: "no"` + `service_completed_successfully` gating.

Stakeholders: solo developer (Hugo); local demo audience consuming the dev-container'd stack.

## Goals / Non-Goals

**Goals:**
- A `docker compose up` from a clean `down -v` state lands with: a healthy Gitea on `127.0.0.1:3001`, a `gdfkube` org, a `gdfkube/gdfkube-main` repo holding the workspace's `gdfkube-src/` tree (including `gdfkube-infra/charts/`), and a `gitea_settings` doc carrying a live PAT, endpoint `http://gitea:3000`, and owner `gdfkube`.
- The ITSM API container and Camel container both reach this Gitea without code edits — only env overrides on Camel and `depends_on` wiring on the API.
- Re-runs are idempotent: user-already-exists, org-already-exists, and repo-already-exists are all handled; the PAT is rotated each run; the repo is force-pushed so it tracks the current workspace.
- No live secrets in the repo; pre-commit trufflehog stays clean.

**Non-Goals:**
- A production Gitea install (deferred to RHACM/ArgoCD on the cluster side).
- SSH-based clones (HTTP+token is enough for Camel, CLI, and CI).
- TLS for the local Gitea (HTTP-on-loopback is acceptable for dev per existing pattern).
- Encryption-at-rest of the PAT in Mongo (already accepted risk in `add-gitea-settings/design.md`).
- Pre-seeding the per-org `gdfkube/gdfkube-<org>` repos — `RepoBootstrapRoute` creates them on demand.
- Editing the committed seed file, `seed-collections.js`, `adminSeeds.ts`, `export-seed-data.mjs`, or Camel's `application.properties` source.

## Decisions

### D1. Four sidecars, not one (the init-job split)

```
gitea (server, healthy)
  ↓
gitea-bootstrap (gitea image)  ──►  /data/itsm/token, org "gdfkube"
  ├──►  gitea-repo-seed (gitea image)  ──►  pushes gdfkube/gdfkube-main
  └──►  gitea-token-sync (mongo:7.0)   ──►  upserts gitea_settings
        ↑
        also depends on mongo-seed (completed_successfully)

gdfkube-itsm-api  ──►  depends_on gitea-token-sync
gdfkube-camel     ──►  depends_on gitea-repo-seed (+ env overrides)
```

- **Why split**: bootstrap (admin+token+org) is fast; repo-seed is slow (mirror+push); token-sync is independent of the bulky push. Splitting lets the API boot as soon as it has a token; only Camel has to wait on the repo push (which is what Camel actually needs).
- **Why these images**: `gitea/gitea:1.22` already has `gitea` CLI + `git` + `curl`; `mongo:7.0` already has `mongosh` and is already used by `mongo-seed`. No custom image build, no new image pull beyond the gitea one.
- **Alternative considered**: one monolithic `gitea-init` sidecar — rejected; mixes responsibilities and blocks the API on slow repo work.

### D2. SQLite, not Postgres

- Single-node dev needs no replication or concurrent-writer story.
- One fewer service in `docker-compose.yml`; one fewer volume.
- **Alternative considered**: Postgres backend — rejected; complexity not justified for a local demo.

### D3. Loopback-only host port `127.0.0.1:3001:3000`, no SSH port

- Matches the `mongo1`/`kafka1`/`gdfkube-debezium-connect` exposure style already in the file.
- HTTP+PAT works for Camel, CLI, CI; SSH adds key-distribution complexity with no payoff.
- **`ROOT_URL=http://127.0.0.1:3001/`** so browser-rendered links resolve from the host; internal API calls from other containers use `http://gitea:3000`.

### D4. Token lifecycle: generated each boot, written to a shared volume, never to argv

- `gitea admin user generate-access-token --token-name "${GITEA_TOKEN_NAME}-$(date +%s)" --scopes all --raw` — unique name per run avoids Gitea's "token name already used" error.
- Written to `/data/itsm/token` (chmod 600) on the `gitea-data` named volume; the two consumer sidecars (`gitea-repo-seed`, `gitea-token-sync`) mount it `:ro`.
- The mongosh upsert passes the token via env (`GITEA_LOCAL_TOKEN`), never on the command line — so it cannot leak via `ps`.
- The bootstrap script logs `token-bytes=$(wc -c < /data/itsm/token)`, never the token itself.
- **Alternative considered**: hard-coding a PAT in `.env.example` — rejected; trufflehog risk and demo-as-fresh semantic loss.

### D5. Mongo write semantics

- `seed-collections.js:74-81` uses `$setOnInsert` for `gitea_settings` — so `mongo-seed` only writes the placeholder when the doc doesn't exist.
- `gitea-token-sync` uses `$set` on the same `_id="gitea"` — so it correctly **refreshes** mutable fields (endpoint, owner, token, updatedBy, updatedAt) on every run without fighting the seed.
- This is the same singleton-doc shape the API already reads; no Mongo schema migration is needed.

### D6. Seed repo content: `gdfkube-src/` only, force-pushed on re-run

- The plan-stated user choice: mirror only the `gdfkube-src/` subtree (not the whole workspace) into `gdfkube/gdfkube-main`.
- Chart templates ride along inside the same repo at `gdfkube-infra/charts/`, so a separate "templates" repo is unnecessary.
- Bloat prune list: `node_modules`, `target`, `dist`, `build`, `.git`, `.DS_Store`.
- `git push --force` so a re-run reflects current workspace edits — there is no human committer to surprise on `main` (the repo is regenerated artifact, not a development branch).

### D7. Env overrides on Camel, no source edits

- `gdfkube-src/gdfkube-camel/src/main/resources/application.properties:11,15` holds the prod Gitea URL/owner. Adding `APP_SYSTEM_GITEA_EXTERNAL_URL=http://gitea:3000` and `APP_SYSTEM_GITEA_OWNER=gdfkube` on the `gdfkube-camel` compose service is sufficient (Quarkus's env-var binding turns `app.system.gitea-external-url` ↔ `APP_SYSTEM_GITEA_EXTERNAL_URL`).
- **Alternative considered**: a Quarkus profile — rejected; one env-var pair is simpler and matches what's already done for other services in compose.

## Risks / Trade-offs

- **Workspace-mirror push duration on first boot** → mitigation: prune `node_modules`/`target`/`dist`/`build`; the push is local-loopback so even uncompressed it's quick; API boot does not block on it (only Camel does).
- **`gitea-token-sync` runs before `mongo-seed` could establish the doc** → mitigation: explicit `depends_on { mongo-seed: service_completed_successfully }`. `$set` with `upsert:true` also tolerates the doc not yet existing.
- **PAT rotation breaks any out-of-band consumer cached the previous token** → mitigation: there are none in this demo path; the API re-reads from Mongo on each request and Camel reads from env at boot. The Settings UI's edit form continues to work because the audit fields are part of the same `$set`.
- **`git push --force` clobbers any human commits on `gdfkube/gdfkube-main`** → mitigation: documented as a regenerated artifact in the seed script's header comment; for the demo the repo is not meant to be hand-edited.
- **Idempotency of `gitea admin user create`** → mitigation: pipe `|| true` only for the user-create call; org-create distinguishes 201 from 422; repo-create distinguishes 201 from 409. Any other non-2xx fails the container (so the depends_on chain stops and the API never starts with a half-baked Gitea).
- **`COMPOSE_HOST_WORKSPACE` semantics on different hosts** → mitigation: use the same `${COMPOSE_HOST_WORKSPACE:-.}/gdfkube-src:/workspace-src:ro` style already in use elsewhere in `docker-compose.yml`.
- **Token leaking into logs** → mitigation: bootstrap script logs only byte-count; seed script uses `set +x` around the remote URL assembly; token-sync passes token via env, never argv. Verified by inspecting `docker compose logs` for the literal token at the end of `verify`.
- **`.env.example` placeholder password being mistaken for a real secret by trufflehog** → mitigation: append `# trufflehog:ignore` on the `GITEA_ADMIN_PASSWORD` line, per `/workspace/.claude/rules/no-secrets-in-code.md`.

## Migration Plan

This change is additive — no consumer-facing behavior changes, no Mongo schema migration, no Kafka consumer group rebalance, no Helm values touched. Roll-out:

1. Merge: a developer who already has the stack up should run `docker compose pull` (to fetch `gitea/gitea:1.22`) then `docker compose up -d` to start the new services. Existing services keep their data because only new top-level volumes are introduced.
2. For a fully fresh experience: `docker compose down -v && docker compose up -d`.

Rollback: revert the PR. The new services have no upstream consumers other than the two `depends_on` edges we add on `gdfkube-itsm-api` and `gdfkube-camel` (and the two env overrides on Camel) — removing those edges restores the previous boot graph. The new `gitea-data` volume can be deleted with `docker volume rm gdfkube_gitea-data` after rollback.

## Open Questions

None remaining. Plan resolved: `gdfkube-src/`-only mirror, no SSH port, SQLite backend, force-push on re-run, mongosh sidecar passes the token via env. Proceed to specs + tasks.
