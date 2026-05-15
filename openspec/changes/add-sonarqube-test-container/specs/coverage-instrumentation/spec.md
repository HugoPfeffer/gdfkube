## ADDED Requirements

### Requirement: Java coverage via Quarkus JaCoCo

The `gdfkube-camel` module SHALL produce a JaCoCo XML coverage report using
the `io.quarkus:quarkus-jacoco` extension (test scope, version managed by the
imported `quarkus-bom` 3.16.3 — no explicit version, and NOT the raw
`jacoco-maven-plugin`). The report MUST be written to
`build/jacoco-report/jacoco.xml` (the module's Maven build directory is
overridden to `build/`, NOT `target/`). The JaCoCo exec data MUST be merged
across the Surefire (`*Test`) and Failsafe (`*IT`) executions.

#### Scenario: Coverage report generated at the build/ path

- **GIVEN** `quarkus-jacoco` added to `gdfkube-camel/pom.xml`
- **WHEN** the camel sonar build runs (`./mvnw -B -DskipITs=false -Psonar
  verify`)
- **THEN** `gdfkube-src/gdfkube-camel/build/jacoco-report/jacoco.xml` exists
  and reflects merged unit + integration test coverage

#### Scenario: JaCoCo path uses build/ not target/

- **GIVEN** the camel build directory is overridden to `build/`
- **WHEN** the coverage report path is configured
- **THEN** the JaCoCo report and `sonar.java.binaries` resolve under `build/`
  (the pre-existing `Dockerfile.jvm` `target/` mismatch is left untouched)

### Requirement: SPA coverage via version-matched Vitest v8

The `gdfkube-itsm` SPA SHALL add `@vitest/coverage-v8@^1.6.1` (which MUST
match the module's `vitest@^1.6.1`; a v2 coverage package MUST NOT be used as
it breaks `npm ci` here). `vite.config.ts` MUST configure `test.coverage`
with provider `v8` and reporters including `text` and `lcov`, emitting
`coverage/lcov.info`.

#### Scenario: Dependency install stays consistent

- **GIVEN** `@vitest/coverage-v8@^1.6.1` added to `gdfkube-itsm/package.json`
- **WHEN** `npm ci` is run in `gdfkube-itsm`
- **THEN** install succeeds (peer tree consistent with `vitest@^1.6.1`)

#### Scenario: SPA coverage report generated

- **WHEN** `vitest run --coverage` is run in `gdfkube-itsm`
- **THEN** `gdfkube-src/gdfkube-itsm/coverage/lcov.info` is produced

### Requirement: Server coverage via version-matched Vitest v8

The `gdfkube-itsm/server` module SHALL add `@vitest/coverage-v8@^2.1.0`
(matching its `vitest@^2.1.0`). `vitest.config.ts` MUST configure
`test.coverage` with provider `v8` and reporters including `text` and `lcov`,
emitting `coverage/lcov.info`.

#### Scenario: Dependency install stays consistent

- **GIVEN** `@vitest/coverage-v8@^2.1.0` added to
  `gdfkube-itsm/server/package.json`
- **WHEN** `npm ci` is run in `gdfkube-itsm/server`
- **THEN** install succeeds (peer tree consistent with `vitest@^2.1.0`)

#### Scenario: Server coverage report generated

- **WHEN** `vitest run --coverage` is run in `gdfkube-itsm/server`
- **THEN** `gdfkube-src/gdfkube-itsm/server/coverage/lcov.info` is produced

### Requirement: Fast inner loop stays SonarQube-free

The existing inner-loop test entrypoints SHALL remain unchanged and MUST NOT
require a running SonarQube: `./mvnw -B -DskipITs=false verify`,
`npm test` (SPA `vitest run --passWithNoTests`), and `npm test` (server
`vitest run`) MUST all pass offline with no SonarQube container present.

#### Scenario: Inner loop runs without SonarQube

- **GIVEN** no SonarQube container running
- **WHEN** `./mvnw verify` and each module's `npm test` are run
- **THEN** they pass exactly as before, with no SonarQube dependency

### Requirement: Coverage artifacts are git-ignored

The repository `.gitignore` SHALL exclude `**/coverage/` and
`gdfkube-src/gdfkube-camel/build/` so coverage output never enters version
control.

#### Scenario: Generated coverage is not tracked

- **WHEN** any module's coverage run produces `coverage/` (or camel `build/`)
- **THEN** `git status` shows those paths as ignored, not untracked/staged
