# Harden Camel Build Verification — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task. Each Task ends with a commit point; do not batch commits across Tasks.

**Goal:** Make a future missing `camel-quarkus-<scheme>` extension fail at PR time, not silently at runtime. Capture the original incident (stuck request `01KREXSW4NY1G7NQMTRPCNVEQJ`, missing `camel-quarkus-direct` in `gdfkube-camel/pom.xml`) and add three defenses: a packaged-artifact integration smoke, a module-scoped CI gate that runs that smoke, and a compose-level readiness signal so operators see `unhealthy` instead of silent topic backlog.

**Architecture:** One pom dependency, one `@QuarkusIntegrationTest` (Failsafe-bound) asserting `/q/health/live == UP`, one Maven Failsafe plugin declaration so `mvn verify` actually runs the IT, one new GitHub Actions workflow scoped to the `gdfkube-camel` module path that runs `./mvnw -B -DskipITs=false verify`, and verification (not addition) of the pre-existing compose healthcheck on the `gdfkube-camel` service.

**Tech Stack:** Apache Camel + Quarkus 3.16, Maven Failsafe 3.5.2, JUnit 5 + rest-assured (already in test scope), GitHub Actions with Temurin JDK 21, docker compose v2 healthcheck.

**Reference artifacts in this change:**
- `proposal.md`, `design.md` — why and how
- `specs/camel-orchestrator-stack/spec.md` — testable requirements and scenarios
- `tasks.md` — coarse checklist (this plan is the micro-step decomposition)
- `brainstorm.md` — missed-signal analysis and optional future work

---

## Task 1: Hotfix — declare the missing Camel extension

> Scope: tasks.md §1. End-state: `gdfkube-camel/pom.xml` declares `camel-quarkus-direct`; `./mvnw package` succeeds; the rebuilt container can resolve `direct:git-push`.

- [ ] **Step 1.1:** Open `/workspace/gdfkube-src/gdfkube-camel/pom.xml`. Locate the contiguous "Camel Quarkus" dependency group (immediately after the `<!-- Camel Quarkus -->` comment, around line 40).

- [ ] **Step 1.2:** Insert immediately after the `camel-quarkus-kafka` block, keeping the group contiguous:

  ```xml
  <dependency>
    <groupId>org.apache.camel.quarkus</groupId>
    <artifactId>camel-quarkus-direct</artifactId>
  </dependency>
  ```

  Verify: `grep -A1 camel-quarkus-direct gdfkube-src/gdfkube-camel/pom.xml` prints the new artifactId. No version (BOM-managed).

- [ ] **Step 1.3:** Build the module: `./mvnw -pl gdfkube-src/gdfkube-camel -am -DskipTests -DskipITs package`. Expect BUILD SUCCESS. In the augmentation log, `Installed features:` MUST include `camel-direct`.

- [ ] **Step 1.4:** Rebuild and restart the local container:

  ```sh
  docker compose build gdfkube-camel
  docker compose up -d gdfkube-camel
  ```

  Poll `docker compose logs --tail=50 gdfkube-camel` for `started in` and the `Installed features:` line. Container state MUST be `Up`.

- [ ] **Step 1.5 — Commit:** `git add gdfkube-src/gdfkube-camel/pom.xml` and commit `fix(camel): declare camel-quarkus-direct extension`.

---

## Task 2: Smoke-test gate — `@QuarkusIntegrationTest` against the packaged artifact

> Scope: tasks.md §2. End-state: `AppStartupIT` exists, Failsafe is bound to `mvn verify`, the IT asserts `/q/health/live == UP`, the IT skips under default `mvn test`.

- [ ] **Step 2.1:** Create `/workspace/gdfkube-src/gdfkube-camel/src/test/java/gov/gdf/camel/AppStartupIT.java`:

  ```java
  package gov.gdf.camel;

  import static io.restassured.RestAssured.given;
  import static org.hamcrest.CoreMatchers.equalTo;

  import java.util.concurrent.TimeUnit;

  import org.junit.jupiter.api.Test;
  import org.junit.jupiter.api.Timeout;

  import io.quarkus.test.junit.QuarkusIntegrationTest;

  @QuarkusIntegrationTest
  class AppStartupIT {
      @Test
      @Timeout(value = 30, unit = TimeUnit.SECONDS)
      void startsCleanly() {
          given()
              .get("/q/health/live")
              .then()
                  .statusCode(200)
                  .body("status", equalTo("UP"));
      }
  }
  ```

  Verify: file naming ends in `IT.java` so Failsafe (not Surefire) picks it up. `@Timeout(30s)` caps CI hang risk on a slow runner mid-rebalance.

- [ ] **Step 2.2:** Declare Maven Failsafe in `gdfkube-src/gdfkube-camel/pom.xml`. Insert immediately after the `maven-surefire-plugin` block in `<build><plugins>`:

  ```xml
  <plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-failsafe-plugin</artifactId>
    <version>3.5.2</version>
    <executions>
      <execution>
        <goals>
          <goal>integration-test</goal>
          <goal>verify</goal>
        </goals>
      </execution>
    </executions>
    <configuration>
      <systemPropertyVariables>
        <java.util.logging.manager>org.jboss.logmanager.LogManager</java.util.logging.manager>
      </systemPropertyVariables>
    </configuration>
  </plugin>
  ```

  Quarkus' parent BOM does NOT bind Failsafe by default. Without this, `mvn verify` will SKIP `*IT.java` silently and the entire gate becomes decorative.

- [ ] **Step 2.3:** Confirm default `mvn test` is still fast and skips the IT: `./mvnw -pl gdfkube-src/gdfkube-camel -am test`. Surefire MUST run unit tests only; Failsafe MUST NOT execute.

- [ ] **Step 2.4:** Confirm `./mvnw -pl gdfkube-src/gdfkube-camel -am -DskipITs=false verify` invokes Failsafe and the IT passes. The Failsafe report MUST list `gov.gdf.camel.AppStartupIT`.

- [ ] **Step 2.5:** Regression-mode check: temporarily remove the `camel-quarkus-direct` dep from pom, re-run `mvn verify`. Expect failure at the Quarkus augmentation phase (before the IT runs) with the original error text `No endpoint could be found for: direct://git-push`. Restore the dependency.

- [ ] **Step 2.6 — Commit:** `git add gdfkube-src/gdfkube-camel/src/test/java/gov/gdf/camel/AppStartupIT.java gdfkube-src/gdfkube-camel/pom.xml` and commit `test(camel): add AppStartupIT smoke + bind failsafe`.

---

## Task 3: CI gate — module-scoped GitHub Actions workflow

> Scope: tasks.md §3. End-state: `.github/workflows/gdfkube-camel-ci.yml` triggers on changes under `gdfkube-src/gdfkube-camel/**` and runs `./mvnw -DskipITs=false verify` with a pinned `setup-java` action.

- [ ] **Step 3.1:** Create `/workspace/.github/workflows/gdfkube-camel-ci.yml`. Mirror the style of `.github/workflows/gdfkube-itsm-ci.yml` (pinned action SHAs, `permissions: {}` at the top, per-job `contents: read`, `persist-credentials: false`, `defaults.run.working-directory`).

- [ ] **Step 3.2:** Triggers and path filter:

  ```yaml
  on:
    push:
      branches: [main]
      paths:
        - 'gdfkube-src/gdfkube-camel/**'
        - '.github/workflows/gdfkube-camel-ci.yml'
    pull_request:
      paths:
        - 'gdfkube-src/gdfkube-camel/**'
        - '.github/workflows/gdfkube-camel-ci.yml'
  ```

- [ ] **Step 3.3:** Build job with pinned actions (SHA values must be full 40-char commits per `.claude/rules/github-actions-security.md`):

  ```yaml
  steps:
    - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      with:
        persist-credentials: false
    - uses: actions/setup-java@8df1039502a15bceb9433410b1a100fbe190c53b # v4.5.0
      with:
        distribution: temurin
        java-version: '21'
        cache: maven
        cache-dependency-path: gdfkube-src/gdfkube-camel/pom.xml
    - run: ./mvnw -B -DskipITs=false verify
  ```

  Use `./mvnw` (the in-repo wrapper, executable, version-pinned to the project) — NOT the runner's `mvn` — for build reproducibility parity with `Dockerfile.jvm` (which runs `./mvnw package`).

- [ ] **Step 3.4:** Validate parse: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/gdfkube-camel-ci.yml'))"`. No exception.

- [ ] **Step 3.5 — Commit:** `git add .github/workflows/gdfkube-camel-ci.yml` and commit `ci(camel): add module-scoped build + IT workflow`.

---

## Task 4: Verify the pre-existing compose healthcheck

> Scope: tasks.md §4. End-state: no edit — record that the `gdfkube-camel` service already declares a `/q/health/ready` healthcheck that meets the spec.

- [ ] **Step 4.1:** Inspect `/workspace/docker-compose.yml` for the `gdfkube-camel` service. The block at lines 372–377 already contains:

  ```yaml
  healthcheck:
    test: ["CMD-SHELL", "curl -sf http://localhost:8080/q/health/ready | grep -q UP"]
    interval: 10s
    timeout: 5s
    retries: 18
    start_period: 60s
  ```

- [ ] **Step 4.2:** Validate: `docker compose config gdfkube-camel | grep -A6 healthcheck`. Confirm the resolved config matches and `start_period` resolves to `1m0s`.

- [ ] **Step 4.3:** No commit for this task (no file change). Note in the OpenSpec verify step that the healthcheck pre-existed.

---

## Task 5: End-to-end smoke (post-Task 1)

> Scope: capture that the stuck request drained. End-state: `gdfkube/gdfkube-saude` repo materializes in local Gitea; `gdfkube.pipeline.status` topic has events for `01KREXSW4NY1G7NQMTRPCNVEQJ`.

- [ ] **Step 5.1:** After Task 1's `docker compose up -d gdfkube-camel` finishes, poll for the new repo:

  ```sh
  docker exec gdfkube-gitea curl -sf -u "gdfkube-admin:ChangeMeLocally123!" \
    http://gitea:3000/api/v1/orgs/gdfkube/repos
  ```

  Expect `gdfkube-saude` in the names list.

- [ ] **Step 5.2:** Count pipeline status events for the request id:

  ```sh
  docker exec workspace-kafka1-1 /opt/kafka/bin/kafka-console-consumer.sh \
    --bootstrap-server localhost:19092 --topic gdfkube.pipeline.status \
    --from-beginning --max-messages 50 --timeout-ms 5000 2>/dev/null \
    | grep 01KREXSW4NY1G7NQMTRPCNVEQJ | wc -l
  ```

  Expect `>= 6` (stages 0–5; stage 6 is `awaiting` because ArgoCD isn't in the local stack).

---

## Task 6: Close out the OpenSpec change

> Scope: tasks.md §6. End-state: the change is ready for `/opsx:apply` to archive after `verify.md` and `retrospective.md` are authored at apply time.

- [ ] **Step 6.1:** `openspec status --change "harden-camel-build-verification"`. Confirm `brainstorm`, `design`, `proposal`, `specs`, `tasks`, and `plan` are all `done`; `verify` and `retrospective` remain pending.

- [ ] **Step 6.2:** Final tidy: `git status` — confirm only the expected sets of changes are staged/committed: `gdfkube-src/gdfkube-camel/pom.xml`, `gdfkube-src/gdfkube-camel/src/test/java/gov/gdf/camel/AppStartupIT.java`, `.github/workflows/gdfkube-camel-ci.yml`, and the OpenSpec change folder under `openspec/changes/harden-camel-build-verification/`.

- [ ] **Step 6.3 — Commit (OpenSpec artifacts):** `git add openspec/changes/harden-camel-build-verification/` and commit `add openspec change: harden-camel-build-verification`.
