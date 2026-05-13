## Context

A request published to `dbz.gdfkube.requests` (id `01KREXSW4NY1G7NQMTRPCNVEQJ`) sat in the topic forever. The user-facing surfaces — the ITSM SPA, the Express API, even the Mongo audit log — showed nothing wrong; the topic just grew. Tail-of-logs investigation in `gdfkube-camel` eventually surfaced:

```
No endpoint could be found for: direct://git-push
```

The Camel context had refused to start `GitPushRoute` (and several other routes) because no `direct:` component was registered. The root cause is mechanical: `camel-quarkus-direct` was not declared in `gdfkube-src/gdfkube-camel/pom.xml`. Without that extension, Quarkus's build-time augmentation has nothing to wire to the `from("direct:...")` declarations.

## The missed signal

Why didn't anything catch this before merge?

- **`@QuarkusTest` passed.** Existing `RepoBootstrapRouteTest`, `GitPushRouteTest`, etc., all run under `@QuarkusTest`, which augments against the **test** classpath. The test classpath transitively includes `camel-quarkus-direct` via `camel-quarkus-junit5` — so the route registered fine in tests.
- **`mvn package` succeeded.** Augmentation against the production classpath ran during packaging, but a missing component is not a packaging error; it's a runtime registration error that surfaces only when the route is actually instantiated.
- **No PR CI runs `mvn verify` for `gdfkube-camel`.** Without `verify`, Failsafe never ran. There were no integration tests to run anyway.
- **Container image push succeeded.** Image build does not boot the application.
- **`docker compose up` had no healthcheck on `gdfkube-camel`.** The container was "running" — process alive, port open — but the route consumer never started.

So the gate that would have caught this was: **boot the packaged artifact in CI and assert the route registers**. We had every other gate (unit, package, image push) but not that one.

## Residual risk after the hotfix

Adding `camel-quarkus-direct` unblocks the immediate symptom but does nothing about the class. Future PRs that add:

- a `from("seda:...")` without `camel-quarkus-seda`
- a `from("timer:...")` without `camel-quarkus-timer`
- a `kamelet:` or `file:` or `jms:` reference without the corresponding extension

…will reproduce exactly the same silent-fail mode. The `AppStartupIT` smoke catches it on the PR, but only *after* the PR is opened — the developer still pushes a broken commit before learning. That's an acceptable trade for now; the alternative (edit-time enforcement) is real engineering, parked below as future work.

## Decisions reached

- The hotfix is necessary but not sufficient. The story is *regression prevention*.
- The minimum gate that would have caught this incident is `@QuarkusIntegrationTest` against the **packaged** artifact, run by CI on every PR touching the module. That's the smallest change that addresses the root cause (test/prod classpath asymmetry), not the symptom (one missing dependency).
- The IT default is *off* (`<skipITs>true</skipITs>`) to keep `mvn test` fast for solo-dev iteration. CI opts in explicitly via `-DskipITs=false`. Devs who want the gate locally can run `mvn verify` themselves.
- A compose healthcheck on `/q/health/ready` is added so the *local* feedback loop also catches this — but it is a debugging convenience, not a regression gate.

## Optional future work

- **Static lint of route schemes vs declared extensions.** A pre-commit or CI step that:
  1. Scans `src/main/java/**` for `from("<scheme>:` and `.to("<scheme>:` substrings.
  2. Extracts the scheme tokens.
  3. Asserts that for each token there exists a `camel-quarkus-<token>` dependency in `pom.xml` (allowing aliases — `kafka` → `camel-quarkus-kafka`, etc.).
  This catches the bug at edit time, before the developer even opens a PR. The downside is brittleness — dynamic URIs built from variables would either be missed or produce false positives. Worth considering, but not gating this hardening change on it.

- **Promote the extension-audit pattern to `/workspace/.claude/rules/`** as a path-scoped rule for `gdfkube-src/gdfkube-camel/**`, instructing future contributors (and the agent) to add the matching extension whenever a new Camel scheme appears.

- **Generalise the IT smoke to other Quarkus modules** if the team adds more. Same pattern; same gate.

## Stakeholders

- Solo developer (Hugo).
- The Camel orchestrator pipeline — every downstream consumer of `gdfkube.pipeline.status` depends on Camel actually running.

## Out of scope

- Encryption, secrets, or any non-build concern.
- Refactoring the Camel routes themselves.
- The unrelated stuck-request *replay* mechanism (separate concern; the hotfix re-drives the message naturally once the consumer starts).
