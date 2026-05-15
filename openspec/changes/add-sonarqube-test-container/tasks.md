## 1. SonarQube + Postgres + bootstrap services

- [x] 1.1 Write `gdfkube-src/gdfkube-infra/sonarqube/bootstrap.sh` (`set -eu`, defensive, modeled on `gitea/bootstrap.sh`): rotate `admin/admin` via `POST /api/authentication/change_password`, handle `401` already-rotated branch, fatal only if neither default nor rotated creds work
- [x] 1.2 In `bootstrap.sh`: create the three projects (`gdfkube-camel`, `gdfkube-itsm-web`, `gdfkube-itsm-server`), tolerating "already exists"
- [x] 1.3 In `bootstrap.sh`: create `gdfkube-gate` with New-Code conditions (Coverage ≥ 80%, Duplicated Lines ≤ 3%, Maint/Rel/Sec rating = A, zero new Blocker/Critical), set default, associate all three projects
- [x] 1.4 In `bootstrap.sh`: mint timestamp-suffixed analysis token, write `chmod 600` to `sonar-init:/sonar/token`, write `http://sonarqube:9000` to `/sonar/url`; never log the token, log only a non-secret `projects=… gate=gdfkube-gate` summary
- [x] 1.5 Add `sonar-db` service to `docker-compose.yml`: `postgres:15.10-alpine`, no host port, `gdfkube-net`, named volume `sonar-db-data`, `pg_isready` healthcheck
- [x] 1.6 Add `sonarqube` service: `sonarqube:2025.1.1-community`, `127.0.0.1:9000:9000`, JVM caps (web/CE `-Xms512m -Xmx768m`, search `-Xms512m -Xmx512m`), `SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true`, `ulimits nofile 65536`, `restart: unless-stopped`, `depends_on sonar-db: service_healthy`, `/api/system/status` healthcheck (`start_period: 120s`), volumes `sonarqube-data|extensions|logs`
- [x] 1.7 Add `sonar-bootstrap` service: `curlimages/curl:8.11.1`, `restart: "no"`, `depends_on sonarqube: service_healthy`, host-mount `bootstrap.sh`, env via `${VAR:-default}` (`SONAR_ADMIN_PASSWORD`, `SONAR_DB_PASSWORD`, `SONAR_TOKEN_NAME`, `SONAR_PROJECTS`), mount `sonar-init`
- [x] 1.8 Declare the five named volumes (`sonarqube-data`, `sonarqube-extensions`, `sonarqube-logs`, `sonar-db-data`, `sonar-init`) in the compose `volumes:` block
- [x] 1.9 Add `SONAR_*` override entries to `.env.example` mirroring the `GITEA_*` block (use `# trufflehog:ignore` on placeholder values as needed)

## 2. Coverage instrumentation

- [x] 2.1 Add `io.quarkus:quarkus-jacoco` (test scope, no explicit version — BOM 3.16.3) to `gdfkube-src/gdfkube-camel/pom.xml`; configure report at `build/jacoco-report/jacoco.xml`, fixed exec file merged across Surefire + Failsafe; pass the JaCoCo agent through to the Failsafe IT execution
- [x] 2.2 Add `@vitest/coverage-v8@^1.6.1` to `gdfkube-src/gdfkube-itsm/package.json` (MUST match `vitest@^1.6.1`); add `test.coverage` to `vite.config.ts` (provider `v8`, reporters `text,lcov`, `coverage/lcov.info`)
- [x] 2.3 Add `@vitest/coverage-v8@^2.1.0` to `gdfkube-src/gdfkube-itsm/server/package.json` (matches `vitest@^2.1.0`); add the same `test.coverage` block to `vitest.config.ts`
- [x] 2.4 Add `**/coverage/` and `gdfkube-src/gdfkube-camel/build/` to `.gitignore`

## 3. Scanner wiring + gate enforcement

- [x] 3.1 Add a `sonar` Maven profile to `gdfkube-camel/pom.xml`: `sonar-maven-plugin:5.1.0.4751`, `sonar.host.url=http://sonarqube:9000`, `sonar.qualitygate.wait=true`, `sonar.projectKey=gdfkube-camel`, `sonar.java.binaries=build/classes`, `sonar.coverage.jacoco.xmlReportPaths=build/jacoco-report/jacoco.xml` (profile inactive by default)
- [x] 3.2 Add `gdfkube-src/gdfkube-itsm/sonar-project.properties` (key `gdfkube-itsm-web`, `sonar.javascript.lcov.reportPaths=coverage/lcov.info`, `sonar.qualitygate.wait=true`) and a `"sonar": "vitest run --coverage"` script in its `package.json`
- [x] 3.3 Add `gdfkube-src/gdfkube-itsm/server/sonar-project.properties` (key `gdfkube-itsm-server`, same keys) and a `"sonar"` script in its `package.json`
- [x] 3.4 Write `scripts/sonar.sh` (`camel|web|server|all`): run each module's coverage, then `docker compose run --rm` `sonarsource/sonar-scanner-cli:11.1` on `gdfkube-net`, reading the token read-only from `sonar-init`; non-zero exit naming any module whose gate fails

## 4. Documentation

- [x] 4.1 Write `docs/14-sonarqube.md`: bring-up steps, `vm.max_map_count` mitigations (default `SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true`, host `sudo sysctl` proper fix, opt-in privileged helper), ≈2–2.5 GB / ≥4 GB memory expectations, CE limitations, per-module sonar commands

## 5. Verification

- [x] 5.1 Bring-up: `docker compose up -d sonarqube sonar-db sonar-bootstrap`; assert `sonar-bootstrap` exits 0 and logs the non-secret summary; `curl 127.0.0.1:9000/api/system/status` → UP
- [ ] 5.2 DB-dependency proof: stop `sonar-db`, restart `sonarqube` → not UP
- [x] 5.3 Bootstrap idempotency: re-run → exits 0 via already-rotated branch; wrong `SONAR_ADMIN_PASSWORD` on rotated instance → exit 1
- [ ] 5.4 camel: `scripts/sonar.sh camel` → `build/jacoco-report/jacoco.xml` present, project populated, exit 0; raise gate coverage to 99% → `sonar:sonar` exits non-zero
- [ ] 5.5 SPA: `npm ci` succeeds; `scripts/sonar.sh web` → `coverage/lcov.info`, project populated, exit 0; add uncovered file → New-Code gate fails non-zero
- [ ] 5.6 server: `npm ci` succeeds; `scripts/sonar.sh server` → `coverage/lcov.info`, project populated, exit 0; inject blocker smell → gate fails non-zero
- [ ] 5.7 orchestrator: `scripts/sonar.sh all` exits 0 all-green; one module failing → `all` exits non-zero and names the module
- [ ] 5.8 No-drift: plain `docker compose up -d` → app stack healthy as before; `git diff --stat` touches only the blast-radius files; `./mvnw verify` and `npm test` unchanged and need no SonarQube
- [x] 5.9 Secret hygiene: `pre-commit run --all-files` (trufflehog) clean; token absent from logs, repo, and env
