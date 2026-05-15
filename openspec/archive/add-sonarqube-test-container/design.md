## Context

`gdfkube` is a devcontainer-based, Docker-Compose-driven demo stack
(Quarkus/Camel + React/Express ITSM + Kafka/Mongo/Debezium/Gitea). It already
establishes a strong convention for one-shot bootstrap init services:
`gitea-bootstrap` and `gitea-token-sync` use a pinned `curlimages/curl` image,
`restart: "no"`, `depends_on: service_healthy`, a host-mounted shell script,
`${VAR:-default}` env, and a named volume to hand a minted token to other
containers without it ever touching the repo or env.

There is currently **no coverage or code-quality instrumentation** in any of
the three test suites. The devcontainer runs Docker-in-Docker via a
bind-mounted `/var/run/docker.sock`, which constrains kernel-level tuning
(notably Elasticsearch's `vm.max_map_count`). The camel module overrides its
Maven build directory to `build/` (not `target/`). The two Node modules run
**different Vitest majors** — SPA `^1.6.1`, server `^2.1.0`.

Stakeholders: the solo developer (runs the stack locally and in the
devcontainer). No CI/CD or external consumers.

## Goals / Non-Goals

**Goals:**
- SonarQube CE + PostgreSQL as long-lived compose services on `gdfkube-net`,
  bootstrapped by a Gitea-pattern one-shot init.
- All three suites instrumented for coverage with version-matched tooling.
- One opt-in per-module `sonar` entrypoint + a `scripts/sonar.sh` orchestrator
  that **fails the command when the quality gate fails**.
- Gate scoped to **New Code** so day-one legacy debt does not mass-fail.
- Analysis token never enters the repo, env, or logs.
- Zero change to the fast inner loop (`./mvnw verify`, `npm test`) and zero
  change to any existing service.

**Non-Goals:**
- No GitHub Actions / CI changes (`.github/**` untouched).
- No PR decoration / branch analysis / portfolio rollup (unavailable in CE).
- No fix for the pre-existing `Dockerfile.jvm` `build/` vs `target/` mismatch
  (out of scope; flagged so JaCoCo paths stay correct).
- No scanner hard-wired into `mvn verify` / `npm test`.

## Decisions

**D1 — Long-lived compose services + Gitea-pattern one-shot init**
(over: ad-hoc manual SonarQube, or scanner-only with no server). Reusing the
proven `gitea-bootstrap`/`gitea-token-sync` shape keeps the stack consistent
and driftless and gives idempotent, repeatable provisioning. Trade-off: ≈2–2.5 GB
RAM even capped — mitigated by making SonarQube opt-in (in no app's
`depends_on`) and capping the web/CE/search JVMs.

**D2 — `io.quarkus:quarkus-jacoco` over raw `jacoco-maven-plugin`.**
Quarkus build-time augmentation makes the stock plugin mis-instrument
`@QuarkusTest`; the BOM-managed Quarkus extension instruments correctly and
needs no explicit version (avoids platform conflict). Report path is pinned to
`build/jacoco-report/jacoco.xml` because the camel build dir is `build/` — the
single biggest path hazard.

**D3 — Pinned `sonarsource/sonar-scanner-cli:11.1` Docker image over npm
`@sonar/scan`.** The npm scanner spawns a JVM as a devDependency and churns the
pinned Vitest `^1.6.1` peer tree in the SPA, risking `npm ci` breakage. A
pinned Docker image keeps Java out of `package.json` and the Vitest trees
untouched, and runs on `gdfkube-net` so `http://sonarqube:9000` resolves.

**D4 — Dedicated opt-in entrypoints, not scanner-in-test.** Hard-wiring the
scanner + blocking `qualitygate.wait` into `mvn verify`/`npm test` would make
every test run require a live SonarQube and a network round-trip, crippling TDD
and offline testing. Gate enforcement lives only in the Maven `sonar` profile /
`scripts/sonar.sh`.

**D5 — Quality gate scoped to New Code.** "Enforce immediately" (locked
decision 4) is only viable if legacy debt doesn't mass-fail on day one;
New-Code conditions (Coverage ≥ 80%, Dup ≤ 3%, ratings = A, zero new
Blocker/Critical) enforce going forward without a retroactive cliff.

**D6 — Token via `sonar-init` named volume, `chmod 600`, never logged.**
Mirrors the Gitea token handoff; satisfies the repo `no-secrets-in-code` /
trufflehog rule. Volume survives `stop`/`up`, intentionally wiped by `down -v`.
Fresh token every run (no reuse logic — simplicity); stale CE tokens are
harmless for a dev tool.

**D7 — `vm.max_map_count`: `SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true` as primary
mitigation.** Compose `sysctls:` is non-namespaced, fails unprivileged, and has
no effect across Docker-in-Docker — rejected. The proper fix
(`sudo sysctl -w vm.max_map_count=524288` on the host) is documented; a
privileged one-shot helper is an opt-in last resort only (privileged is a
security-posture regression vs. the all-unprivileged init services).

**Token / scan handoff (non-obvious interaction):**

```
sonar-db (healthy)
   │ depends_on: service_healthy
   ▼
sonarqube (healthy: GET /api/system/status == UP)
   │ depends_on: service_healthy
   ▼
sonar-bootstrap (one-shot, restart:"no")
   │ 1. rotate admin/admin   2. create 3 projects
   │ 3. create+default gdfkube-gate (New Code conds)
   │ 4. mint token ──chmod 600──▶ volume sonar-init:/sonar/token
   ▼                                      │
 exit 0 (logs non-secret summary)         │ (read-only)
                                          ▼
scripts/sonar.sh {camel|web|server|all}
   ├─ run module coverage (jacoco / vitest --coverage)
   └─ docker compose run --rm scanner  (on gdfkube-net)
          sonar.host.url=http://sonarqube:9000
          sonar.qualitygate.wait=true
          └─ gate FAIL ⇒ non-zero exit ⇒ sonar.sh non-zero
```

## Risks / Trade-offs

- **Devcontainer memory** (ES+web+CE ≈ 2–2.5 GB even capped) → SonarQube is
  opt-in, not in any app `depends_on`; JVMs capped; docs state ≥4 GB host free.
- **`vm.max_map_count` on Docker-in-Docker** → `SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true`
  primary; host `sysctl` documented as proper fix; privileged helper opt-in only.
- **Quarkus IT coverage gap** (packaged-jar classes load pre-agent) → gate
  targets New Code; optional `sonar.coverage.exclusions=**/*IT.java` if flaky.
- **Vitest version split** (`^1.6.1` SPA vs `^2.1.0` server) → coverage dep
  version-matched per module; `npm ci` added to the verification matrix.
- **`build/` vs `target/`** → JaCoCo / `sonar.java.binaries` pinned to `build/`;
  pre-existing `Dockerfile.jvm` `target/` mismatch flagged, out of scope.
- **CE feature ceiling** (no PR/branch decoration, no portfolio) → three
  independent projects; documented, not worked around.
- **Bootstrap re-run with wrong rotated password** → `bootstrap.sh` validates
  default *and* rotated creds; fatal only if neither works (idempotent).

## Migration Plan

- **Deploy:** purely additive. `docker compose up -d sonarqube sonar-db
  sonar-bootstrap` brings up the new stack; existing `docker compose up -d`
  for the app stack is unaffected (SonarQube in no app's `depends_on`).
- **No data migrations:** no MongoDB schema changes (token is a volume file,
  not a Mongo document), no Kafka topics / consumer-group rebalancing, no Helm
  value changes. Sonar's own Postgres is internal and provisioned fresh.
- **Rollback:** remove the three services + five volumes from
  `docker-compose.yml` and revert the per-module coverage/scanner edits;
  `git diff --stat` must match the blast-radius file list, then
  `docker compose down -v` wipes `sonar-*` volumes for a clean slate. No app
  state is touched, so rollback is a config revert with no data impact.

## Open Questions

None blocking. All residual unknowns are captured as Risks above with
mitigations; the locked product decisions resolve the design space.
