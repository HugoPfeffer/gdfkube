## Design Summary

Harden `OrgBootstrapRoute` along five independent axes uncovered in the post-merge audit of `auto-provision-org-resources-from-group-events`:

1. Clean up the `outputDir` scratch directory on exchange completion (mirroring `HelmRenderRoute`).
2. Populate `dedupCache` only after `commitAndPush` succeeds, so failed exchanges remain retriable.
3. Reject events that have neither `__op` nor `op` headers (treat as malformed, drop, no retry).
4. Drop the dead `groupRepo` argument from `HelmValuesBuilder.buildForOrg` and stop reading `node.path("repo")` at the route.
5. Replace hardcoded `/tmp/<groupId>-...` paths with `Files.createTempDirectory` / `Files.createTempFile` so concurrent redeliveries for the same `groupId` cannot collide on disk.

All five are surgical changes within `OrgBootstrapRoute.java`, `HelmValuesBuilder.java`, and their direct unit tests — no behavior change on the golden path; observable change on the failure path (failed events become retriable) and on malformed events (now dropped explicitly).

## Alternatives Considered

### Option A: All-in-one hardening pass (chosen)
- **Approach**: Apply all five hardening items in a single change, since they share the same files and the same blast radius.
- **Pros**: One PR, one round of tests, one verify pass; cohesive narrative ("post-merge audit fixes").
- **Cons**: Five-headed diff to review.
- **Why chosen**: Each fix is tiny on its own; bundling avoids five trivial PRs that all touch the same two files and the same tests.

### Option B: Split per axis (five micro-changes)
- **Approach**: One OpenSpec change per audit item.
- **Pros**: Smallest possible review unit.
- **Cons**: Each touches the same route/builder and triggers the same Camel test rebuild; serialising them costs time and the cumulative diff is identical.
- **Why not chosen**: Churn without review benefit — the items are co-located and don't conflict.

### Option C: Defer to a follow-up after `strengthen-org-bootstrap-tests`
- **Approach**: Land test improvements first, then revisit route hardening.
- **Pros**: Tests-first discipline.
- **Cons**: `strengthen-org-bootstrap-tests` is itself blocked on observable behavior here (dedup-after-success needs a test that asserts cache stays empty on failure); deferring inverts the dependency.
- **Why not chosen**: Per the plan's dependency graph, this change **blocks** the test rewrite, not the other way around.

## Agreed Approach

Option A — single change covering all five audit items. Sequenced after `unify-gitea-repo-naming` (which introduces `getRepoName(groupId)` and lets us safely drop the `node.path("repo")` read) and before `strengthen-org-bootstrap-tests` (which validates the new dedup-after-success behavior).

## Key Decisions

- **`op == null` is rejected (acked, not retried).** Treating a missing op header as "create" silently swallows broken upstream Debezium configuration. A WARN log + ack matches how we already handle `op == "d"`.
- **Dedup cache moves after `commitAndPush`, not after the audit emit.** The audit emit is best-effort and a failure there should not retry helm + git work. Trade-off: if Camel crashes between `commitAndPush` and `audit emit`, the next redelivery within 60s replays helm render — but `processGroupEvent` already detects "all 3 files present → noop" at line 140, so the replay is benign.
- **`Files.createTempDirectory` over manual UUID suffix.** Same outcome, but uses the platform's well-tested temp-path API and gets us OS-managed permissions/cleanup semantics for free.
- **`outputDir` cleanup goes on `.onCompletion()`, not in `finally`.** Matches `HelmRenderRoute.java:48-63` exactly. Set `exchange.setProperty("outputDir", outputDir)` inside `processGroupEvent` so the completion handler can read it back even on exception paths.
- **Keep `REPO_LOCKS`.** Useful as a tight-loop guard even with dedup-after-success — the `cloneOrPull` + write + commit window is still racy across two near-simultaneous distinct events.

## Open Questions

None. Audit items are mechanical fixes verified against `OrgBootstrapRoute.java` on 2026-05-14.
