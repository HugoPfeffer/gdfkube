# Local Gitea Compose Stack — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task. Each Task ends with a commit point; do not batch commits across Tasks.

**Goal:** Make `docker compose up` produce a working local Gitea reachable from the API and Camel containers, with a freshly-provisioned PAT in `gitea_settings`, the `gdfkube` org, and a `gdfkube/gdfkube-main` repo mirrored from `gdfkube-src/` — all without committing a live secret.

**Architecture:** Four new compose services on `gdfkube-net`: a long-running `gitea` server (SQLite, healthcheck-gated, loopback-only) plus three init-jobs (`gitea-bootstrap` → admin+token+org, `gitea-repo-seed` → workspace mirror push, `gitea-token-sync` → mongosh upsert into `gitea_settings`). `gdfkube-itsm-api` gates on `gitea-token-sync`; `gdfkube-camel` gates on `gitea-repo-seed` and reads two `APP_SYSTEM_GITEA_*` env overrides. The committed seed file remains a placeholder; live values flow from `/data/itsm/token` at boot.

**Tech Stack:** Docker Compose, `gitea/gitea:1.22`, `mongo:7.0` (mongosh), POSIX shell scripts, Quarkus env-var binding.

**Reference artifacts in this change:**
- `proposal.md`, `design.md` — why and how
- `specs/gitea-stack/spec.md` — testable requirements and scenarios
- `tasks.md` — coarse checklist (this plan is the micro-step decomposition)

---

## Task 1: Scaffold the three shell scripts under `gdfkube-src/gdfkube-infra/gitea/`

> Scope: tasks.md §1.1–1.5. End-state: three executable-by-`sh` scripts that pass shellcheck and never echo a token.

- [ ] **Step 1.1:** `mkdir -p /workspace/gdfkube-src/gdfkube-infra/gitea`. Verify with `ls -la /workspace/gdfkube-src/gdfkube-infra/gitea`.

- [ ] **Step 1.2:** Create `/workspace/gdfkube-src/gdfkube-infra/gitea/bootstrap.sh`:

  ```sh
  #!/bin/sh
  set -eu

  : "${GITEA_ADMIN_USERNAME:?required}"
  : "${GITEA_ADMIN_PASSWORD:?required}"
  : "${GITEA_ADMIN_EMAIL:?required}"
  : "${GITEA_TOKEN_NAME:?required}"
  : "${GITEA_ORG:?required}"

  mkdir -p /data/itsm

  # Admin user — idempotent (Gitea exits non-zero if exists; swallow it).
  su git -c "gitea admin user create \
      --username \"$GITEA_ADMIN_USERNAME\" \
      --password \"$GITEA_ADMIN_PASSWORD\" \
      --email \"$GITEA_ADMIN_EMAIL\" \
      --admin --must-change-password=false" || true

  # Fresh PAT — token-name must be unique per run, so suffix with epoch seconds.
  TOKEN=$(su git -c "gitea admin user generate-access-token \
      --username \"$GITEA_ADMIN_USERNAME\" \
      --token-name \"${GITEA_TOKEN_NAME}-$(date +%s)\" \
      --scopes all --raw")

  printf '%s' "$TOKEN" > /data/itsm/token
  chmod 600 /data/itsm/token

  # Org — POST returns 201 on create, 422 on already-exists; both OK.
  STATUS=$(curl -sf -o /dev/null -w "%{http_code}" \
      -u "$GITEA_ADMIN_USERNAME:$GITEA_ADMIN_PASSWORD" \
      -X POST http://gitea:3000/api/v1/orgs \
      -H "Content-Type: application/json" \
      -d "{\"username\":\"$GITEA_ORG\",\"visibility\":\"public\"}" \
      || true)
  case "$STATUS" in
      201|422) ;;
      *) echo "[gitea-bootstrap] org create failed with status=$STATUS" >&2; exit 1 ;;
  esac

  echo "[gitea-bootstrap] user=$GITEA_ADMIN_USERNAME org=$GITEA_ORG token-bytes=$(wc -c < /data/itsm/token)"
  unset TOKEN
  ```

  Verify: the file contains `set -eu`, the literal `--raw`, and that `echo` lines only print non-secret metadata.

- [ ] **Step 1.3:** Create `/workspace/gdfkube-src/gdfkube-infra/gitea/seed-repos.sh`:

  ```sh
  #!/bin/sh
  set -eu

  : "${GITEA_ADMIN_USERNAME:?required}"
  : "${GITEA_ORG:?required}"
  : "${GITEA_REPO_MAIN:?required}"

  TOKEN=$(cat /data/itsm/token)
  [ -n "$TOKEN" ] || { echo "[gitea-repo-seed] empty token file" >&2; exit 1; }

  STATUS=$(curl -sf -o /dev/null -w "%{http_code}" \
      -H "Authorization: token $TOKEN" \
      -X POST "http://gitea:3000/api/v1/orgs/$GITEA_ORG/repos" \
      -H "Content-Type: application/json" \
      -d "{\"name\":\"$GITEA_REPO_MAIN\",\"auto_init\":false,\"default_branch\":\"main\"}" \
      || true)
  case "$STATUS" in
      201|409) ;;
      *) echo "[gitea-repo-seed] repo create failed with status=$STATUS" >&2; exit 1 ;;
  esac

  WORK=$(mktemp -d)
  cp -a /workspace-src/. "$WORK/"
  find "$WORK" \( \
        -name node_modules -o \
        -name target -o \
        -name dist -o \
        -name build -o \
        -name .git -o \
        -name .DS_Store \
      \) -prune -exec rm -rf {} +

  cd "$WORK"
  git init -q -b main
  git config user.email "bootstrap@gdfkube.local"
  git config user.name "gitea-bootstrap"
  git add -A
  git commit -q -m "Initial bootstrap from workspace ($(date -u +%FT%TZ))"
  SHA=$(git rev-parse --short HEAD)

  # Suppress xtrace around the URL assembly so the token never lands in logs.
  set +x
  REMOTE="http://${GITEA_ADMIN_USERNAME}:${TOKEN}@gitea:3000/${GITEA_ORG}/${GITEA_REPO_MAIN}.git"
  git push -q --force "$REMOTE" main
  unset REMOTE TOKEN

  cd /
  rm -rf "$WORK"
  echo "[gitea-repo-seed] repo=$GITEA_ORG/$GITEA_REPO_MAIN commit=$SHA"
  ```

  Verify: no `echo "$TOKEN"`, no `echo "$REMOTE"`, no `set -x` before the URL.

- [ ] **Step 1.4:** Create `/workspace/gdfkube-src/gdfkube-infra/gitea/sync-token.sh`:

  ```sh
  #!/bin/sh
  set -eu

  : "${GITEA_ORG:?required}"

  GITEA_LOCAL_TOKEN=$(cat /data/itsm/token)
  [ -n "$GITEA_LOCAL_TOKEN" ] || { echo "[gitea-token-sync] empty token file" >&2; exit 1; }
  export GITEA_LOCAL_TOKEN

  mongosh --quiet "mongodb://mongo1:27017/gdfkube?replicaSet=rs0" --eval '
    db.gitea_settings.updateOne(
      { _id: "gitea" },
      { $set: {
          endpoint: "http://gitea:3000",
          owner: process.env.GITEA_ORG,
          token: process.env.GITEA_LOCAL_TOKEN,
          updatedBy: "gitea-init",
          updatedAt: new Date()
        } },
      { upsert: true }
    );
  '

  unset GITEA_LOCAL_TOKEN
  echo "[gitea-token-sync] gitea_settings upserted (owner=$GITEA_ORG)"
  ```

  Verify: token is passed via `process.env.GITEA_LOCAL_TOKEN`, never inline-substituted into the mongosh string; `$ docker inspect` of a running container would show no token in `Cmd`/`Args`.

- [ ] **Step 1.5:** Quick correctness sweep: shellcheck each script (`shellcheck gdfkube-src/gdfkube-infra/gitea/*.sh` if available) and read each top-to-bottom to confirm `set -eu`, no `echo`/`printf` of secret variables, and POSIX-portable syntax.

- [ ] **Step 1.6 — Commit:** `git add gdfkube-src/gdfkube-infra/gitea/` and commit `add gitea bootstrap, repo-seed, and token-sync scripts`.

---

## Task 2: Add the four new services and the volume to `docker-compose.yml`

> Scope: tasks.md §2.1–2.6. End-state: `docker compose config` parses without error and renders the four services on `gdfkube-net` with loopback-only port bindings.

- [ ] **Step 2.1:** Open `/workspace/docker-compose.yml`. In the top-level `volumes:` block (currently `docker-compose.yml:304-310`), append `gitea-data:` at the bottom of that map.

- [ ] **Step 2.2:** Insert the `gitea` service block. Place it near the other infrastructure services (above `gdfkube-itsm-api`, after the kafka/mongo blocks — adjacent to other infra is fine):

  ```yaml
    gitea:
      image: gitea/gitea:1.22
      container_name: gdfkube-gitea
      networks: [gdfkube-net]
      restart: unless-stopped
      ports:
        - "127.0.0.1:3001:3000"
      volumes:
        - gitea-data:/data
      environment:
        GITEA__database__DB_TYPE: sqlite3
        GITEA__server__DOMAIN: gitea
        GITEA__server__HTTP_PORT: "3000"
        GITEA__server__ROOT_URL: "http://127.0.0.1:3001/"
        GITEA__security__INSTALL_LOCK: "true"
        GITEA__service__DISABLE_REGISTRATION: "true"
        GITEA__log__LEVEL: warn
      healthcheck:
        test: ["CMD-SHELL", "curl -sf http://localhost:3000/api/v1/version || exit 1"]
        interval: 10s
        timeout: 5s
        retries: 18
        start_period: 30s
  ```

- [ ] **Step 2.3:** Immediately below `gitea`, add the `gitea-bootstrap` service:

  ```yaml
    gitea-bootstrap:
      image: gitea/gitea:1.22
      container_name: gdfkube-gitea-bootstrap
      networks: [gdfkube-net]
      restart: "no"
      depends_on:
        gitea: { condition: service_healthy }
      volumes:
        - gitea-data:/data
        - ./gdfkube-src/gdfkube-infra/gitea/bootstrap.sh:/bootstrap.sh:ro
      environment:
        GITEA_ADMIN_USERNAME: "${GITEA_ADMIN_USERNAME:-gdfkube-admin}"
        GITEA_ADMIN_PASSWORD: "${GITEA_ADMIN_PASSWORD:-ChangeMeLocally123!}"
        GITEA_ADMIN_EMAIL: "${GITEA_ADMIN_EMAIL:-admin@gdfkube.local}"
        GITEA_TOKEN_NAME: "${GITEA_TOKEN_NAME:-itsm-local}"
        GITEA_ORG: "${GITEA_ORG:-gdfkube}"
      entrypoint: ["sh", "/bootstrap.sh"]
  ```

- [ ] **Step 2.4:** Below `gitea-bootstrap`, add `gitea-repo-seed`:

  ```yaml
    gitea-repo-seed:
      image: gitea/gitea:1.22
      container_name: gdfkube-gitea-repo-seed
      networks: [gdfkube-net]
      restart: "no"
      depends_on:
        gitea-bootstrap: { condition: service_completed_successfully }
      volumes:
        - gitea-data:/data:ro
        - "${COMPOSE_HOST_WORKSPACE:-.}/gdfkube-src:/workspace-src:ro"
        - ./gdfkube-src/gdfkube-infra/gitea/seed-repos.sh:/seed-repos.sh:ro
      environment:
        GITEA_ADMIN_USERNAME: "${GITEA_ADMIN_USERNAME:-gdfkube-admin}"
        GITEA_ORG: "${GITEA_ORG:-gdfkube}"
        GITEA_REPO_MAIN: "${GITEA_REPO_MAIN:-gdfkube-main}"
      entrypoint: ["sh", "/seed-repos.sh"]
  ```

- [ ] **Step 2.5:** Below `gitea-repo-seed`, add `gitea-token-sync`:

  ```yaml
    gitea-token-sync:
      image: mongo:7.0
      container_name: gdfkube-gitea-token-sync
      networks: [gdfkube-net]
      restart: "no"
      depends_on:
        gitea-bootstrap: { condition: service_completed_successfully }
        mongo-seed:      { condition: service_completed_successfully }
      volumes:
        - gitea-data:/data:ro
        - ./gdfkube-src/gdfkube-infra/gitea/sync-token.sh:/scripts/sync-token.sh:ro
      environment:
        GITEA_ORG: "${GITEA_ORG:-gdfkube}"
      entrypoint: ["sh", "/scripts/sync-token.sh"]
  ```

- [ ] **Step 2.6:** Validate `docker-compose.yml` parses: `docker compose config --quiet`. Expect zero output and exit 0. Also: `docker compose config | grep -E '\b3000:|0\.0\.0\.0:'` MUST find nothing for Gitea (would indicate an accidental non-loopback bind).

- [ ] **Step 2.7 — Commit:** `git add docker-compose.yml` and commit `add gitea + bootstrap + repo-seed + token-sync compose services`.

---

## Task 3: Wire downstream dependencies and Camel env overrides

> Scope: tasks.md §3.1–3.3. End-state: API gates on `gitea-token-sync`; Camel gates on `gitea-repo-seed` and reads the local Gitea endpoint/owner.

- [ ] **Step 3.1:** In `/workspace/docker-compose.yml`, locate the `gdfkube-itsm-api` block (currently around `docker-compose.yml:47-66`). Under its `depends_on:` map, add:

  ```yaml
        gitea-token-sync:
          condition: service_completed_successfully
  ```

  Keep every other dependency exactly as-is.

- [ ] **Step 3.2:** Locate the `gdfkube-camel` block (around `docker-compose.yml:273-298`). Under its `depends_on:` map, add:

  ```yaml
        gitea-repo-seed:
          condition: service_completed_successfully
  ```

- [ ] **Step 3.3:** In the same `gdfkube-camel` block, under `environment:` (already contains `QUARKUS_PROFILE: dev`), append two lines:

  ```yaml
        APP_SYSTEM_GITEA_EXTERNAL_URL: "http://gitea:3000"
        APP_SYSTEM_GITEA_OWNER: "${GITEA_ORG:-gdfkube}"
  ```

- [ ] **Step 3.4:** Re-validate compose: `docker compose config --quiet` (exit 0). Spot-check rendered YAML: `docker compose config | sed -n '/gdfkube-itsm-api:/,/^  [a-z]/p' | grep gitea-token-sync` should print the new edge.

- [ ] **Step 3.5 — Commit:** `git add docker-compose.yml` and commit `wire itsm-api and camel to local gitea sidecars`.

---

## Task 4: Author `.env.example`

> Scope: tasks.md §4.1–4.3. End-state: `.env.example` documents the five `GITEA_*` overrides; trufflehog stays clean.

- [ ] **Step 4.1:** Check existence: `ls /workspace/.env.example 2>/dev/null`. If it does not exist, create it; otherwise append.

- [ ] **Step 4.2:** Append (or write) this block — note the **`# trufflehog:ignore`** comment on the password line:

  ```dotenv
  # Local Gitea bootstrap (override in .env for your machine; values below are placeholders)
  GITEA_ADMIN_USERNAME=gdfkube-admin
  GITEA_ADMIN_PASSWORD=ChangeMeLocally123!   # trufflehog:ignore
  GITEA_ADMIN_EMAIL=admin@gdfkube.local
  GITEA_TOKEN_NAME=itsm-local
  GITEA_ORG=gdfkube
  ```

- [ ] **Step 4.3:** Sanity-check: `grep -n 'trufflehog:ignore' /workspace/.env.example` must hit the password line; no other line needs the comment. Run `pre-commit run --files .env.example` and confirm trufflehog passes.

- [ ] **Step 4.4 — Commit:** `git add .env.example` and commit `document local gitea env overrides in .env.example`.

---

## Task 5: Confirm explicitly-untouched files (drift guard)

> Scope: tasks.md §5.1–5.4. End-state: `git status` shows none of the protected files in any staged or unstaged diff for this change.

- [ ] **Step 5.1:** `git status --porcelain gdfkube-src/gdfkube-infra/mongodb/seed-data/settings.json gdfkube-src/gdfkube-infra/mongodb/seed-collections.js gdfkube-src/gdfkube-itsm/src/data/adminSeeds.ts gdfkube-src/gdfkube-itsm/scripts/export-seed-data.mjs gdfkube-src/gdfkube-camel/src/main/resources/application.properties`.

  Expected: empty output for **this change's** contribution. (Note: the working tree already shows pre-existing modifications from in-flight changes `add-gitea-settings` and `fix-gitea-settings-review` — those are not introduced by this change and MUST not be reverted by this work.)

- [ ] **Step 5.2:** If any of those files appears in `git diff HEAD` due to *this change's* commits, revert just that file with `git restore --staged <file> && git checkout -- <file>` and re-run the validation.

---

## Task 6: End-to-end smoke test

> Scope: tasks.md §6.1–6.9. End-state: a fresh `docker compose up` lands a working demo path.

- [ ] **Step 6.1:** From `/workspace`: `docker compose down -v`. Expect clean exit; all named volumes removed.

- [ ] **Step 6.2:** (Optional, recommended) `cp .env.example .env`.

- [ ] **Step 6.3:** Bring up the slice: `docker compose up -d gitea gitea-bootstrap gitea-repo-seed gitea-token-sync mongo1 mongo2 mongo3 mongo-init mongo-seed gdfkube-itsm-api itsm gdfkube-camel`.

- [ ] **Step 6.4:** `docker compose ps` — confirm `gitea` is `healthy` and `gitea-bootstrap`, `gitea-repo-seed`, `gitea-token-sync` all show `Exited (0)`.

  Failure-mode hints:
  - `gitea-bootstrap` non-zero → `docker compose logs gitea-bootstrap`; common causes: org-create returning unexpected status, admin email already in use (re-run handles user collision via `|| true`; email collision needs the admin user to actually exist, otherwise re-create).
  - `gitea-repo-seed` non-zero → token unreadable from `/data/itsm/token`, or `git push` refused (force-push should always succeed; if it doesn't, check `git fetch http://...` separately).
  - `gitea-token-sync` non-zero → `mongo-seed` likely didn't reach `service_completed_successfully` (replica set not yet voted-in); re-run after `mongo-init` exits.

- [ ] **Step 6.5:** Browser smoke: visit `http://127.0.0.1:3001/`, log in as `gdfkube-admin` / value of `GITEA_ADMIN_PASSWORD` (from `.env` or the default `ChangeMeLocally123!`). Confirm: org `gdfkube` exists; repo `gdfkube/gdfkube-main` exists on `main` with one commit; repo browses to `gdfkube-infra/charts/{cluster-request,namespace-request,scale-patch,infra}/`; `/user/sign_up` is disabled.

- [ ] **Step 6.6:** Via the MongoDB MCP `find` tool, query `database=gdfkube`, `collection=gitea_settings`, `filter={_id:"gitea"}`. Confirm:
  - `endpoint == "http://gitea:3000"`
  - `owner == "gdfkube"`
  - `token.length >= 40` and `token != "CHANGE_ME"`
  - `updatedBy == "gitea-init"`

- [ ] **Step 6.7:** Open the ITSM SPA at `http://127.0.0.1:5174/` (or wherever `itsm` exposes its dev port), log in as Maria → user menu → **Settings**. Confirm: endpoint `http://gitea:3000`, owner `gdfkube`, token shows masked `***`. Toggle reveal → live token shown.

- [ ] **Step 6.8:** API-container smoke (proves the API can reach Gitea with the seeded token):

  ```sh
  docker compose exec gdfkube-itsm-api sh -c 'TOK=$(mongosh --quiet "mongodb://mongo1:27017/gdfkube?replicaSet=rs0" --eval "print(db.gitea_settings.findOne({_id:\"gitea\"}).token)" | tail -n1); wget -qO- --header="Authorization: token $TOK" http://gitea:3000/api/v1/repos/gdfkube/gdfkube-main'
  ```

  Expect a JSON body with `"full_name":"gdfkube/gdfkube-main"`.

- [ ] **Step 6.9:** Camel smoke: submit a sample request through the ITSM flow that triggers `RepoBootstrapRoute`. Confirm a new repo `gdfkube/gdfkube-<org>` appears in Gitea, rendered from templates that resolve under `gdfkube/gdfkube-main` at `gdfkube-infra/charts/`. (Reference: `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/RepoBootstrapRoute.java:43-54`.)

---

## Task 7: Idempotency, secret-leak, and pre-commit guards

> Scope: tasks.md §7.1–7.4. End-state: re-running the stack is a clean no-op; logs are token-free; pre-commit hook is green.

- [ ] **Step 7.1:** Re-run `docker compose up -d`. The three init sidecars should re-exit 0 (admin user collision swallowed, fresh token rotated in the file and in Mongo, repo force-pushed). Confirm with `docker compose logs gitea-bootstrap gitea-repo-seed gitea-token-sync | tail -n 50`.

- [ ] **Step 7.2:** Secret-leak check: capture the live token and grep logs for it (must produce zero hits):

  ```sh
  TOK=$(docker compose exec -T mongo1 mongosh --quiet "mongodb://mongo1:27017/gdfkube?replicaSet=rs0" --eval 'print(db.gitea_settings.findOne({_id:"gitea"}).token)' | tail -n1)
  docker compose logs gitea-bootstrap gitea-repo-seed gitea-token-sync | grep -F "$TOK" && echo "FAIL: token leaked into logs" || echo "OK: no token in logs"
  ```

- [ ] **Step 7.3:** Full fresh-start test: `docker compose down -v && docker compose up -d`. Re-run Steps 6.4–6.6. Confirm the new token differs from the previous one in `gitea_settings.token`.

- [ ] **Step 7.4:** `pre-commit run --all-files`. Trufflehog must report no findings. If it flags `.env.example`'s `GITEA_ADMIN_PASSWORD`, confirm the `# trufflehog:ignore` comment is on the same line and re-run.

- [ ] **Step 7.5 — Commit (only if any small fixes were needed during verification):** typically nothing to commit here; if a script edit was required, commit it as `fix: <one-line>`.

---

## Task 8: Close out the OpenSpec change

> Scope: tasks.md §8.1–8.2. End-state: the change is ready for `/opsx:apply` to archive after `verify.md` and `retrospective.md` are authored in the apply step.

- [ ] **Step 8.1:** From `/workspace`: `openspec status --change "add-local-gitea-compose"`. Confirm `brainstorm`, `design`, `proposal`, `specs`, `tasks`, and `plan` are all `done`; `verify` and `retrospective` remain pending (they belong to the apply phase, not propose).

- [ ] **Step 8.2:** Final tidy: `git status` — confirm only the four expected sets of changes are staged/committed: `gdfkube-src/gdfkube-infra/gitea/{bootstrap,seed-repos,sync-token}.sh`, `docker-compose.yml`, `.env.example`, and the OpenSpec change folder under `openspec/changes/add-local-gitea-compose/`.

- [ ] **Step 8.3 — Commit (OpenSpec artifacts):** `git add openspec/changes/add-local-gitea-compose/` and commit `add openspec change: add-local-gitea-compose`. (If you prefer the artifacts inside the same commits as the implementation, that's also fine — solo developer judgment call.)
