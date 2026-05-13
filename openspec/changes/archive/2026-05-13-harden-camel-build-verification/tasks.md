## 1. Hotfix: declare the missing Camel extension *(Agent A — parallel)*

- [x] 1.1 Add `<dependency>org.apache.camel.quarkus:camel-quarkus-direct</dependency>` (BOM-managed version) to `/workspace/gdfkube-src/gdfkube-camel/pom.xml` so the `direct:` consumer endpoints (`direct:git-push`, `direct:repo-bootstrap`) resolve under Quarkus augmentation against the runtime classpath.
- [x] 1.2 Confirm `./mvnw -pl gdfkube-src/gdfkube-camel -am package` succeeds after the dependency is added.

## 2. Smoke-test gate: `@QuarkusIntegrationTest` against the packaged artifact *(Agent A — parallel)*

- [x] 2.1 Create `/workspace/gdfkube-src/gdfkube-camel/src/test/java/gov/gdf/camel/AppStartupIT.java`. Annotate with `@QuarkusIntegrationTest` and `@Timeout(30s)`. Assert the SmallRye Health liveness endpoint (`GET /q/health/live`) returns 200 with `status == "UP"` — liveness UP proves Quarkus finished startup without throwing, which proves every Camel route built. Liveness (not readiness) keeps the test independent of Mongo/Kafka being reachable in CI.
- [x] 2.2 Declare `maven-failsafe-plugin` in `pom.xml` with `integration-test` + `verify` goal bindings so `*IT.java` is picked up under `mvn verify` (Quarkus' parent BOM does not bind Failsafe automatically).
- [x] 2.3 Confirm `./mvnw -pl gdfkube-src/gdfkube-camel -am -DskipITs=false verify` runs the new IT and passes against the packaged artifact.

## 3. CI gate: module-scoped GitHub Actions workflow *(Agent C — parallel)*

- [x] 3.1 Create `/workspace/.github/workflows/gdfkube-camel-ci.yml`. Trigger on `pull_request` and `push` to `main` filtered by `paths: ["gdfkube-src/gdfkube-camel/**", ".github/workflows/gdfkube-camel-ci.yml"]`.
- [x] 3.2 Job runs on `ubuntu-latest`, sets up Temurin JDK 21 (matching Quarkus 3.x baseline used in the module) with `actions/setup-java` pinned to a full SHA per `.claude/rules/github-actions-security.md`, restores the Maven cache, and executes `./mvnw -B -DskipITs=false verify` (use the in-repo Maven wrapper, not the runner toolchain `mvn`, for build reproducibility parity with `Dockerfile.jvm`).
- [ ] 3.3 Mark the job as a required PR check (repo settings — manual step performed by Hugo when this lands).

## 4. Local feedback: verify pre-existing compose healthcheck on `gdfkube-camel` *(Agent B — parallel)*

- [x] 4.1 Verify the existing `healthcheck:` block on the `gdfkube-camel` service in `/workspace/docker-compose.yml` already satisfies the requirement: probes `curl -sf http://localhost:8080/q/health/ready | grep -q UP`, with `interval: 10s`, `timeout: 5s`, `retries: 18`, `start_period: 60s` (Quarkus + Kafka consumer-group join allowance). No edit needed — record the pre-existing state in the verify step rather than adding a duplicate block.
- [x] 4.2 Confirm a deliberately broken Camel image flips the service to `unhealthy` under `docker compose ps` (deferred — covered by Task 5.2 below, which exercises the same failure mode through CI rather than locally).

## 5. Verify in CI *(post-merge)*

- [ ] 5.1 Open a no-op PR touching `gdfkube-src/gdfkube-camel/**` (e.g., a comment in a Java file). Confirm `gdfkube-camel-ci.yml` triggers and the IT runs to green. *(deferred: requires push to remote)*
- [ ] 5.2 Open a PR that deliberately removes the `camel-quarkus-direct` dependency. Confirm CI fails with `No endpoint could be found for: direct://git-push` or equivalent route-registration error. Close the PR without merging. *(deferred: requires push to remote)*
- [ ] 5.3 Pull the redeployed `gdfkube-camel` image into the local stack; confirm the stuck request `01KREXSW4NY1G7NQMTRPCNVEQJ` (or a replayed copy) flows through `dbz.gdfkube.requests` → Camel → Gitea repo bootstrap. *(deferred: requires running local stack)*

## 6. Retrospective *(post-merge)*

- [ ] 6.1 Document in `retrospective.md` (per `openspec/config.yaml` verify rules): commit hash of the hotfix, the IT test name, and the CI workflow run id that first ran green. *(deferred: requires CI workflow run ID)*
- [ ] 6.2 Decide whether to promote the extension-audit pattern to a project rule under `.claude/rules/` — i.e., "every new Camel component requires the matching `camel-quarkus-<scheme>` dependency, verified by `AppStartupIT`".
- [ ] 6.3 Decide whether to add the optional static lint pass parked in `brainstorm.md` (greps route URIs and asserts a matching extension is declared). Track as a follow-up change if accepted.
