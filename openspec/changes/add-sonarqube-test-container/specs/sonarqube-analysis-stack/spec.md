## ADDED Requirements

### Requirement: SonarQube and PostgreSQL compose services

The system SHALL provide SonarQube Community Edition and its PostgreSQL
backing store as long-lived `docker-compose.yml` services on the existing
`gdfkube-net`. SonarQube MUST use image `sonarqube:2025.1.1-community`,
`sonar-db` MUST use `postgres:15.10-alpine`. SonarQube MUST expose only
`127.0.0.1:9000:9000`; `sonar-db` MUST NOT publish any host port. SonarQube
MUST cap its web/CE/search JVMs (`-Xms512m -Xmx768m` web/CE, `-Xms512m
-Xmx512m` search), set `SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true`, set
`ulimits nofile 65536`, `restart: unless-stopped`, and `depends_on sonar-db`
with condition `service_healthy`. Named volumes `sonarqube-data`,
`sonarqube-extensions`, `sonarqube-logs`, `sonar-db-data`, `sonar-init` MUST
be declared.

#### Scenario: Stack comes up healthy

- **GIVEN** a host with ≥4 GB free and `gdfkube-net` present
- **WHEN** `docker compose up -d sonarqube sonar-db sonar-bootstrap` is run
- **THEN** `curl 127.0.0.1:9000/api/system/status` returns `"status":"UP"`
  within the `start_period` (120s)

#### Scenario: SonarQube depends on a healthy database

- **GIVEN** a running SonarQube and `sonar-db`
- **WHEN** `sonar-db` is stopped and `sonarqube` is restarted
- **THEN** SonarQube does NOT reach status `UP` (the `service_healthy`
  dependency is wired and enforced)

#### Scenario: No drift to the existing app stack

- **GIVEN** the new services added to `docker-compose.yml`
- **WHEN** the default app stack is started with `docker compose up -d`
- **THEN** all existing app services become healthy as before, no existing
  service has SonarQube in its `depends_on`, and `git diff --stat` touches
  only the enumerated blast-radius files

### Requirement: One-shot sonar-bootstrap init service

The system SHALL provide a one-shot `sonar-bootstrap` service modeled on the
`gitea-bootstrap`/`gitea-token-sync` pattern: image `curlimages/curl:8.11.1`,
`restart: "no"`, `depends_on sonarqube` with condition `service_healthy`, a
host-mounted `gdfkube-src/gdfkube-infra/sonarqube/bootstrap.sh`, and env via
`${VAR:-default}`. On run it MUST rotate the default `admin/admin` credential,
create the three projects (`gdfkube-camel`, `gdfkube-itsm-web`,
`gdfkube-itsm-server`), create a `gdfkube-gate` quality gate with **New Code**
conditions (Coverage ≥ 80%, Duplicated Lines ≤ 3%, Maintainability/Reliability/
Security rating = A, zero new Blocker/Critical), set it as default, and
associate all three projects. The script MUST be idempotent.

#### Scenario: First bootstrap run provisions everything

- **GIVEN** a freshly started SonarQube with default `admin/admin`
- **WHEN** `sonar-bootstrap` runs
- **THEN** the admin password is rotated, the three projects and the default
  `gdfkube-gate` exist, the service exits `0`, and it logs a non-secret
  summary line (e.g. `projects=… gate=gdfkube-gate`)

#### Scenario: Bootstrap re-run is idempotent

- **GIVEN** a SonarQube whose admin password has already been rotated and
  projects/gate already created
- **WHEN** `sonar-bootstrap` runs again with the rotated `SONAR_ADMIN_PASSWORD`
- **THEN** it tolerates "already exists", validates via the already-rotated
  branch, and exits `0`

#### Scenario: Bootstrap fails fast on bad credentials

- **GIVEN** a SonarQube whose password has been rotated
- **WHEN** `sonar-bootstrap` runs with an incorrect `SONAR_ADMIN_PASSWORD`
  (neither default nor rotated creds valid)
- **THEN** the service exits non-zero (`1`)

### Requirement: Analysis token is minted into a volume and never leaked

The system SHALL have `bootstrap.sh` generate a timestamp-suffixed analysis
token, write it `chmod 600` to `sonar-init:/sonar/token`, and write
`http://sonarqube:9000` to `sonar-init:/sonar/url`. The token MUST NOT be
logged, committed to the repository, or placed in any environment variable.
The `sonar-init` volume MUST survive `stop`/`up` and MUST be wiped by
`down -v`.

#### Scenario: Token reaches the volume without leaking

- **WHEN** `sonar-bootstrap` completes successfully
- **THEN** `/sonar/token` exists in the `sonar-init` volume with mode `600`,
  `/sonar/url` contains `http://sonarqube:9000`, and the token value appears
  in no container log, no repo file (trufflehog clean), and no env var

#### Scenario: Clean slate on down -v

- **GIVEN** a populated `sonar-init` volume
- **WHEN** `docker compose down -v` is run
- **THEN** the `sonar-init` volume (and the token) is removed; a subsequent
  bring-up mints a fresh token
