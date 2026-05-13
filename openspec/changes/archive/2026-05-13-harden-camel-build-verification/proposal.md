## Why

A production-classpath defect in the Camel module — a missing `camel-quarkus-direct` extension — landed on `main` and was invisible to every existing test gate. The runtime symptom was silent: the ITSM request `01KREXSW4NY1G7NQMTRPCNVEQJ` was published to `dbz.gdfkube.requests` and stuck there, because the Camel consumer never started. No error surfaced in the UI, the API, or any Kafka client; the only signal was a backlogged topic and a `No endpoint could be found for: direct://git-push` log line buried in the Camel container.

The root cause is structural: `@QuarkusTest` runs in the *test* classpath, which transitively pulls `camel-quarkus-direct` via `camel-quarkus-junit5`. The production container build runs Quarkus augmentation against the *runtime* classpath only, where the extension was absent. Every `@QuarkusTest` passed, the JAR built, the image pushed — and the application failed to wire its routes at boot. The class of bug ("works in `mvn test`, fails in `mvn package` + run") was undetectable with the gates we had.

The immediate hotfix (adding `camel-quarkus-direct` to `pom.xml`) is being applied in parallel and is necessary but not sufficient. Any future Camel route that pulls in a `from(...)` or `.to(...)` scheme — `seda:`, `timer:`, `file:`, `kamelet:`, more `direct:` endpoints — can re-introduce the same regression if the corresponding `camel-quarkus-*` extension is not also declared. This change captures the **regression-prevention story**: shift detection left from "runtime in the deployed container" to "PR CI".

## What Changes

**`gdfkube-camel/pom.xml`** *(hotfix — already applied by Agent A in parallel)*
- From: only `camel-quarkus-kafka`, `camel-quarkus-mongodb`, `camel-quarkus-jackson`, `camel-quarkus-http` declared; `direct://` endpoints worked at test time only.
- To: `camel-quarkus-direct` added as a runtime dependency.
- Reason: route `direct:git-push` (`GitPushRoute`) and `direct:repo-bootstrap` (`RepoBootstrapRoute`) cannot resolve their consumers without it.
- Impact: One-line addition. Restores boot.

**`@QuarkusIntegrationTest` smoke** *(net-new test class — being added by Agent A)*
- From: only `@QuarkusTest` classes — they run on the dev-mode classpath, which differs from the packaged artifact.
- To: `AppStartupIT.java` runs against the **packaged** Quarkus app and asserts the context starts and the named routes register. Naming convention `*IT` plus the Failsafe plugin gate it from the default `mvn test` cycle.
- Reason: this is the gate that would have caught the missing extension.
- Impact: One new class, runs only when `-DskipITs=false` (default in CI; off for fast dev `mvn test`).

**CI workflow `gdfkube-camel-ci.yml`** *(being added by Agent C)*
- From: no module-scoped CI for `gdfkube-camel`; only the repo-level trufflehog and Dependabot workflows.
- To: GitHub Actions workflow that runs `./mvnw -pl gdfkube-src/gdfkube-camel -am -DskipITs=false verify` on every PR touching the Camel module.
- Reason: makes the prod-classpath augmentation a required PR check.

**Compose healthcheck on `gdfkube-camel`** *(being added by Agent B)*
- From: `gdfkube-camel` had no healthcheck — a half-started container looked healthy to `docker compose ps`.
- To: `curl -sf http://localhost:8080/q/health/ready` healthcheck with retries.
- Reason: locally, a runtime regression should turn the service red instead of silently consuming nothing.

**No source edits to routes, providers, or properties**
- The Camel route Java sources, `GiteaGitProvider`, and `application.properties` are untouched by this change.

## Capabilities

### Modified Capabilities

- `camel-orchestrator-stack`: Adds build-verification and route-registration smoke requirements. The existing requirements ("Camel app SHALL run as a single Quarkus JVM service", "Eight Camel routes SHALL be defined per the topology") gain a peer requirement that the **packaged artifact** must boot and register the declared routes — verified in CI, not just at runtime.

### New Capabilities

None. This change strengthens an existing capability rather than introducing a new one.

## Impact

- **Files modified** *(by parallel agents, not by this change directory)*:
  - `/workspace/gdfkube-src/gdfkube-camel/pom.xml` (one new `<dependency>`).
  - `/workspace/docker-compose.yml` (one new `healthcheck` block on `gdfkube-camel`).
- **Files created** *(by parallel agents)*:
  - `/workspace/gdfkube-src/gdfkube-camel/src/test/java/gov/gdf/camel/AppStartupIT.java`.
  - `/workspace/.github/workflows/gdfkube-camel-ci.yml`.
- **Files created by this change directory**:
  - `/workspace/openspec/changes/harden-camel-build-verification/` (this proposal + spec deltas).
- **Dependencies pinned**: `camel-quarkus-direct` inherits its version from the existing `camel-quarkus-bom` already imported by the module; no new version coordinates introduced. No conflicts.
- **Blast radius**:
  - **Services**: only `gdfkube-camel` (build behavior + healthcheck).
  - **API endpoints**: none changed.
  - **Kafka topics**: none changed. The stuck-topic *symptom* of the original incident clears once the hotfix is deployed; this change ensures that class of stuck-topic cannot recur silently.
  - **MongoDB collections**: none.
  - **CI surface**: one new workflow file gated by path filter on `gdfkube-src/gdfkube-camel/**`.
- **Testing strategy**:
  - **Integration**: `AppStartupIT` runs against the packaged artifact under Failsafe. Asserts `CamelContext.getRouteStatus("git-push")` is `Started` (and any other route ids that consume from `direct:`/`seda:`/etc.).
  - **CI**: PR pipeline runs `mvn -DskipITs=false verify`. A future missing extension fails the PR build, not the deployed container.
  - **Local**: compose healthcheck flips `gdfkube-camel` to `unhealthy` when `/q/health/ready` cannot reach the missing endpoint.
  - **Coverage delta**: small positive — `AppStartupIT` exercises the full augmentation/boot path that no existing test exercised.
- **Reference incident**:
  - Request id: `01KREXSW4NY1G7NQMTRPCNVEQJ` (stuck in `dbz.gdfkube.requests`).
  - Symptom: silent backlog; no error in API or UI; only a log line in `gdfkube-camel` saying `No endpoint could be found for: direct://git-push`.
  - Root cause: `camel-quarkus-direct` absent from `gdfkube-src/gdfkube-camel/pom.xml`.
  - Why tests missed it: `@QuarkusTest` augments against the test classpath, which transitively pulls `camel-quarkus-direct` via `camel-quarkus-junit5`. The production augmentation against the runtime classpath was never exercised in CI.
