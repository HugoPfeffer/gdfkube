# SonarQube Community Test Container Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire a SonarQube Community Edition container (plus Postgres) into the local/devcontainer stack, instrument all three test suites for coverage, and add opt-in per-module sonar entrypoints whose quality gate fails the build.

**Architecture:** SonarQube + Postgres run as long-lived `docker-compose.yml` services on the existing `gdfkube-net`, provisioned by a one-shot `sonar-bootstrap` modeled on the existing `gitea-bootstrap`/`gitea-token-sync` pattern (token minted into a named volume, never logged). Coverage is version-matched per module (Quarkus JaCoCo / Vitest v8 ^1.6.1 / ^2.1.0). A `scripts/sonar.sh` orchestrator runs coverage then a pinned scanner image with `sonar.qualitygate.wait=true`, exiting non-zero on gate failure.

**Tech Stack:** Docker Compose, SonarQube `2025.1.1-community`, PostgreSQL `15.10-alpine`, `curlimages/curl:8.11.1`, Quarkus 3.16.3 (`io.quarkus:quarkus-jacoco`), `sonar-maven-plugin:5.1.0.4751`, Vitest (`@vitest/coverage-v8` `^1.6.1`/`^2.1.0`), `sonarsource/sonar-scanner-cli:11.1`, POSIX `sh`.

**Reference artifacts in this change dir:** `proposal.md`, `design.md`, `specs/sonarqube-analysis-stack/spec.md`, `specs/coverage-instrumentation/spec.md`, `specs/sonar-scan-orchestration/spec.md`, source PRD `openspec/prd/add-sonarqube-test-container.md`.

**Conventions observed in the existing codebase (follow these exactly):**
- Compose host-mounts use the `${COMPOSE_HOST_WORKSPACE:-.}` prefix and `:ro`.
- Compose network shorthand is `networks: [gdfkube-net]`.
- One-shot init services: `restart: "no"`, `depends_on: { <svc>: { condition: service_healthy } }`, env via `${VAR:-default}`, `entrypoint: ["sh", "/script.sh"]`.
- Init scripts: `#!/bin/sh`, `set -eu`, `: "${VAR:?required}"` guards, `|| true` for idempotent create, `>&2` + `exit 1` on FATAL, token via `printf '%s' "$TOKEN" > file; chmod 600`, name tokens `"<base>-$(date +%s)"`.
- camel `pom.xml`: build dir is `${project.basedir}/build`; BOM is `io.quarkus.platform:quarkus-bom:3.16.3`; there is **no** `<profiles>` section yet (add before `</project>`); `<skipITs>true</skipITs>` by default.
- `.gitignore` **already** has `**/build/` and `**/target/` — only `**/coverage/` is missing.
- Secrets rule (`.claude/rules/no-secrets-in-code.md`): never log/echo tokens; placeholder credentials in `.env.example` get `# trufflehog:ignore`.

---

## Task 1: sonar-bootstrap provisioning script

**Files:**
- Create: `gdfkube-src/gdfkube-infra/sonarqube/bootstrap.sh`

- [ ] **Step 1: Create the script skeleton with guards**

Create `gdfkube-src/gdfkube-infra/sonarqube/bootstrap.sh`:

```sh
#!/bin/sh
set -eu

: "${SONAR_URL:=http://sonarqube:9000}"
: "${SONAR_ADMIN_PASSWORD:?required}"
: "${SONAR_TOKEN_NAME:=gdfkube-analysis}"
: "${SONAR_PROJECTS:=gdfkube-camel,gdfkube-itsm-web,gdfkube-itsm-server}"
: "${SONAR_GATE_NAME:=gdfkube-gate}"
TOKEN_DIR=/sonar

log() { echo "[sonar-bootstrap] $*"; }
api() { # api METHOD PATH [curl-args...]; auths with $AUTH
  _m=$1; _p=$2; shift 2
  curl -s -o /tmp/resp -w '%{http_code}' -u "$AUTH" -X "$_m" "$SONAR_URL$_p" "$@"
}
```

- [ ] **Step 2: Implement idempotent admin password rotation**

Append:

```sh
# 1. Rotate default admin/admin; tolerate already-rotated (idempotent re-run).
AUTH="admin:admin"
ROT=$(api POST "/api/authentication/change_password" \
  --data-urlencode "login=admin" \
  --data-urlencode "previousPassword=admin" \
  --data-urlencode "password=$SONAR_ADMIN_PASSWORD" || echo 000)
if [ "$ROT" = "204" ] || [ "$ROT" = "200" ]; then
  log "admin password rotated"
  AUTH="admin:$SONAR_ADMIN_PASSWORD"
else
  AUTH="admin:$SONAR_ADMIN_PASSWORD"
  CHK=$(api GET "/api/authentication/validate" || echo 000)
  if ! grep -q '"valid":true' /tmp/resp 2>/dev/null; then
    log "FATAL: neither default nor rotated admin credentials are valid (http=$ROT/$CHK)" >&2
    exit 1
  fi
  log "admin password already rotated (idempotent)"
fi
```

- [ ] **Step 3: Create the three projects (tolerate exists)**

Append:

```sh
# 2. Create projects (tolerate "already exists" -> 400).
OLD_IFS=$IFS; IFS=,
for KEY in $SONAR_PROJECTS; do
  IFS=$OLD_IFS
  C=$(api POST "/api/projects/create" \
    --data-urlencode "project=$KEY" --data-urlencode "name=$KEY" || echo 000)
  [ "$C" = "200" ] && log "project created: $KEY" || log "project $KEY exists/skip (http=$C)"
  IFS=,
done
IFS=$OLD_IFS
```

- [ ] **Step 4: Create the gdfkube-gate quality gate on New Code**

Append:

```sh
# 3. Quality gate on New Code; set default; bind all projects.
api POST "/api/qualitygates/create" --data-urlencode "name=$SONAR_GATE_NAME" >/dev/null || true
addcond() { # metric op error
  api POST "/api/qualitygates/create_condition" \
    --data-urlencode "gateName=$SONAR_GATE_NAME" \
    --data-urlencode "metric=$1" --data-urlencode "op=$2" \
    --data-urlencode "error=$3" >/dev/null || true
}
addcond new_coverage LT 80
addcond new_duplicated_lines_density GT 3
addcond new_maintainability_rating GT 1
addcond new_reliability_rating GT 1
addcond new_security_rating GT 1
addcond new_blocker_violations GT 0
addcond new_critical_violations GT 0
api POST "/api/qualitygates/set_as_default" \
  --data-urlencode "name=$SONAR_GATE_NAME" >/dev/null || true
OLD_IFS=$IFS; IFS=,
for KEY in $SONAR_PROJECTS; do
  IFS=$OLD_IFS
  api POST "/api/qualitygates/select" \
    --data-urlencode "gateName=$SONAR_GATE_NAME" \
    --data-urlencode "projectKey=$KEY" >/dev/null || true
  IFS=,
done
IFS=$OLD_IFS
```

- [ ] **Step 5: Mint the analysis token into the volume (never logged)**

Append:

```sh
# 4. Mint a fresh global analysis token into the sonar-init volume.
mkdir -p "$TOKEN_DIR"
api POST "/api/user_tokens/generate" \
  --data-urlencode "name=${SONAR_TOKEN_NAME}-$(date +%s)" \
  --data-urlencode "type=GLOBAL_ANALYSIS_TOKEN" >/dev/null
TOKEN=$(sed -n 's/.*"token":"\([^"]*\)".*/\1/p' /tmp/resp)
if [ -z "$TOKEN" ]; then
  log "FATAL: token generation returned empty token" >&2
  exit 1
fi
printf '%s' "$TOKEN" > "$TOKEN_DIR/token"
chmod 600 "$TOKEN_DIR/token"
printf '%s' "$SONAR_URL" > "$TOKEN_DIR/url"
unset TOKEN
log "done: projects=$SONAR_PROJECTS gate=$SONAR_GATE_NAME url=$SONAR_URL"
```

- [ ] **Step 6: Lint the script for syntax**

Run: `sh -n gdfkube-src/gdfkube-infra/sonarqube/bootstrap.sh`
Expected: no output, exit 0.

- [ ] **Step 7: Confirm no secret is ever echoed**

Run: `grep -nE 'echo|log|printf' gdfkube-src/gdfkube-infra/sonarqube/bootstrap.sh | grep -i token`
Expected: only the `${SONAR_TOKEN_NAME}` generate call and the `unset TOKEN` / non-secret `done:` summary — the raw `$TOKEN` value is never in a log/echo argument.

- [ ] **Step 8: Commit**

```bash
git add gdfkube-src/gdfkube-infra/sonarqube/bootstrap.sh
git commit -m "feat(sonar): add idempotent sonar-bootstrap provisioning script"
```

---

## Task 2: SonarQube + Postgres + bootstrap compose services

**Files:**
- Modify: `docker-compose.yml` (add 3 services; extend `volumes:` block)

- [ ] **Step 1: Add the sonar-db service**

In `docker-compose.yml`, add inside `services:` (place the block just before the `gdfkube-camel` service, after `gitea-token-sync`):

```yaml
  sonar-db:
    image: postgres:15.10-alpine
    container_name: gdfkube-sonar-db
    networks: [gdfkube-net]
    restart: unless-stopped
    environment:
      POSTGRES_USER: sonar
      POSTGRES_PASSWORD: "${SONAR_DB_PASSWORD:-sonar}"
      POSTGRES_DB: sonar
    volumes:
      - sonar-db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U sonar -d sonar"]
      interval: 10s
      timeout: 5s
      retries: 18
      start_period: 20s
```

- [ ] **Step 2: Add the sonarqube service**

Add directly after `sonar-db`:

```yaml
  sonarqube:
    image: sonarqube:2025.1.1-community
    container_name: gdfkube-sonarqube
    networks: [gdfkube-net]
    restart: unless-stopped
    depends_on:
      sonar-db: { condition: service_healthy }
    ports:
      - "127.0.0.1:9000:9000"
    environment:
      SONAR_JDBC_URL: "jdbc:postgresql://sonar-db:5432/sonar"
      SONAR_JDBC_USERNAME: sonar
      SONAR_JDBC_PASSWORD: "${SONAR_DB_PASSWORD:-sonar}"
      SONAR_ES_BOOTSTRAP_CHECKS_DISABLE: "true"
      SONAR_WEB_JAVAADDITIONALOPTS: "-Xms512m -Xmx768m"
      SONAR_CE_JAVAADDITIONALOPTS: "-Xms512m -Xmx768m"
      SONAR_SEARCH_JAVAADDITIONALOPTS: "-Xms512m -Xmx512m"
    ulimits:
      nofile: 65536
    volumes:
      - sonarqube-data:/opt/sonarqube/data
      - sonarqube-extensions:/opt/sonarqube/extensions
      - sonarqube-logs:/opt/sonarqube/logs
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:9000/api/system/status | grep -q '\"status\":\"UP\"'"]
      interval: 15s
      timeout: 5s
      retries: 24
      start_period: 120s
```

- [ ] **Step 3: Add the sonar-bootstrap one-shot init service**

Add directly after `sonarqube`:

```yaml
  sonar-bootstrap:
    image: curlimages/curl:8.11.1
    container_name: gdfkube-sonar-bootstrap
    networks: [gdfkube-net]
    restart: "no"
    depends_on:
      sonarqube: { condition: service_healthy }
    volumes:
      - sonar-init:/sonar
      - ${COMPOSE_HOST_WORKSPACE:-.}/gdfkube-src/gdfkube-infra/sonarqube/bootstrap.sh:/bootstrap.sh:ro
    environment:
      SONAR_URL: "http://sonarqube:9000"
      SONAR_ADMIN_PASSWORD: "${SONAR_ADMIN_PASSWORD:-gdfkube-sonar-admin}"
      SONAR_DB_PASSWORD: "${SONAR_DB_PASSWORD:-sonar}"
      SONAR_TOKEN_NAME: "${SONAR_TOKEN_NAME:-gdfkube-analysis}"
      SONAR_PROJECTS: "${SONAR_PROJECTS:-gdfkube-camel,gdfkube-itsm-web,gdfkube-itsm-server}"
    entrypoint: ["sh", "/bootstrap.sh"]
```

- [ ] **Step 4: Declare the five named volumes**

In the `volumes:` block at the end of `docker-compose.yml` (currently ends with `gitea-data:`), add:

```yaml
  sonarqube-data:
  sonarqube-extensions:
  sonarqube-logs:
  sonar-db-data:
  sonar-init:
```

- [ ] **Step 5: Validate compose syntax**

Run: `docker compose config -q`
Expected: no output, exit 0 (no YAML/interpolation errors).

- [ ] **Step 6: Confirm no existing service was touched**

Run: `git diff docker-compose.yml | grep -E '^\+' | grep -vE 'sonar' | grep -vE '^\+\+\+'`
Expected: only the 5 volume lines and structural blank lines — no `+` line modifies an existing service.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml
git commit -m "feat(sonar): add sonarqube, sonar-db, sonar-bootstrap compose services"
```

---

## Task 3: .env.example overrides

**Files:**
- Modify: `.env.example` (append a `SONAR_*` block mirroring the `GITEA_*` block)

- [ ] **Step 1: Append the SONAR_* override block**

Append to `.env.example`, mirroring the existing `GITEA_*` block's style (commented placeholder values, one per line):

```sh
# --- SonarQube (local/devcontainer only) ---
SONAR_ADMIN_PASSWORD=gdfkube-sonar-admin   # trufflehog:ignore
SONAR_DB_PASSWORD=sonar                    # trufflehog:ignore
SONAR_TOKEN_NAME=gdfkube-analysis
SONAR_PROJECTS=gdfkube-camel,gdfkube-itsm-web,gdfkube-itsm-server
```

- [ ] **Step 2: Verify trufflehog stays clean**

Run: `pre-commit run trufflehog --files .env.example`
Expected: Passed (placeholders carry `# trufflehog:ignore`).

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore(sonar): document SONAR_* env overrides in .env.example"
```

---

## Task 4: Bring-up & bootstrap verification

**Files:** none (verification only)

- [ ] **Step 1: Bring up the SonarQube stack**

Run: `docker compose up -d sonarqube sonar-db sonar-bootstrap`
Expected: containers created; `sonar-bootstrap` runs after `sonarqube` is healthy.

- [ ] **Step 2: Wait for and assert SonarQube is UP**

Run: `until curl -sf http://127.0.0.1:9000/api/system/status | grep -q '"status":"UP"'; do sleep 5; done; echo READY`
Expected: `READY` within ~120s.

- [ ] **Step 3: Assert bootstrap exited 0 with a non-secret summary**

Run: `docker wait gdfkube-sonar-bootstrap; docker logs gdfkube-sonar-bootstrap | tail -3`
Expected: exit code `0`; final log line `[sonar-bootstrap] done: projects=gdfkube-camel,gdfkube-itsm-web,gdfkube-itsm-server gate=gdfkube-gate url=http://sonarqube:9000`; **no token value** anywhere in the log.

- [ ] **Step 4: Assert the token landed in the volume with mode 600**

Run: `docker compose run --rm -v sonar-init:/s --entrypoint sh sonar-bootstrap -c 'stat -c "%a" /s/token; cat /s/url'`
Expected: `600` and `http://sonarqube:9000`.

- [ ] **Step 5: DB-dependency proof (deliberate fail)**

Run: `docker compose stop sonar-db && docker compose restart sonarqube && sleep 30 && curl -s http://127.0.0.1:9000/api/system/status`
Expected: status is NOT `UP` (DB dependency enforced). Then `docker compose start sonar-db` to restore.

- [ ] **Step 6: Bootstrap idempotency proof**

Run: `docker compose up sonar-bootstrap` (re-run against the rotated instance)
Expected: log `admin password already rotated (idempotent)`, project lines say `exists/skip`, exit `0`.

- [ ] **Step 7: Bootstrap bad-credential proof (deliberate fail)**

Run: `SONAR_ADMIN_PASSWORD=wrongpass docker compose run --rm sonar-bootstrap`
Expected: `FATAL: neither default nor rotated admin credentials are valid`, exit `1`.

- [ ] **Step 8: Commit (verification notes only, if any tracking file is used — otherwise skip)**

No code change in this task; proceed to Task 5.

---

## Task 5: Java (camel) coverage instrumentation

**Files:**
- Modify: `gdfkube-src/gdfkube-camel/pom.xml`

- [ ] **Step 1: Add the quarkus-jacoco test dependency**

In `gdfkube-src/gdfkube-camel/pom.xml`, inside the `<dependencies>` block (the one starting at the project-level `<dependencies>` element, not `<dependencyManagement>`), add (version comes from the imported `quarkus-bom` — do **not** add a `<version>`):

```xml
    <dependency>
      <groupId>io.quarkus</groupId>
      <artifactId>quarkus-jacoco</artifactId>
      <scope>test</scope>
    </dependency>
```

- [ ] **Step 2: Pin the report path and merge exec across Surefire/Failsafe**

Create `gdfkube-src/gdfkube-camel/src/test/resources/application.properties` (or append if it exists):

```properties
quarkus.jacoco.reuse-data-file=true
quarkus.jacoco.data-file=${maven.multiModuleProjectDirectory}/build/jacoco-quarkus.exec
quarkus.jacoco.report-location=jacoco-report
```

This yields the merged report at `build/jacoco-report/jacoco.xml` (build dir is `build/`, per `<directory>${project.basedir}/build</directory>`).

- [ ] **Step 3: Pass the JaCoCo agent through to the Failsafe IT execution**

In `pom.xml`, in the existing `maven-failsafe-plugin` `<configuration>`, add an `<argLine>` so packaged-jar ITs attach the agent best-effort (IT coverage is best-effort per design.md — partial coverage is acceptable; the gate targets New Code):

```xml
          <argLine>@{jacocoArgLine}</argLine>
```

- [ ] **Step 4: Verify the build produces the report**

Run: `cd gdfkube-src/gdfkube-camel && ./mvnw -B -DskipITs=false clean verify -q`
Expected: BUILD SUCCESS; `gdfkube-src/gdfkube-camel/build/jacoco-report/jacoco.xml` exists.

- [ ] **Step 5: Verify the inner loop is unaffected**

Run: `cd gdfkube-src/gdfkube-camel && ./mvnw -B verify -q` (skipITs default true, no SonarQube)
Expected: BUILD SUCCESS, no network call to SonarQube.

- [ ] **Step 6: Commit**

```bash
git add gdfkube-src/gdfkube-camel/pom.xml gdfkube-src/gdfkube-camel/src/test/resources/application.properties
git commit -m "feat(sonar): add Quarkus JaCoCo coverage to gdfkube-camel"
```

---

## Task 6: SPA + server coverage instrumentation

**Files:**
- Modify: `gdfkube-src/gdfkube-itsm/package.json`, `gdfkube-src/gdfkube-itsm/vite.config.ts`
- Modify: `gdfkube-src/gdfkube-itsm/server/package.json`, `gdfkube-src/gdfkube-itsm/server/vitest.config.ts`

- [ ] **Step 1: Add version-matched coverage dep + sonar script (SPA)**

In `gdfkube-src/gdfkube-itsm/package.json`, add to `devDependencies` (MUST be `^1.6.1` to match `vitest@^1.6.1` — v2 breaks `npm ci` here):

```json
    "@vitest/coverage-v8": "^1.6.1",
```

Add to `scripts`:

```json
    "sonar": "vitest run --coverage",
```

- [ ] **Step 2: Add the coverage block to vite.config.ts (SPA)**

In `gdfkube-src/gdfkube-itsm/vite.config.ts`, extend the existing `test:` object (after the `exclude:` line, before the closing `}`):

```ts
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
    },
```

- [ ] **Step 3: Add version-matched coverage dep + sonar script (server)**

In `gdfkube-src/gdfkube-itsm/server/package.json`, add to `devDependencies` (MUST match `vitest@^2.1.0`):

```json
    "@vitest/coverage-v8": "^2.1.0",
```

Add to `scripts`:

```json
    "sonar": "vitest run --coverage",
```

- [ ] **Step 4: Add the coverage block to vitest.config.ts (server)**

In `gdfkube-src/gdfkube-itsm/server/vitest.config.ts`, extend the existing `test:` object (after `setupFiles:`):

```ts
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
    },
```

- [ ] **Step 5: Verify npm ci stays consistent and coverage is produced (SPA)**

Run: `cd gdfkube-src/gdfkube-itsm && npm ci && npm run sonar`
Expected: `npm ci` succeeds (no peer-dep break); `gdfkube-src/gdfkube-itsm/coverage/lcov.info` exists.

- [ ] **Step 6: Verify npm ci stays consistent and coverage is produced (server)**

Run: `cd gdfkube-src/gdfkube-itsm/server && npm ci && npm run sonar`
Expected: `npm ci` succeeds; `gdfkube-src/gdfkube-itsm/server/coverage/lcov.info` exists.

- [ ] **Step 7: Verify inner loop unaffected (both modules)**

Run: `cd gdfkube-src/gdfkube-itsm && npm test` then `cd server && npm test`
Expected: both pass exactly as before, no SonarQube dependency.

- [ ] **Step 8: Commit**

```bash
git add gdfkube-src/gdfkube-itsm/package.json gdfkube-src/gdfkube-itsm/vite.config.ts gdfkube-src/gdfkube-itsm/server/package.json gdfkube-src/gdfkube-itsm/server/vitest.config.ts
git commit -m "feat(sonar): add version-matched Vitest v8 coverage to itsm SPA and server"
```

---

## Task 7: .gitignore coverage entry

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add only the missing coverage entry**

`.gitignore` already has `**/build/` and `**/target/` (camel `build/` is already covered — do NOT duplicate). Add one line:

```gitignore
**/coverage/
```

- [ ] **Step 2: Verify coverage output is ignored**

Run: `git status --porcelain gdfkube-src/gdfkube-itsm/coverage gdfkube-src/gdfkube-camel/build`
Expected: empty output (both ignored, not untracked).

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore(sonar): gitignore coverage output"
```

---

## Task 8: Java sonar Maven profile

**Files:**
- Modify: `gdfkube-src/gdfkube-camel/pom.xml` (add a `<profiles>` section before `</project>`)

- [ ] **Step 1: Add the opt-in sonar profile**

In `gdfkube-src/gdfkube-camel/pom.xml`, immediately before the closing `</project>` (there is no existing `<profiles>` section), add:

```xml
  <profiles>
    <profile>
      <id>sonar</id>
      <properties>
        <sonar.host.url>http://sonarqube:9000</sonar.host.url>
        <sonar.qualitygate.wait>true</sonar.qualitygate.wait>
        <sonar.projectKey>gdfkube-camel</sonar.projectKey>
        <sonar.java.binaries>build/classes</sonar.java.binaries>
        <sonar.coverage.jacoco.xmlReportPaths>build/jacoco-report/jacoco.xml</sonar.coverage.jacoco.xmlReportPaths>
      </properties>
      <build>
        <plugins>
          <plugin>
            <groupId>org.sonarsource.scanner.maven</groupId>
            <artifactId>sonar-maven-plugin</artifactId>
            <version>5.1.0.4751</version>
          </plugin>
        </plugins>
      </build>
    </profile>
  </profiles>
```

- [ ] **Step 2: Verify the profile is inactive by default**

Run: `cd gdfkube-src/gdfkube-camel && ./mvnw -B help:active-profiles -q | grep -i sonar || echo "sonar NOT active by default"`
Expected: `sonar NOT active by default`.

- [ ] **Step 3: Verify the profile resolves when requested**

Run: `cd gdfkube-src/gdfkube-camel && ./mvnw -B -Psonar help:active-profiles -q | grep -i sonar`
Expected: a line showing the `sonar` profile active.

- [ ] **Step 4: Commit**

```bash
git add gdfkube-src/gdfkube-camel/pom.xml
git commit -m "feat(sonar): add opt-in sonar Maven profile to gdfkube-camel"
```

---

## Task 9: Node sonar-project.properties

**Files:**
- Create: `gdfkube-src/gdfkube-itsm/sonar-project.properties`
- Create: `gdfkube-src/gdfkube-itsm/server/sonar-project.properties`

- [ ] **Step 1: Create the SPA scanner config**

Create `gdfkube-src/gdfkube-itsm/sonar-project.properties`:

```properties
sonar.projectKey=gdfkube-itsm-web
sonar.sources=src
sonar.tests=src
sonar.test.inclusions=**/*.test.ts,**/*.test.tsx,**/*.spec.ts,**/*.spec.tsx
sonar.exclusions=node_modules/**,dist/**,e2e/**,coverage/**
sonar.javascript.lcov.reportPaths=coverage/lcov.info
sonar.qualitygate.wait=true
```

- [ ] **Step 2: Create the server scanner config**

Create `gdfkube-src/gdfkube-itsm/server/sonar-project.properties`:

```properties
sonar.projectKey=gdfkube-itsm-server
sonar.sources=src
sonar.tests=src
sonar.test.inclusions=**/*.test.ts,**/*.spec.ts
sonar.exclusions=node_modules/**,dist/**,coverage/**
sonar.javascript.lcov.reportPaths=coverage/lcov.info
sonar.qualitygate.wait=true
```

- [ ] **Step 3: Verify keys match the bootstrapped project keys**

Run: `grep -h projectKey gdfkube-src/gdfkube-itsm/sonar-project.properties gdfkube-src/gdfkube-itsm/server/sonar-project.properties`
Expected: `gdfkube-itsm-web` and `gdfkube-itsm-server` (must equal `SONAR_PROJECTS`).

- [ ] **Step 4: Commit**

```bash
git add gdfkube-src/gdfkube-itsm/sonar-project.properties gdfkube-src/gdfkube-itsm/server/sonar-project.properties
git commit -m "feat(sonar): add sonar-project.properties for itsm web and server"
```

---

## Task 10: scripts/sonar.sh orchestrator

**Files:**
- Create: `scripts/sonar.sh`

- [ ] **Step 1: Create the orchestrator**

Create `scripts/sonar.sh` (`mkdir -p scripts` first):

```sh
#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-all}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Read the analysis token read-only from the sonar-init volume (never in repo/env files).
read_token() {
  docker compose run --rm -T -v sonar-init:/s:ro --entrypoint sh sonar-bootstrap \
    -c 'cat /s/token'
}

scan_camel() {
  echo "[sonar] camel"
  ( cd gdfkube-src/gdfkube-camel \
    && ./mvnw -B -DskipITs=false -Psonar verify sonar:sonar \
         -Dsonar.token="$(read_token)" )
}

scan_node() { # dir
  d=$1
  echo "[sonar] $d"
  ( cd "gdfkube-src/$d" && npm run sonar )
  docker compose run --rm -T \
    -v "${COMPOSE_HOST_WORKSPACE:-$ROOT}/gdfkube-src/$d:/usr/src" \
    -e SONAR_HOST_URL="http://sonarqube:9000" \
    -e SONAR_TOKEN="$(read_token)" \
    --entrypoint sonar-scanner \
    -w /usr/src \
    --network gdfkube-net \
    sonarsource/sonar-scanner-cli:11.1
}

rc=0
fail() { echo "[sonar] GATE FAILED: $1" >&2; rc=1; }

case "$TARGET" in
  camel)  scan_camel            || fail camel ;;
  web)    scan_node gdfkube-itsm        || fail web ;;
  server) scan_node gdfkube-itsm/server || fail server ;;
  all)
    scan_camel                    || fail camel
    scan_node gdfkube-itsm        || fail web
    scan_node gdfkube-itsm/server || fail server
    ;;
  *) echo "usage: scripts/sonar.sh camel|web|server|all" >&2; exit 2 ;;
esac

[ "$rc" -eq 0 ] && echo "[sonar] all gates passed" || echo "[sonar] one or more gates failed"
exit "$rc"
```

- [ ] **Step 2: Make it executable and lint it**

Run: `chmod +x scripts/sonar.sh && bash -n scripts/sonar.sh`
Expected: no output, exit 0.

- [ ] **Step 3: Confirm the token is never written to repo/env**

Run: `grep -nE 'token' scripts/sonar.sh`
Expected: the token is only ever passed inline via `$(read_token)` command substitution — never assigned to a persisted env file or written under the repo.

- [ ] **Step 4: Commit**

```bash
git add scripts/sonar.sh
git commit -m "feat(sonar): add scripts/sonar.sh gate-enforcing orchestrator"
```

---

## Task 11: End-to-end scan & gate-enforcement verification

**Files:** none (verification only; uses the running stack from Task 4)

- [ ] **Step 1: camel pass proof**

Run: `scripts/sonar.sh camel`
Expected: `build/jacoco-report/jacoco.xml` present, `gdfkube-camel` project populated in the UI, exit `0`.

- [ ] **Step 2: camel deliberate-fail proof**

Temporarily raise the gate coverage threshold to 99 via API, then:
Run: `scripts/sonar.sh camel`
Expected: `sonar:sonar` blocks on `qualitygate.wait` and exits non-zero; `[sonar] GATE FAILED: camel`. Restore the threshold to 80 afterwards.

- [ ] **Step 3: web pass + deliberate-fail proof**

Run: `scripts/sonar.sh web` → exit 0, `coverage/lcov.info` produced, `gdfkube-itsm-web` populated.
Add a deliberately uncovered new source file, re-run → New-Code coverage gate fails, exit non-zero. Revert the file.

- [ ] **Step 4: server pass + deliberate-fail proof**

Run: `scripts/sonar.sh server` → exit 0, `gdfkube-itsm-server` populated.
Inject a blocker-level smell, re-run → gate fails non-zero. Revert.

- [ ] **Step 5: orchestrator proof**

Run: `scripts/sonar.sh all`
Expected: all green → exit 0. With one module forced to fail → `all` exits non-zero and names the failing module.

- [ ] **Step 6: No-drift proof**

Run: `docker compose up -d` (default app stack) then `git diff --stat origin/main`
Expected: app stack healthy as before; `git diff --stat` touches only the blast-radius files (5 added, 8 modified — `bootstrap.sh`, 2× `sonar-project.properties`, `scripts/sonar.sh`, `docs/14-sonarqube.md`; `docker-compose.yml`, camel `pom.xml`, camel test `application.properties`, 2× `package.json`, `vite.config.ts`, `vitest.config.ts`, `.gitignore`, `.env.example`).

- [ ] **Step 7: Secret-hygiene proof**

Run: `pre-commit run --all-files`
Expected: trufflehog passes; token absent from logs/repo/env.

---

## Task 12: Runbook documentation

**Files:**
- Create: `docs/14-sonarqube.md`

- [ ] **Step 1: Write the runbook**

Create `docs/14-sonarqube.md` (numbered-docs convention; prior doc is `13-observability.md`) covering, in sections:

1. **Bring-up** — `docker compose up -d sonarqube sonar-db sonar-bootstrap`; how to confirm UP and that `sonar-bootstrap` exited 0; where the token lives (`sonar-init` volume, never in repo).
2. **`vm.max_map_count` on Docker-in-Docker** — default mitigation `SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true`; the proper host fix `sudo sysctl -w vm.max_map_count=524288` (and how to persist via `/etc/sysctl.d`); the opt-in privileged helper as last resort and why it is off by default (security posture vs all-unprivileged init services).
3. **Memory expectations** — ES+web+CE ≈ 2–2.5 GB even capped; devcontainer host needs ≥4 GB free; SonarQube is opt-in (in no app's `depends_on`), not part of the default app `up`.
4. **Community-Edition limitations** — no PR/branch decoration, no portfolio rollup; three independent projects; documented, not worked around.
5. **Per-module sonar commands** — `scripts/sonar.sh camel|web|server|all`; the underlying Maven (`-Psonar verify sonar:sonar`) and scanner-cli invocations; gate enforcement (non-zero exit on failure) and the New-Code gate definition.
6. **Out-of-scope note** — pre-existing `Dockerfile.jvm` `build/` vs `target/` mismatch is flagged, not fixed here; JaCoCo/`sonar.java.binaries` use `build/`.

- [ ] **Step 2: Verify the doc covers every required topic**

Run: `grep -niE 'max_map_count|SONAR_ES_BOOTSTRAP|privileged|2\.5 GB|4 GB|portfolio|qualitygate|scripts/sonar.sh' docs/14-sonarqube.md`
Expected: matches for each acceptance-criterion topic.

- [ ] **Step 3: Commit**

```bash
git add docs/14-sonarqube.md
git commit -m "docs(sonar): add SonarQube runbook (14-sonarqube.md)"
```

---

## Self-Review

**Spec coverage:**
- `sonarqube-analysis-stack` → Tasks 1, 2, 3, 4 (services, bootstrap, token volume, idempotency, DB-dep, no-drift).
- `coverage-instrumentation` → Tasks 5, 6, 7 (Quarkus JaCoCo `build/` path, version-matched Vitest v8, inner-loop unaffected, gitignore).
- `sonar-scan-orchestration` → Tasks 8, 9, 10, 11, 12 (Maven profile, sonar-project.properties, orchestrator + gate enforcement, e2e proofs, runbook).
- Every acceptance criterion in the PRD maps to a verification step in Task 4 or Task 11.

**Placeholder scan:** No TBD/TODO/"add error handling" — every code/config block is complete; the `.env.example` block is given verbatim (the file itself is permission-blocked from reading but the engineer executing has access; format mirrors the documented `GITEA_*` style).

**Type/name consistency:** Project keys `gdfkube-camel` / `gdfkube-itsm-web` / `gdfkube-itsm-server` are identical across `bootstrap.sh` (`SONAR_PROJECTS`), the Maven profile (`sonar.projectKey`), both `sonar-project.properties`, and `scripts/sonar.sh`. Report paths `build/jacoco-report/jacoco.xml` and `coverage/lcov.info` are consistent between the coverage tasks (5/6) and the scanner config (8/9). The token volume `sonar-init` and helper `read_token` are consistent between Task 2 (compose), Task 4 (verification), and Task 10 (orchestrator).
