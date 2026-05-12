## ADDED Requirements

### Requirement: The packaged gdfkube-camel artifact SHALL register every declared route at boot

The `gdfkube-camel` Maven module MUST ship a `@QuarkusIntegrationTest` (Failsafe-bound, naming convention `*IT.java`) that boots the **packaged** Quarkus artifact (i.e., not the test-classpath dev mode) and asserts that the `CamelContext` reaches state `Started` and that every route declared in the topology reports route status `Started`. The IT MUST exercise the production-classpath augmentation path — the same path the deployed container uses — so that any missing `camel-quarkus-*` extension fails the build.

#### Scenario: Packaged artifact boots and registers all declared routes

- **GIVEN** the `gdfkube-camel` module has been packaged via `./mvnw -pl gdfkube-src/gdfkube-camel -am -DskipITs=false verify`
- **WHEN** the Failsafe-bound `AppStartupIT` runs against the packaged artifact
- **THEN** the test SHALL pass
- **AND** the `CamelContext` status SHALL be `Started`
- **AND** each route id in the declared topology (including `git-push` and `repo-bootstrap`) SHALL report status `Started`

#### Scenario: A missing Camel component extension fails the integration test

- **GIVEN** the `gdfkube-camel` module's `pom.xml` omits a `camel-quarkus-<scheme>` extension required by a route URI in `src/main/java`
- **WHEN** `./mvnw -pl gdfkube-src/gdfkube-camel -am -DskipITs=false verify` is executed
- **THEN** `AppStartupIT` SHALL fail
- **AND** the failure message SHALL reference the unresolved scheme (e.g., `No endpoint could be found for: <scheme>://...`)
- **AND** the Maven exit code SHALL be non-zero

#### Scenario: `mvn test` (without verify) remains fast and does not run the integration test

- **GIVEN** a developer runs `./mvnw -pl gdfkube-src/gdfkube-camel test`
- **WHEN** Surefire executes
- **THEN** the `*IT.java` class SHALL NOT be invoked
- **AND** the run SHALL complete using only `@QuarkusTest`-bound unit tests

---

### Requirement: PR CI SHALL run the packaged-artifact smoke for the gdfkube-camel module

The repository MUST contain a GitHub Actions workflow at `.github/workflows/gdfkube-camel-ci.yml` that triggers on `pull_request` and `push` to `main` filtered by paths under `gdfkube-src/gdfkube-camel/**` (and the workflow file itself). The workflow MUST execute `./mvnw -pl gdfkube-src/gdfkube-camel -am -DskipITs=false verify` so that Failsafe runs the packaged-artifact smoke on every change. The job MUST report a non-zero exit status — and therefore a failed PR check — whenever the smoke test does not pass.

#### Scenario: PR touching gdfkube-camel runs the IT

- **GIVEN** a pull request changes a file under `gdfkube-src/gdfkube-camel/`
- **WHEN** the GitHub Actions workflow is triggered
- **THEN** the job SHALL run `./mvnw -pl gdfkube-src/gdfkube-camel -am -DskipITs=false verify`
- **AND** the run SHALL include the `AppStartupIT` execution in the Failsafe report

#### Scenario: A regression of the original incident fails CI, not the deployed container

- **GIVEN** a pull request removes `camel-quarkus-direct` from `gdfkube-src/gdfkube-camel/pom.xml`
- **WHEN** the `gdfkube-camel-ci.yml` workflow runs
- **THEN** the workflow SHALL exit non-zero
- **AND** the PR check SHALL be marked failed
- **AND** the failure SHALL be observable on the PR before merge

#### Scenario: PRs not touching gdfkube-camel are not gated by this workflow

- **GIVEN** a pull request changes only files outside `gdfkube-src/gdfkube-camel/` and outside `.github/workflows/gdfkube-camel-ci.yml`
- **WHEN** the workflow's path filter is evaluated
- **THEN** the `gdfkube-camel-ci.yml` workflow SHALL NOT run
- **AND** no associated PR check SHALL be added

---

### Requirement: docker-compose SHALL expose a runtime readiness signal for gdfkube-camel

The `gdfkube-camel` service in `/workspace/docker-compose.yml` MUST declare a `healthcheck` that probes the Quarkus readiness endpoint at `http://localhost:8080/q/health/ready` from inside the container. The healthcheck MUST permit a Quarkus startup grace period (`start_period >= 30s`) and MUST eventually flip the container to `unhealthy` if the readiness endpoint never returns 200 — for example, when a Camel route fails to register due to a missing extension.

#### Scenario: A healthy Camel container reports `healthy` under docker compose ps

- **GIVEN** the full stack is started with `docker compose up -d` and all Camel routes register successfully
- **WHEN** `docker compose ps gdfkube-camel` is inspected after the `start_period`
- **THEN** the reported state SHALL be `healthy`

#### Scenario: A Camel container with an unresolved route is reported `unhealthy`

- **GIVEN** the `gdfkube-camel` image is intentionally missing a `camel-quarkus-*` extension required by a declared route
- **WHEN** the container is started via `docker compose up -d gdfkube-camel` and the `start_period + retries * interval` window elapses
- **THEN** `docker compose ps gdfkube-camel` SHALL report state `unhealthy`
- **AND** any service that lists `gdfkube-camel` under `depends_on` with `condition: service_healthy` SHALL be prevented from starting

---

### Requirement: No live secret SHALL be introduced by build-verification changes

The CI workflow and the integration test MUST NOT introduce any credential, token, or secret value into the repository or into workflow run logs. Any environment variables required by the workflow MUST be sourced from `${{ secrets.* }}` references, and the workflow MUST not echo their values. Pre-commit trufflehog MUST remain green after this change lands.

#### Scenario: trufflehog pre-commit stays green

- **GIVEN** all files in this change are staged
- **WHEN** `pre-commit run --all-files` is executed
- **THEN** trufflehog SHALL report no findings
- **AND** the run SHALL exit with code 0

#### Scenario: The CI workflow logs contain no secret values

- **GIVEN** the `gdfkube-camel-ci.yml` workflow has completed a run
- **WHEN** the run logs are inspected
- **THEN** no `${{ secrets.* }}` value SHALL appear in plaintext
- **AND** no Gitea PAT, Kafka credential, or Mongo connection string with credentials SHALL appear
