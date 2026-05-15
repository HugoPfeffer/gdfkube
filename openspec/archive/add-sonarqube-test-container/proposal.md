## Why

`gdfkube` runs three independent test suites (camel Java/Quarkus, itsm SPA,
itsm server) with **no coverage or code-quality instrumentation anywhere** — no
JaCoCo, no `@vitest/coverage-v8`, no SonarQube. Test pass/fail is the only
signal, so coverage regressions, code smells, duplication, and security hotspots
ship invisibly and unenforced. Adding SonarQube Community now gives every
quality build a measured, gate-enforced floor without taxing the fast inner
dev loop.

## What Changes

**Code-quality measurement**
- From: only test pass/fail; coverage and smells invisible
- To: SonarQube CE + Postgres run as long-lived compose services; all three
  suites instrumented for coverage; a per-module opt-in `sonar` entrypoint runs
  tests + coverage + analysis
- Reason: make quality regressions visible and enforceable
- Impact: non-breaking, additive — opt-in services and entrypoints only

**Quality enforcement**
- From: no gate; nothing blocks degraded quality
- To: a default `gdfkube-gate` scoped to **New Code** (Coverage ≥ 80%,
  Duplicated Lines ≤ 3%, Maint/Rel/Sec = A, zero new Blocker/Critical); a
  failing gate fails the `scripts/sonar.sh` command
- Reason: locked product decision — enforce immediately
- Impact: affects only the new sonar command; `./mvnw verify` / `npm test`
  unchanged and SonarQube-free

**Bootstrap & secrets**
- A one-shot `sonar-bootstrap` (Gitea-pattern) rotates `admin/admin`, creates
  the three projects + gate, and mints an analysis token into a named volume —
  never logged, never in the repo or env.

## Capabilities

### New Capabilities
- `sonarqube-analysis-stack`: SonarQube CE + PostgreSQL as long-lived
  `docker-compose.yml` services on `gdfkube-net`, plus the one-shot
  `sonar-bootstrap` init service (password rotation, project + quality-gate
  creation, token minting into the `sonar-init` volume). Covers PRD R1 + R2.
- `coverage-instrumentation`: version-matched per-module coverage —
  `io.quarkus:quarkus-jacoco` (BOM 3.16.3) writing
  `build/jacoco-report/jacoco.xml`, `@vitest/coverage-v8@^1.6.1` (SPA) and
  `@vitest/coverage-v8@^2.1.0` (server) writing `coverage/lcov.info`. Covers
  PRD R3.
- `sonar-scan-orchestration`: opt-in scanner entrypoints — a `sonar` Maven
  profile, per-module `sonar-project.properties`, and a `scripts/sonar.sh`
  `camel|web|server|all` orchestrator that owns gate enforcement (non-zero exit
  on gate failure). Covers PRD R4.

### Modified Capabilities
<!-- None — purely additive. SonarQube is in no app's depends_on; no existing
service, Kafka topic, MongoDB collection, or spec requirement changes. -->

## Impact

- **Files added (5):** `gdfkube-src/gdfkube-infra/sonarqube/bootstrap.sh`;
  `gdfkube-src/gdfkube-itsm/sonar-project.properties`;
  `gdfkube-src/gdfkube-itsm/server/sonar-project.properties`;
  `scripts/sonar.sh`; `docs/14-sonarqube.md`.
- **Files modified (7+1):** `docker-compose.yml` (+3 services, +5 volumes,
  no existing service touched); `gdfkube-src/gdfkube-camel/pom.xml`;
  `gdfkube-src/gdfkube-itsm/package.json`;
  `gdfkube-src/gdfkube-itsm/vite.config.ts`;
  `gdfkube-src/gdfkube-itsm/server/package.json`;
  `gdfkube-src/gdfkube-itsm/server/vitest.config.ts`; `.gitignore`;
  `.env.example` (new `SONAR_*` overrides, mirroring `GITEA_*`).
- **New runtime surface:** services `sonarqube`, `sonar-db`,
  `sonar-bootstrap` (+ ephemeral `docker compose run --rm` scanner
  containers); volumes `sonarqube-data|extensions|logs`, `sonar-db-data`,
  `sonar-init`; host port `127.0.0.1:9000:9000` only.
- **Dependencies (pinned):** `sonarqube:2025.1.1-community`,
  `postgres:15.10-alpine`, `sonar-maven-plugin:5.1.0.4751`,
  `sonarsource/sonar-scanner-cli:11.1`, `curlimages/curl:8.11.1`,
  `quarkus-jacoco` (BOM-managed 3.16.3), `@vitest/coverage-v8` `^1.6.1`/`^2.1.0`.
  **Conflict flag:** SPA coverage MUST be `^1.6.1` (Vitest `^1.6.1`); v2 breaks
  `npm ci`.
- **Zero impact (confirmed):** all app services
  (`itsm`/`gdfkube-itsm-api`/`gdfkube-camel`), mongo, kafka, debezium, gitea
  unchanged; no Kafka topics; no MongoDB collections; `.github/**` untouched;
  reuses existing `gdfkube-net`.
