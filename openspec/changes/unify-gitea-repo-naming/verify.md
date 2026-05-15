# Verification: unify-gitea-repo-naming

## Spec Scenario Coverage

### ADDED: HelmValuesBuilder SHALL be the single source of truth for per-org Gitea repo names

| Scenario | Status | Evidence |
|----------|--------|----------|
| getRepoName returns canonical gdfkube-prefixed name | PASS | `HelmValuesBuilderTest#getRepoName_returnsCanonicalGdfkubePrefixedName` asserts `getRepoName("cultura") == "gdfkube-cultura"` |
| Both routes call the helper for the same group | PASS | Code inspection: `RepoBootstrapRoute` and `OrgBootstrapRoute` both call `helmValuesBuilder.getRepoName(org/groupId)` before passing to `gitRepoBootstrapper.ensure(giteaOwner, repoName, ...)` |
| No remaining inline composition | PASS | `grep -rn '"gdfkube-" *+' src/main/java/` returns exactly one match inside `HelmValuesBuilder.getRepoName`; `grep -rn 'giteaOwner *+ *"-"' src/main/java/` returns zero matches |

### MODIFIED: HelmValuesBuilder SHALL produce values for org-bootstrap charts

| Scenario | Status | Evidence |
|----------|--------|----------|
| buildForOrg writes a values file with canonical naming shape | PASS | `HelmValuesBuilderTest#buildForOrg_writesCanonicalValues` confirms output path, meta fields, naming fields |
| buildForOrg has no groupRepo parameter | PASS | Method signature is `buildForOrg(String groupId)` — single arg. Compilation enforces this (two-arg call fails to compile). |
| build(RequestEvent) is unchanged after the addition | PASS | All 5 existing `build_*` tests (labels, naming, meta, vars, writesYaml) pass unchanged. 13/13 tests green. |

### MODIFIED: org-bootstrap SHALL idempotently provision per-org GitOps content

| Scenario | Status | Evidence |
|----------|--------|----------|
| Audit repo field uses the helper | PASS | Code at `OrgBootstrapRoute:114`: `Map.of("repo", giteaOwner + "/" + helmValuesBuilder.getRepoName(groupId))` |
| Route uses getRepoName not inline composition | PASS | `OrgBootstrapRoute:111`: `helmValuesBuilder.getRepoName(groupId)` passed to `gitRepoBootstrapper.ensure` |

## Invariant Checks

| Check | Result |
|-------|--------|
| `"gdfkube-" +` only in `HelmValuesBuilder.getRepoName` | 1 match (correct) |
| `giteaOwner + "-"` zero matches in `src/main/java/` | 0 matches (correct) |
| `argocd-org` chart renders `gdfkube-saude.git` | 3 matches (chart unchanged) |
| `pre-commit run --all-files` | PASS (trufflehog) |
| Full compilation (main + test) | PASS |

## Test Results

| Suite | Result |
|-------|--------|
| `HelmValuesBuilderTest` (13 tests) | 13 PASS |
| `MockGitProviderTest` (7 tests) | 7 PASS |
| Total unit tests | 20/20 PASS |

## Known Gaps

| Gap | Severity | Rationale |
|-----|----------|-----------|
| `OrgBootstrapIntegrationTest` not green | Low | Pre-existing: never appeared in surefire reports before this change. Failures are SEDA async synchronization issues unrelated to naming. Infrastructure fix (`%test.camel.component.kafka.brokers`) was applied to unblock Quarkus startup but route message delivery needs separate work. |
| No dedicated `RepoBootstrapRoute` integration test with `giteaOwner != "gdfkube"` | Low | Behavior is byte-identical in the demo. The grep invariant + unit tests provide structural assurance. A full integration assertion with a non-default owner is deferred to when `OrgBootstrapIntegrationTest` infrastructure is fixed. |

## Scope Extras (beyond original plan)

| Extra | Why |
|-------|-----|
| `GitPushRoute` also migrated to use helper | Discovered during Task 6 grep invariant check — the old `giteaOwner + "-" + org` pattern existed there too. Fixed to satisfy the zero-match spec requirement. |
| `quarkus-junit5-mockito` added to pom.xml | Missing test dependency (pre-existing) — needed to compile `OrgBootstrapIntegrationTest` which uses `@InjectMock`. |
| `%test.camel.component.kafka.brokers` in application.properties | Pre-existing gap: Camel Kafka component didn't bridge DevServices in test mode. Required for integration tests to start. |
| Build directory redirected to `build/` | `target/` was root-owned from a prior container build. Workaround to enable Maven compilation in the current session. |

## Conclusion

All spec requirements are structurally satisfied. The naming unification is complete: `HelmValuesBuilder.getRepoName` is the single source of truth consumed by all three routes (`RepoBootstrapRoute`, `OrgBootstrapRoute`, `GitPushRoute`). The dead `groupRepo` parameter is removed. No blocking issues remain for this change.
