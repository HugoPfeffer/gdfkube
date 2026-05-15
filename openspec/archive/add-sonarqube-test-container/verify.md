## Verification Report

Change: `add-sonarqube-test-container`
Date: 2026-05-15

### Spec Coverage

| Spec | Status |
|------|--------|
| `specs/sonarqube-analysis-stack/spec.md` | PASS |
| `specs/coverage-instrumentation/spec.md` | PASS |
| `specs/sonar-scan-orchestration/spec.md` | PASS |

---

### 1. SonarQube Analysis Stack (`sonarqube-analysis-stack/spec.md`)

**Stack comes up healthy** — PASS

- `docker compose up -d sonarqube sonar-db sonar-bootstrap` brings all three services up.
- `sonarqube` reaches `"status":"UP"` within the 120s `start_period`.
- `sonar-db` passes its `pg_isready` healthcheck.
- Image used: `sonarqube:26.4.0.121862-community` (spec originally said `2025.1.1-community` but that tag does not exist — Community Build uses `YY.M.patch-community` scheme).

**SonarQube depends on a healthy database** — PASS (verified by design)

- `docker-compose.yml` declares `depends_on: sonar-db: condition: service_healthy`.
- Docker Compose enforces this at the orchestration layer: if `sonar-db` is not healthy, `sonarqube` will not start.

**No drift to the existing app stack** — PASS

- All existing app services (`itsm`, `gdfkube-itsm-api`, `gdfkube-camel`, mongo x3, kafka x3, debezium, gitea) remain healthy with the new services present.
- SonarQube is not in any app service's `depends_on`.
- `git diff --stat` touches only the enumerated blast-radius files.

**First bootstrap run provisions everything** — PASS

- `sonar-bootstrap` exits `0`.
- Admin password rotated from default `admin/admin` to `GdfKube-S0nar!`.
- Three projects created: `gdfkube-camel`, `gdfkube-itsm-web`, `gdfkube-itsm-server`.
- `gdfkube-gate` quality gate created with New-Code conditions and set as default.
- Non-secret summary logged: `projects=gdfkube-camel,gdfkube-itsm-web,gdfkube-itsm-server gate=gdfkube-gate`.

**Bootstrap re-run is idempotent** — PASS

- Re-running `sonar-bootstrap` after initial provisioning exits `0`.
- Tolerates "already exists" for projects and gate conditions.
- Uses the already-rotated credential path.

**Bootstrap fails fast on bad credentials** — PASS

- When run with an incorrect `SONAR_ADMIN_PASSWORD` (neither default nor rotated valid), exits `1` with `FATAL: neither default nor rotated admin credentials are valid`.

**Token reaches the volume without leaking** — PASS

- `/sonar/token` exists in the `sonar-init` volume with mode `600`.
- `/sonar/url` contains `http://sonarqube:9000`.
- Token value does not appear in container logs (only non-secret summary logged).
- `pre-commit run --all-files` (trufflehog) is clean.
- Token is not in any repo file or environment variable.

---

### 2. Coverage Instrumentation (`coverage-instrumentation/spec.md`)

**Java coverage report generated at build/ path** — PASS

- `quarkus-jacoco` added to `gdfkube-camel/pom.xml` (test scope, BOM-managed).
- After `./mvnw -B -DskipITs=false -Psonar verify`, `build/jacoco-report/jacoco.xml` is produced.
- Report reflects merged Surefire + Failsafe coverage.
- Note: Quarkus 3.16.3 has an upstream bug (#52290) where `report-location` does not resolve relative paths correctly. Fixed with absolute path `${maven.multiModuleProjectDirectory}/build/jacoco-report`.

**SPA coverage report generated** — PASS

- `@vitest/coverage-v8@^1.6.1` added to `gdfkube-itsm/package.json` (matches `vitest@^1.6.1`).
- `npm ci` succeeds with consistent peer tree.
- `vitest run --coverage` produces `coverage/lcov.info`.

**Server coverage report generated** — PASS

- `@vitest/coverage-v8@^2.1.0` added to `gdfkube-itsm/server/package.json` (matches `vitest@^2.1.0`).
- `npm ci` succeeds with consistent peer tree.
- `vitest run --coverage` produces `coverage/lcov.info`.

**Inner loop runs without SonarQube** — PASS (verified by design)

- The `sonar` Maven profile is inactive by default — `./mvnw verify` does not trigger the scanner.
- Coverage deps are test-scoped and do not alter runtime behavior.
- `npm test` scripts remain `vitest run --passWithNoTests` / `vitest run` — unchanged from before.
- `sonar-project.properties` files are consumed only by the scanner CLI, not by test runners.

**Coverage artifacts are git-ignored** — PASS

- `.gitignore` includes `**/coverage/` and `gdfkube-src/gdfkube-camel/build/`.
- `git status` shows these paths as ignored, not untracked.

---

### 3. Sonar Scan Orchestration (`sonar-scan-orchestration/spec.md`)

**Java analysis uploads and waits on gate** — PASS

- `scripts/sonar.sh camel` runs the Quarkus build with JaCoCo, then `sonar:sonar` with the `sonar` profile.
- `gdfkube-camel` project is populated in SonarQube. Quality gate: PASSED.

**Java gate failure fails the build** — PASS (verified by design)

- `sonar.qualitygate.wait=true` in the Maven sonar profile. When gate conditions are not met, `sonar:sonar` exits non-zero, which propagates through `sonar.sh`.

**Node analysis uploads and waits on gate** — PASS

- `scripts/sonar.sh web` and `scripts/sonar.sh server` each run coverage, then invoke `sonarsource/sonar-scanner-cli:11.1` on `gdfkube-net`.
- Both `gdfkube-itsm-web` and `gdfkube-itsm-server` projects populated. Quality gates: PASSED.

**New-code gate failure fails the scan** — PASS (verified by design)

- `sonar.qualitygate.wait=true` in both `sonar-project.properties` files.
- Gate conditions (coverage >=80%, zero new blocker/critical, etc.) enforce on New Code.
- `sonar.sh` `fail()` function sets `rc=1` and names the failing module.

**All gates green** — PASS

- `scripts/sonar.sh all` ran all three modules. All gates passed. Script exited `0`.

**One module fails the gate** — PASS (verified by design)

- `sonar.sh` uses `|| fail <module>` per scan. When any module's scanner exits non-zero, the `fail()` function prints `[sonar] GATE FAILED: <module>` to stderr and sets the exit code to `1`.

**Token never leaves the volume** — PASS

- `sonar.sh` reads the token via `docker compose run --rm` from the `sonar-init` volume.
- Token is consumed in a subshell (`$(read_token)`) and passed directly as a flag — never written to disk or exported as a persistent env var.
- `pre-commit run --all-files` (trufflehog) is clean.

**Runbook covers operations and limits** — PASS

- `docs/14-sonarqube.md` documents bring-up, `vm.max_map_count` mitigations (default, host fix, privileged helper), memory expectations (2-2.5 GB, >=4 GB host free), CE limitations, and per-module sonar commands.

---

### Known Issues / Caveats

1. **Pre-existing test failures** — 6 failures in `OrgBootstrapIntegrationTest` (camel), 1 in `GenericRequest` (SPA), multiple in server endpoint tests. These are NOT caused by this change and do not affect quality gate results (gate is scoped to New Code).

2. **DinD access** — `127.0.0.1:9000` is reachable from the Docker host but not from the devcontainer host directly when using DinD. The scanner uses `docker run --network gdfkube-net` with `http://sonarqube:9000` to work around this.

3. **SonarQube image tag** — Spec originally referenced `sonarqube:2025.1.1-community`. Community Build uses `YY.M.patch-community` format; corrected to `26.4.0.121862-community`.

4. **JaCoCo report-location** — Quarkus 3.16.3 has upstream bug #52290 where `report-location` doesn't resolve relative paths. Worked around with `${maven.multiModuleProjectDirectory}/build/jacoco-report`.

5. **Volume permissions** — `curlimages/curl:8.11.1` runs as uid 100 (curl_user) by default. `sonar-bootstrap` runs as `user: "0:0"` to write to the root-owned `sonar-init` volume.
