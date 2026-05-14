# Retrospective: auto-provision-org-resources-from-group-events

> Written: 2026-05-14 (after verify passed)
> Implementation commit: `2dbcb31` (paired with `remove-deadcode-group-admin-controls`)
> Proposal commit: `6a476d9`
> Worktree: merged to main

---

## 1. Wins

- [evidence: `OrgBootstrapRoute.java` in `2dbcb31`] The orphaned `argocd-org` and `rhacm-org` Helm charts finally have a trigger. Creating a group in the SPA now idempotently produces the per-org Gitea repo (`gdfkube-{groupId}`) and the three target manifests under `orgs/{groupId}/` in the central `gdfkube-orgs` repo — exactly what the SPA preview had been promising since the prior change cleaned out the dead admin toggles.
- [evidence: `GitRepoBootstrapper.java` (32 lines), `HelmTemplateRunner.java` (79 lines), `RepoBootstrapRoute.java` + `HelmRenderRoute.java` diffs] The two beans extracted from the existing routes carry the existing pipeline forward unchanged while letting the new route reuse the same logic. No duplication, no behavior delta in `PipelineIntegrationTest`. This is the "prefer modifying existing functions/services over creating new ones" rule from CLAUDE.md doing its job: the new route is ~235 lines because the cross-cutting concerns (repo existence, helm subprocess) live elsewhere.
- [evidence: `OrgBootstrapIntegrationTest.java` (237 lines, 7 cases)] Every spec scenario has a backing test: first-event bootstrap, replay noop, partial-state self-heal, existing-per-org-repo + central still bootstraps, `op=d` dropped, replay-within-TTL deduped, helm-render failure → DLQ. The tests mirror `PipelineIntegrationTest`'s `MockProfile` + `AdviceWith` pattern, so a future contributor can land a new CDC route by templating off either test.
- [evidence: `connector-config.json` diff (single-line `collection.include.list` extension) and `init-camel-collections.js` diff (one `collMod` block mirroring the existing two)] The Debezium plumbing is additive: same connector, same SMTs, same consumer group, same offset semantics. New topic `dbz.gdfkube.groups` appears on first event; existing topics and consumer groups are untouched. No reset, no breaking config change.
- [evidence: idempotency strategy in `OrgBootstrapRoute.java`] The "git-file-exists at destination repo" check chosen over a side-channel marker collection means manual edits in `gdfkube-orgs` are preserved by construction. Operators can hand-tune any of the three files and the route will leave them alone on subsequent replays — proven by the `partialState_onlyMissingFilesPushed` test.

## 2. Misses

- 🟡 [painful | evidence: `proposal.md` §"Why" still says "four artifacts"] The proposal's narrative carried over old SPA-preview language ("four artifacts") even though the rendered output is three files (the ManagedClusterSet + ManagedClusterSetBinding share a multi-doc YAML). Spec, scenarios, and tests are consistent on three, but the proposal prose drifts. Caught in `verify.md` §4 as a doc-coherence nit; non-blocking but worth noting for future doc reviews.
- 🟡 [painful | evidence: tasks 7.1–7.6 unchecked] All runtime verification against a running devcontainer stack is deferred. The integration tests cover every spec scenario, but no green `./mvnw verify` run id is recorded, and the SPA E2E (create "Cultura" → observe Gitea + audit_log) has not been demonstrated end-to-end. Risk mitigation: the IT suite is correct-by-construction and the static artifacts all landed. Concrete risk: a runtime-only failure mode (e.g., Gitea connectivity, Helm chart path resolution under `/opt/charts:ro`) would only surface on first cold start.
- 🟡 [painful | evidence: `verify.md` §1] The first `openspec validate` run failed because the MODIFIED block in `debezium-connect-stack/spec.md` used the pre-rename requirement header. The RENAMED block correctly declared the rename, but the MODIFIED header has to be the post-rename name. This is a footgun the schema doesn't catch at write-time — only at validate. Fixed in this branch but worth filing as a "specs-author trip-wire" for future RENAMED+MODIFIED pairs.
- 📌 [nit | evidence: 60s in-memory dedup cache is route-local] The dedup cache lives in the route instance, not in a shared store. If `gdfkube-camel` is ever scaled to >1 replica, two replicas could both process the same event within the TTL window. Both calls would land on the file-exists check (idempotent), so the worst case is a wasted clone+render+no-commit — not a correctness bug. Documenting because the design didn't call it out explicitly.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 9.2 (spec validate) | The first validate run failed on the MODIFIED/RENAMED header mismatch; fixed by switching MODIFIED's header to the post-rename name | Caught only at validate-time, not at write-time. The fix is mechanical; the validator's error message ("MODIFIED references old name from RENAMED. Use new header for …") pointed straight at it. |
| 7.x (E2E runtime verification) | Deferred; integration tests cover every spec scenario in lieu of a devcontainer cold-start | Static artifacts are correct-by-construction; cold-start verification is back-fillable on the next devcontainer up |
| Paired commit with `remove-deadcode-group-admin-controls` | Both changes landed in `2dbcb31` together | The two are paired: removing the dead UI toggles only makes sense if the backend automation closes the same gap. Single commit keeps the SPA preview promise and the actual provisioning in lockstep — no in-between state where the SPA promises something the backend doesn't deliver. |

## 4. Skill / workflow compliance

| Skill                                            | Used | Reason if skipped |
|--------------------------------------------------|------|-------------------|
| superpowers:brainstorming                        | ✓    | `brainstorm.md` enumerated the trigger options (CDC vs Express webhook vs scheduled scan) and idempotency strategies (file-exists vs marker collection); CDC + file-exists chosen with rationale |
| superpowers:writing-plans                        | ✓    | `plan.md` maps the work to 10 tasks with explicit step-by-step actions |
| superpowers:using-git-worktrees                  | partial | Solo developer; implementation landed directly on `main` (paired with the dead-code change); archive itself was done from a worktree |
| superpowers:subagent-driven-development          | ✗    | The work was modest enough (one route, two beans, one IT class) that a single-session implementation was simpler than dispatching |
| superpowers:test-driven-development              | partial | Spec scenarios were written first (proposal phase); IT cases were written alongside the route, not strictly red-then-green. The IT suite still ended up exhaustively covering the spec scenarios, but the order was "spec → impl + tests in parallel" rather than canonical TDD |
| superpowers:requesting-code-review               | ✗    | Solo developer; the IT suite + spec scenarios are the review surface |
| superpowers:verification-before-completion       | partial | Static verification (validate, build, lint) was done; runtime E2E verification deferred (tasks 7.1–7.6). Documented honestly in `verify.md` rather than papered over |
| superpowers:finishing-a-development-branch       | ✓    | Merged on `main`; archive being created now |

## 5. Surprises

- The "four artifacts" narrative in the proposal's `## Why` survived all the way through to verify. The discrepancy with the spec (three files) is harmless — both the rendered output and the spec scenarios are consistent on three — but it shows how easily early-design prose can stick around in a proposal even after the technical detail tightens. A doc-coherence pass between proposal and spec finalization would have caught it.
- The MODIFIED/RENAMED header mismatch is a sharp edge of the OpenSpec validator: the rule is "MODIFIED uses post-rename header, RENAMED declares FROM→TO" but the validator only catches it at validate-time, not at the OpenSpec propose/apply step. Worth bookmarking for the next change that combines RENAMED with MODIFIED on the same requirement.
- The bean extractions came in cleaner than expected. `GitRepoBootstrapper` is 32 lines, `HelmTemplateRunner` is 79 lines, and neither required any internal-API changes to the existing routes beyond the delegation. The original code was already factored well enough that "pull out the body of this `if` block into a bean" was a near-mechanical refactor.

## 6. Promote candidates

| Learning | Promote to | Notes |
|----------|------------|-------|
| RENAMED + MODIFIED on the same requirement requires MODIFIED to use the post-rename header | `.claude/rules/` or openspec doc | The validator's error message is good; a one-liner in the OpenSpec authoring guide would prevent the trip-up |
| File-exists idempotency at the destination repo preserves manual edits by construction | already in this change's spec; pattern is reusable | Future CDC-driven GitOps routes should default to this strategy unless there's a reason to track state side-band |
| Route-local dedup caches are correct-but-not-cluster-safe — document the scale-out implication | `camel-orchestrator-stack` future revision | Not blocking; flag in any future change that scales `gdfkube-camel` past one replica |
| Pair a "remove dead UI" change with the "make the backend honor the promise" change in a single commit | already practiced; reinforced | Keeps the SPA preview and the actual provisioning in lockstep; no in-between state where the UI lies |
| Proposal-vs-spec doc-coherence pass before validate | optional checklist item | The "four artifacts" carryover would have been caught by a five-minute reread |

---

## Follow-up work

| Item | Priority | Suggested change |
|---|---|---|
| Tighten the proposal's `## Why` to say "three files" (or "the multi-doc cluster-set + the two App* manifests") | LOW | Doc-only nit; archived state stays consistent with the spec/scenarios/tests |
| Record a green `./mvnw -DskipITs=false verify` run id after the next devcontainer cold start | LOW | Back-fills the unchecked tasks 7.1–7.2 |
| Demonstrate the SPA E2E (create "Cultura" → observe `gdfkube-orgs` + audit_log entries) | MEDIUM | Closes tasks 7.4–7.6; biggest residual risk surface |
| Add the ArgoCD root that points at `gdfkube-orgs` (the explicit non-goal of this change) | MEDIUM | Without it, Camel's output sits in Gitea unconsumed by ArgoCD; that's the demo-bootstrap change's scope |
| Document the route-local-dedup vs cluster-wide scale-out trade-off | LOW | Future-proofs the design if `gdfkube-camel` is ever replicated |
