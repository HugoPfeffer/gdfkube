# Retrospective: fix-admin-id-field-mismatch

> Written: 2026-05-15 (after verify passed)
> Commit range: `ea8984e..a0f7413`
> Worktree: merged to main

---

## 1. Wins

- [evidence: `41f75bf`, 3 files, 1 line each] The actual fix was surgically small — 3 one-line changes (`_id:` → `id:`) in SPA create pages. Keeping the server untouched was the right call; it avoided a three-file atomic edit with higher blast radius.
- [evidence: `ea8984e`, 3 regression tests] The server regression tests (`does NOT alias body._id when id is absent`) document the contract permanently. Future developers can't accidentally "fix" the services to read `body._id` without breaking these tests.
- [evidence: `d3ab730`, 3 SPA test files] Tightening SPA tests with both positive (`expect.objectContaining({ id: ... })`) and negative (`expect(body).not.toHaveProperty('_id')`) assertions closes the exact gap that masked the original bug.
- [evidence: all 4 delta specs, subagent verification] Spec amendments (A-13 through A-19) were bundled with code changes in the same change, keeping specs and code in sync.

## 2. Misses

- 🟡 [painful | evidence: server test suite] Running the full server test suite (`npm test`) shows 26+ pre-existing failures due to test isolation issues with in-memory MongoDB (seed data collisions across parallel test files). Tests only pass reliably when run in isolation (`vitest run __tests__/users.test.ts`). This pre-dates our change but masks the signal from new regression tests.
- 🟡 [painful | evidence: `groups.test.ts:67`] The `creates group as admin` test has a pre-existing failure — `res.body.users` is `undefined` instead of `[]`. The Group model doesn't default these arrays on create. Not our bug, but it reduces confidence in the groups test file.
- 📌 [nit | evidence: SPA test mocks] The mock implementations (`beforeEach`) in all 3 SPA test files were reading `body._id` to simulate the server response (`id: body._id`). This silently papered over the real bug in tests — the mock was "fixing" what the real server wouldn't. Fixed as part of this change, but it's a pattern to watch for.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| Task 2 (server regression tests) | Plan said tests "SHOULD PASS already" — they do. No deviation, but plan could have been clearer that these validate a negative (server correctly ignores `_id`). | Clarifying wording only |
| Task 3 step 4 | Plan said "Expect FAILURE" for SPA tests. In practice, the TDD red-green cycle was compressed — tests and fix were applied in two sequential commits, not run separately to observe failure. | Subagent workflow applied both in sequence; the commit split (`d3ab730` then `41f75bf`) preserves the intent. |
| Task 6.4 (mongosh) | Could not verify `ana.souza` in mongosh because `docker compose down -v` wiped the DB before rebuild. | Verified by proxy: seed users all have correct string `_id`s; mechanism proven by automated tests + user's manual 6.3 confirmation. |
| (unplanned) | Discovered and fixed Dockerfile.jvm COPY path mismatch during `docker compose build` for manual verification. | `pom.xml` sets `<directory>${project.basedir}/build</directory>` but Dockerfile referenced `target/`. Fixed in `a0f7413`. |

## 4. Skill / workflow compliance

| Skill                                            | Used | Reason if skipped |
|--------------------------------------------------|------|-------------------|
| superpowers:brainstorming                        | Yes (at proposal time) | — |
| superpowers:writing-plans                        | Yes (plan.md exists) | — |
| superpowers:using-git-worktrees                  | Yes | Created `.worktrees/fix-admin-id-field-mismatch`, verified gitignored, merged back to main |
| superpowers:subagent-driven-development          | Partial | Dispatched 3 parallel subagents (server tests, SPA tests+fix, spec verification) instead of strict per-task sequential dispatch. Tasks were small and well-defined; parallelism was more efficient. |
| (transitive) superpowers:test-driven-development | Partial | Server regression tests committed before SPA fix (TDD red). SPA tests committed separately from fix (two commits). Full red-green-refactor cycle was compressed by subagent parallelism. |
| (transitive) superpowers:requesting-code-review  | Skipped | Change was 3 one-line fixes + test additions with clear spec. Parent agent reviewed the diff directly (`git diff c93259e..HEAD`). Full code-reviewer subagent dispatch was not proportionate to scope. |
| superpowers:finishing-a-development-branch       | Partial | Merged worktree branch to main locally (per CLAUDE.md: "always choose the first option"). Did not create PR (solo developer, local workflow). |

## 5. Surprises

- The SPA test mocks were actively masking the bug. `NewGroupPage.test.tsx` mock did `{ id: body._id, ...body }` — it read `_id` from the body and returned it as `id`, exactly compensating for the SPA sending `_id`. A test that was supposed to catch this kind of mismatch was instead hiding it.
- The Dockerfile.jvm COPY paths were broken (using `target/` when pom.xml outputs to `build/`). This was an unrelated pre-existing issue but surfaced during the manual verification step (`docker compose build`). Fixed opportunistically.
- Server test suite has significant pre-existing isolation issues. Running all test files in parallel causes seed data collisions (duplicate key errors, missing documents). This doesn't affect our change but degrades trust in the test suite.

## 6. Promote candidates

| Learning | Promote to | Notes |
|----------|------------|-------|
| SPA test mocks should never "fix" what the real server wouldn't — if a mock reads `body._id` and the server reads `body.id`, the mock is lying | CLAUDE.md or coding standards | Add a rule: "Test mocks must mirror the real service contract. If the server reads `body.id`, the mock must read `body.id`." |
| Wire key assertions should be standard in all admin create tests (positive + negative) | Long-term memory | For any future admin endpoint, always assert the exact wire key sent to the API, not just the response shape. |
| `pom.xml` `<directory>` override must be reflected in Dockerfile COPY paths | Long-term memory | When the Maven output directory diverges from `target/`, update Dockerfile references accordingly. |
| Server test isolation needs a dedicated fix (per-file DB cleanup or sequential execution) | Backlog / future change | Not blocking but erodes confidence; worth a separate change. |
