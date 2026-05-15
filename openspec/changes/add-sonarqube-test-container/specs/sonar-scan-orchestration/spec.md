## ADDED Requirements

### Requirement: Java sonar Maven profile

The `gdfkube-camel/pom.xml` SHALL define a `sonar` Maven profile using
`org.sonarsource.scanner.maven:sonar-maven-plugin:5.1.0.4751` with
`sonar.host.url=http://sonarqube:9000`, `sonar.qualitygate.wait=true`,
`sonar.projectKey=gdfkube-camel`, `sonar.java.binaries=build/classes`, and
`sonar.coverage.jacoco.xmlReportPaths=build/jacoco-report/jacoco.xml`. The
profile MUST NOT be active by default (it is opt-in via `-Psonar`).

#### Scenario: Java analysis uploads and waits on the gate

- **GIVEN** a healthy SonarQube and a minted token in `$SONAR_TOKEN`
- **WHEN** `./mvnw -B -DskipITs=false -Psonar verify sonar:sonar
  -Dsonar.token=$SONAR_TOKEN` is run
- **THEN** the `gdfkube-camel` project is populated and the command blocks on
  and reflects the quality-gate result

#### Scenario: Java gate failure fails the build

- **GIVEN** the `gdfkube-gate` coverage condition raised to 99%
- **WHEN** the camel sonar build runs
- **THEN** `sonar:sonar` exits non-zero (gate not met)

### Requirement: Node scanner wiring via pinned scanner-cli image

Each Node module SHALL ship a `sonar-project.properties`
(`gdfkube-itsm/sonar-project.properties` key `gdfkube-itsm-web`;
`gdfkube-itsm/server/sonar-project.properties` key `gdfkube-itsm-server`)
with `sonar.javascript.lcov.reportPaths=coverage/lcov.info` and
`sonar.qualitygate.wait=true`. Analysis MUST run via the pinned
`sonarsource/sonar-scanner-cli:11.1` Docker image (NOT an npm `@sonar/scan`
devDependency). Each `package.json` MUST add a `"sonar": "vitest run
--coverage"` script.

#### Scenario: Node analysis uploads and waits on the gate

- **GIVEN** coverage at `coverage/lcov.info` and a healthy SonarQube
- **WHEN** the scanner-cli image runs for `gdfkube-itsm-web` /
  `gdfkube-itsm-server` on `gdfkube-net`
- **THEN** the project is populated and the run reflects the gate result

#### Scenario: New-code gate failure fails the scan

- **GIVEN** an uncovered new file (SPA) or an injected blocker smell (server)
- **WHEN** the module scan runs
- **THEN** the New-Code gate fails and the scan exits non-zero

### Requirement: scripts/sonar.sh orchestrator owns gate enforcement

The system SHALL provide `scripts/sonar.sh` accepting `camel|web|server|all`.
For each selected module it MUST run that module's coverage, then run a
scanner via `docker compose run --rm` on `gdfkube-net` (so
`http://sonarqube:9000` resolves), reading the analysis token **read-only**
from the `sonar-init` volume. The token MUST NOT be written into the repo or
into a persistent environment variable. The script MUST exit non-zero if any
selected module's quality gate fails, and MUST name the failing module.

#### Scenario: All gates green

- **GIVEN** all three projects passing their gate
- **WHEN** `scripts/sonar.sh all` is run
- **THEN** every module is analyzed and the script exits `0`

#### Scenario: One module fails the gate

- **GIVEN** one module failing its quality gate
- **WHEN** `scripts/sonar.sh all` is run
- **THEN** the script exits non-zero and identifies the failing module by name

#### Scenario: Token never leaves the volume

- **WHEN** `scripts/sonar.sh` runs any target
- **THEN** the token is consumed read-only from `sonar-init`, never written to
  a repo file or persisted env (trufflehog clean)

### Requirement: SonarQube runbook documentation

The system SHALL add `docs/14-sonarqube.md` (following the numbered-docs
convention; the prior doc is `13-observability.md`). It MUST document
bring-up, the `vm.max_map_count` mitigations (the
`SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true` default, the host
`sudo sysctl -w vm.max_map_count=524288` proper fix, and the opt-in
privileged helper), the ≈2–2.5 GB / ≥4 GB memory expectations, the
Community-Edition limitations (no PR/branch/portfolio), and the per-module
sonar commands.

#### Scenario: Runbook covers operations and limits

- **WHEN** a developer reads `docs/14-sonarqube.md`
- **THEN** they can bring the stack up, understand the `vm.max_map_count` and
  memory requirements and CE limitations, and run each module's sonar command
