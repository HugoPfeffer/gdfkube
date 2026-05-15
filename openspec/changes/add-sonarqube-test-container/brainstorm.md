## Design Summary

Add **SonarQube Community Edition** (`2025.1.1-community`) plus its required
**PostgreSQL** (`15.10-alpine`) as long-lived `docker-compose.yml` services on
the existing `gdfkube-net`, bootstrapped by a one-shot `sonar-bootstrap` init
service modeled on the existing `gitea-bootstrap`/`gitea-token-sync` pattern.
All three test suites (`gdfkube-camel` Java/Quarkus, `gdfkube-itsm` SPA,
`gdfkube-itsm/server`) are instrumented for coverage with version-matched
tooling, and a per-module opt-in "sonar" entrypoint plus a `scripts/sonar.sh`
orchestrator runs tests + coverage + analysis and **fails when the quality gate
fails**. Local + devcontainer only — no GitHub Actions / CI changes, and the
fast inner dev loop (`./mvnw verify`, `npm test`) stays SonarQube-free.

This is a settled design: the four product decisions and the technical approach
were locked in the source PRD (`openspec/prd/add-sonarqube-test-container.md`).
The alternatives below are recorded for traceability; they were evaluated and
rejected before this proposal.

## Alternatives Considered

### Option A: Scanner hard-wired into `mvn verify` / `npm test`
- **Approach**: Bind the SonarQube scanner directly into the existing test
  entrypoints so every test run uploads and waits on the quality gate.
- **Pros**: Zero new entrypoints; quality enforced on literally every run.
- **Cons**: Every `./mvnw verify` / `npm test` would require a live SonarQube
  and a blocking `qualitygate.wait` round-trip; cripples TDD inner loop; breaks
  offline-capable testing; violates the "no inner-loop tax" constraint.
- **Why not chosen**: Inner-loop speed and offline capability are
  non-negotiable; gate enforcement belongs only in a dedicated opt-in path.

### Option B: Raw `jacoco-maven-plugin` + npm `@sonar/scan` devDependency
- **Approach**: Use the stock JaCoCo Maven plugin for Java coverage and the
  npm `@sonar/scan` package as the Node scanner.
- **Pros**: Familiar, no Docker scanner image to pin.
- **Cons**: Raw `jacoco-maven-plugin` mis-instruments `@QuarkusTest` /
  augmented classes (Quarkus build-time transformation); `@sonar/scan` spawns a
  JVM as a devDependency and churns the pinned Vitest `^1.6.1` peer tree, risking
  `npm ci` breakage in the SPA.
- **Why not chosen**: `io.quarkus:quarkus-jacoco` (BOM-managed) instruments
  Quarkus correctly; a pinned `sonarsource/sonar-scanner-cli:11.1` Docker image
  keeps Java out of `package.json` and leaves the Vitest tree untouched.

### Option C: Compose `sysctls:` for `vm.max_map_count` (Elasticsearch)
- **Approach**: Set the embedded-Elasticsearch kernel requirement
  (`vm.max_map_count >= 524288`) via a compose `sysctls:` block on the
  SonarQube service.
- **Pros**: Declarative, lives in `docker-compose.yml`.
- **Cons**: `vm.max_map_count` is a non-namespaced kernel sysctl; a compose
  `sysctls:` entry fails for unprivileged containers and has no effect across
  the devcontainer's Docker-in-Docker (bind-mounted `/var/run/docker.sock`) —
  it is a *host* setting.
- **Why not chosen**: Primary mitigation is
  `SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true` (single-node CE starts on
  default-kernel hosts); the documented proper fix is a host
  `sudo sysctl -w vm.max_map_count=524288`; a privileged one-shot helper is an
  opt-in last resort only (privileged is a security-posture regression vs. the
  all-unprivileged init services).

## Agreed Approach

**Option A is rejected; the chosen approach is the inverse of A** plus Option
B's and C's "Why not chosen" resolutions: SonarQube + Postgres as long-lived
compose services, a Gitea-pattern one-shot `sonar-bootstrap` for password
rotation / project + quality-gate creation / token minting into a named volume,
BOM-managed `quarkus-jacoco` and version-matched `@vitest/coverage-v8`
(`^1.6.1` SPA / `^2.1.0` server) for coverage, a pinned scanner-cli Docker
image for Node analysis, and a single `scripts/sonar.sh camel|web|server|all`
orchestrator that owns gate enforcement. It is the only approach that satisfies
all four locked decisions while preserving the offline, fast inner loop and the
repo's all-unprivileged, driftless, shell-init conventions.

## Key Decisions

1. **Scope = all three suites** (camel + SPA + server) — one project key each:
   `gdfkube-camel`, `gdfkube-itsm-web`, `gdfkube-itsm-server`.
2. **Wiring = long-lived compose services + Gitea-pattern one-shot init**;
   reuse `gdfkube-net`; SonarQube on `127.0.0.1:9000:9000`, `sonar-db` internal.
3. **Execution = local + devcontainer only**; `.github/**` untouched.
4. **Quality gate enforced immediately**, scoped to **New Code** (Coverage ≥ 80%,
   Duplicated Lines ≤ 3%, Maint/Rel/Sec rating = A, zero new Blocker/Critical)
   so day-one legacy debt does not mass-fail; a failing gate fails the
   `scripts/sonar.sh` command.
5. **Coverage tooling is version-matched per module** — `quarkus-jacoco`
   (BOM 3.16.3) for Java, `@vitest/coverage-v8@^1.6.1` for the SPA,
   `@vitest/coverage-v8@^2.1.0` for the server.
6. **JaCoCo / `sonar.java.binaries` MUST use `build/`** (camel build dir is
   overridden to `build/`, not `target/`); the pre-existing `Dockerfile.jvm`
   `target/` mismatch is explicitly out of scope.
7. **Token never enters the repo or env** — minted into the `sonar-init` named
   volume, read read-only by the scanner container; never logged.

## Open Questions

- None blocking. Residual risks are tracked in the proposal/design: devcontainer
  memory headroom (≈2–2.5 GB for SonarQube even capped; ≥4 GB host free,
  opt-in service), `vm.max_map_count` on Docker-in-Docker (mitigation +
  documented host fix), Quarkus IT coverage gap (gate targets New Code; optional
  `**/*IT.java` exclusion if flaky), and the per-module Vitest split requiring
  `npm ci` in the verification matrix.
