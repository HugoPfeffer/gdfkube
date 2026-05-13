## Design Summary

The bug class we are hardening against is "production classpath is missing a Quarkus extension; `@QuarkusTest` doesn't notice because the test classpath provides it transitively." The fix has two layers: (1) a new `@QuarkusIntegrationTest` smoke that runs against the **packaged** artifact instead of the test classpath, and (2) a CI workflow that runs Failsafe (`mvn verify`) on every PR so this smoke is a required check. A docker-compose healthcheck on `gdfkube-camel` is a third defense — locally, a similar regression turns the container `unhealthy` instead of silently consuming nothing.

## Alternatives Considered

### Option A: Only add the missing dependency and call it done

- **Approach**: Land the one-line `pom.xml` fix; no new tests, no CI changes.
- **Pros**: Smallest possible diff; unblocks the demo immediately.
- **Cons**: Zero regression prevention. The next Camel route to land that introduces `seda:`, `file:`, `kamelet:`, or another `direct:` consumer can re-introduce exactly the same silent-fail mode. The team's only signal would once again be a stuck Kafka topic.
- **Why not chosen**: The original incident proved that "tests pass + image builds" is not a sufficient gate for this class of bug. Without the IT + CI layer, we just buy time until the next missing extension.

### Option B: Add `@QuarkusIntegrationTest` smoke + CI `mvn verify` *(chosen)*

- **Approach**: A new `AppStartupIT` that boots the packaged artifact and asserts each route id reaches `Started`. CI runs `./mvnw -pl gdfkube-src/gdfkube-camel -am -DskipITs=false verify` on every PR touching the module. A compose healthcheck pins the local feedback loop.
- **Pros**: Catches the entire class of "missing extension" regressions — not just `direct:`. Runs in the same Maven invocation already used by build, so no new tool. Failsafe naming convention (`*IT.java`) keeps the test class out of the fast `mvn test` cycle developers use locally.
- **Cons**: Adds ~30s to PR CI runtime (packaging + boot once). Requires teaching contributors that there are two test cycles (`mvn test` and `mvn verify`).
- **Why chosen**: It addresses the root cause — the test-vs-prod classpath asymmetry — not just the symptom. It is also the minimum gate that would have caught this specific incident on the originating PR.

### Option C: Static lint that diffs route schemes vs declared extensions

- **Approach**: A pre-commit or CI step that greps each route's `from(...)` / `.to(...)` strings, parses the scheme, and asserts a matching `camel-quarkus-<scheme>` is in `pom.xml`.
- **Pros**: Fastest possible feedback (no JVM boot). Catches the bug at edit time, not at verify time.
- **Cons**: Brittle — route URIs can be built from constants, properties, or builders; would either miss the dynamic cases or generate false positives. Reimplements what Quarkus augmentation already does perfectly.
- **Why not chosen now**: Documented in `brainstorm.md` as optional future work. The IT smoke is correct-by-construction; a lint pass is a nice-to-have on top.

## Agreed Approach

**Option B**, layered as:

1. **Hotfix** — `camel-quarkus-direct` added to `pom.xml` (the immediate unblock).
2. **Regression gate** — `AppStartupIT` runs against the packaged artifact via Failsafe; asserts named routes register.
3. **CI gate** — `gdfkube-camel-ci.yml` runs `mvn -DskipITs=false verify` on PRs touching `gdfkube-src/gdfkube-camel/**`.
4. **Local feedback** — compose healthcheck on `/q/health/ready` for `gdfkube-camel`.

## Key Decisions

### D1. `@QuarkusIntegrationTest` over only `@QuarkusTest`

- `@QuarkusTest` reuses the *test* classpath. For Camel that includes `camel-quarkus-junit5`, which transitively pulls `camel-quarkus-direct` (and several other component extensions) even when `pom.xml` does not declare them. This is exactly the asymmetry that hid the original incident.
- `@QuarkusIntegrationTest` runs against the **packaged** artifact (`target/quarkus-app/` or the native binary), spawning it as a child process. The augmentation that runs there sees only the production classpath — the same one the deployed container sees.
- **Naming and lifecycle**: convention is `*IT.java`; the Surefire plugin (which runs in `mvn test`) skips `*IT` by default; the Failsafe plugin (which runs in `mvn verify`) is the one that executes them. This split is deliberate.
- **Trade-off**: an IT is meaningfully slower than a unit test (Quarkus has to package, then boot the artifact in a subprocess — order of tens of seconds). Worth it for the smoke gate; not worth it for individual route logic, which stays under `@QuarkusTest`.
- **Alternatives considered**: forcing a `@QuarkusTest` to use a "production" classpath via Maven profile manipulation. Rejected — Quarkus does not officially support this and the workaround would be fragile across version bumps.

### D2. `<skipITs>true</skipITs>` default; CI overrides with `-DskipITs=false`

- Developer-facing `mvn test` stays fast. Running `mvn verify` locally still runs the IT for developers who want it, by passing `-DskipITs=false`.
- CI explicitly opts in via the workflow command line. This means a developer cannot accidentally land a green PR while the IT is silently skipped — the workflow file is the source of truth for the gate.
- **Alternative considered**: flipping the default to `<skipITs>false</skipITs>` so `mvn verify` always runs them. Rejected — it would slow the local edit-test loop and discourage running `verify` at all. CI is the right enforcement boundary.
- **Migration concern**: if a contributor previously assumed `mvn verify` was a no-op, they may now see longer local builds. Documented in `proposal.md`.

### D3. Compose healthcheck is local-only, not the regression gate

- The healthcheck (`curl -sf http://localhost:8080/q/health/ready`) flips the container `unhealthy` if the application fails to start its routes. This is a useful local debugging signal, but it is **not** the gate — the gate is CI.
- Reason: a healthcheck only fires after a container is already deployed. By that point the regression has shipped. CI is the only place to catch it pre-merge.
- **Trade-off**: minor compose-config noise in exchange for a much better dev-loop signal.

## Risks / Trade-offs

- **IT slowness becomes a PR-bottleneck** → mitigation: the IT is scoped to a single smoke (route registration). It does not exercise Kafka, Mongo, or Helm — those stay under `@QuarkusTest`. Expected runtime ≤30s.
- **CI workflow path filter drifts from module layout** → mitigation: the workflow watches `gdfkube-src/gdfkube-camel/**` and `.github/workflows/gdfkube-camel-ci.yml` itself, mirroring the convention used elsewhere.
- **Future Camel components without an extension audit** → residual risk. The IT catches it after a PR is opened, not at edit time. Optional lint pass is parked in `brainstorm.md`.
- **`@QuarkusIntegrationTest` flakiness** in containerised CI → mitigation: keep the smoke assertion narrow (route ids are `Started`); avoid timing-sensitive checks.

## Migration Plan

This change is additive and CI-only — no consumer-facing behavior changes, no Mongo schema, no Kafka consumer group changes, no Helm values touched.

1. The hotfix (`camel-quarkus-direct` in `pom.xml`) merges first via Agent A's PR. The stuck `01KREXSW4NY1G7NQMTRPCNVEQJ` request can be re-driven once the Camel container redeploys.
2. The IT + CI workflow merge in the same PR (Agents A and C). From that point, future missing-extension regressions fail PR CI.
3. The compose healthcheck merges via Agent B's PR; developers see immediate feedback locally.

Rollback: revert the workflow file and the IT class. The hotfix dependency should NOT be rolled back — it is what unblocks the route.

## Open Questions

- Should the IT assert every route id by name, or just `CamelContext.getStatus() == Started`? Conservative answer: assert each route by id, so adding a route forces the developer to update the smoke (a deliberate trip-wire). Final call deferred to the implementer.
- Should we promote this to a full design doc with retrospective, or leave it as a hardening note? See the trailing question to the reviewer in the return report.
