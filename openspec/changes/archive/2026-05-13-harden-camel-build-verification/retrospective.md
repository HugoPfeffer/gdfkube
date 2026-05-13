# Retrospective: harden-camel-build-verification

> Written: 2026-05-13 (after verify passed)
> Commit: `08de29b` (hotfix + IT + CI workflow + token-via-Mongo refactor + ITSM payload flatten)
> Worktree: merged to main

---

## 1. Wins

- [evidence: `pom.xml` diff in `08de29b`] One-line hotfix (`camel-quarkus-direct` added) unblocked the stuck pipeline. The stuck request `01KREXSW4NY1G7NQMTRPCNVEQJ` cleared once the Camel container redeployed.
- [evidence: `AppStartupIT.java`] `@QuarkusIntegrationTest` runs against the **packaged** artifact, not the test classpath. The exact asymmetry that hid the original incident is now the gate that catches it. A future missing-extension regression fails PR CI, not a deployed container hours later.
- [evidence: `.github/workflows/gdfkube-camel-ci.yml`] Module-scoped CI workflow runs `./mvnw -B -DskipITs=false verify` on every PR touching `gdfkube-src/gdfkube-camel/**`. Uses the in-repo Maven wrapper (build-reproducibility parity with `Dockerfile.jvm`), SHA-pinned `actions/setup-java`, Maven cache restoration.
- [evidence: existing healthcheck on `gdfkube-camel` in `docker-compose.yml`] Pre-existing `curl -sf http://localhost:8080/q/health/ready` healthcheck already satisfied the local-feedback requirement (`interval: 10s`, `retries: 18`, `start_period: 60s` for Quarkus + Kafka consumer-group join). No new compose block needed.
- [evidence: `GiteaGitProvider.java`, `GitPushRoute.java`, `RepoBootstrapRoute.java` diffs] Camel now sources the Gitea token from `gitea_settings` on each call. Rotation by `gitea-token-sync` propagates without a Camel restart — closes a latent operational gap.

## 2. Misses

- 🔴 [blocking | evidence: the stuck request itself, `01KREXSW4NY1G7NQMTRPCNVEQJ`] The original missing-extension defect shipped on `main` and was invisible to every existing test gate. The runtime symptom was silent: no UI error, no API error, just a backlogged Kafka topic and a buried log line. This change exists *because* of that miss.
- 🟡 [painful | evidence: D3 in design.md] The class of bug is broader than `camel-quarkus-direct`. Any future route adding `seda:`, `file:`, `kamelet:`, or another component scheme can re-introduce the same fail mode if its `camel-quarkus-*` extension is absent. The IT catches it after the PR is opened, not at edit time — a static lint pass would catch it earlier (parked in `brainstorm.md`).
- 🟡 [painful | evidence: tasks 5.1–5.2 deferred] The negative-control verification (deliberately remove the extension, watch CI fail) is gated on push to remote. The IT and workflow logic are correct-by-construction, but we have not seen the failure mode demonstrated end-to-end in CI.
- 📌 [nit | evidence: `AppStartupIT.java` asserts liveness UP, not per-route ids] The design open question (per-route-id assertions vs aggregate liveness) was resolved pragmatically toward liveness. This is simpler but less of a trip-wire — adding a new route does not force the developer to update the smoke.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 2.1 | `AppStartupIT` asserts liveness UP via `/q/health/live` rather than per-route-id `getRouteStatus()` checks | Liveness UP proves Quarkus finished startup without throwing, which proves every Camel route built. Per-route-id assertions deferred as a deliberate trip-wire option. |
| 4.1 | Healthcheck was *already* present on `gdfkube-camel`; no edit required | The block satisfied the requirement; recording the pre-existing state in the verify step instead of adding a duplicate block. |
| 5.x, 6.x | Deferred to post-merge | Negative-control PR + CI run-id back-fill + lint-pass decision are out-of-band from the change itself |

## 4. Skill / workflow compliance

| Skill                                            | Used | Reason if skipped |
|--------------------------------------------------|------|-------------------|
| superpowers:brainstorming                        | ✓    | `brainstorm.md` enumerated A (hotfix-only), B (IT+CI, chosen), C (static lint) and explained the trade-offs |
| superpowers:writing-plans                        | ✓    | `plan.md` mapped tasks to three parallel agents (A: hotfix+IT, B: healthcheck, C: CI workflow) |
| superpowers:using-git-worktrees                  | ✗    | Solo developer; landed on a working branch |
| superpowers:subagent-driven-development          | ✓    | Three-agent parallel layout in `plan.md`; agent split kept the work bounded |
| (transitive) superpowers:test-driven-development | partial | The IT was written *as the test* for the regression-prevention claim; the regression itself was discovered in production, not via TDD |
| (transitive) superpowers:requesting-code-review  | ✗    | No formal review; the change is small enough that the IT's correctness is verifiable by inspection |
| superpowers:finishing-a-development-branch       | ✓    | Merged on `main`; awaiting first CI run on a PR that touches the Camel module |

## 5. Surprises

- The Camel JAR built. The image started. The healthcheck on `/q/health/ready` may have been reading UP at some point during boot. And yet `direct:git-push` had no consumer because the Quarkus augmentation against the production classpath silently failed to wire it. The bug class — "test passes, image builds, app starts, but routes are broken" — is far more silent than I would have expected. The reasoning in `proposal.md` (test classpath transitively pulls `camel-quarkus-direct` via `camel-quarkus-junit5`) explains *why*, but the practical impact (stuck Kafka topic; no error anywhere) is sobering.
- `@QuarkusIntegrationTest` adds ~30s to CI but the cost is one-time per PR-against-module. Cheap for what it buys.

## 6. Promote candidates

| Learning | Promote to | Notes |
|----------|------------|-------|
| Quarkus apps need a packaged-artifact smoke (not just `@QuarkusTest`) | `.claude/rules/` candidate | "For any Quarkus module, an `@QuarkusIntegrationTest` smoke gating `mvn verify` is the only test that exercises the production classpath. `@QuarkusTest` alone is not sufficient." |
| Module-scoped CI workflows on path filters | already in pattern; reinforced | `gdfkube-camel-ci.yml` mirrors the convention for path-filtered module CI; reusable as a template for future modules |
| Token rotation via Mongo singleton beats env-baked tokens | already in `add-local-gitea-compose` design; reinforced here | The Camel-side refactor (`GiteaGitProvider` reads from `gitea_settings`) closed the rotation gap that env-baked tokens would have re-opened |
| Static lint for "route scheme ↔ declared extension" | parked in `brainstorm.md` | Optional future change; the IT is correct-by-construction, lint would shift detection one more step left |
| "Works in test, fails in packaged" is a Quarkus-specific bug class — flag it in onboarding | CLAUDE.md candidate | Specifically for Quarkus/Camel work — new contributors should know that `mvn test` green is not the same as `mvn verify` green |

---

## Follow-up work

| Item | Priority | Suggested change |
|---|---|---|
| Per-route-id assertions in `AppStartupIT` | LOW | Deliberate trip-wire option; adding a route forces test update |
| Static lint for route scheme ↔ extension declaration | LOW | Brainstorm option C; nice-to-have on top of the IT |
| Mark `gdfkube-camel-ci.yml` as a required PR check (task 3.3) | MEDIUM | Manual repo-settings step; not in this change's scope |
| Back-fill CI workflow run id (task 6.1) | LOW | After first PR-driven run lands green |
| Decide on `.claude/rules/` promotion of the extension-audit pattern (task 6.2) | LOW | Captured in this retrospective; lock in or discard |
