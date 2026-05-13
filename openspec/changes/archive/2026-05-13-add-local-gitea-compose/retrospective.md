# Retrospective: add-local-gitea-compose

> Written: 2026-05-13 (after verify passed)
> Commit range: `a70f08e..0400db7` (proposal `a70f08e`; landing `cf96a85`; hardening `08de29b`; cleanup `b7f383f`, `0400db7`)
> Worktree: merged to main

---

## 1. Wins

- [evidence: `cf96a85`] Four-sidecar split (gitea, bootstrap, repo-seed, token-sync) cleanly separated fast work (admin+token+org) from slow work (workspace mirror push). `gdfkube-itsm-api` boots as soon as a token exists; only `gdfkube-camel` waits on the repo push (which is the only consumer that actually needs it).
- [evidence: `bootstrap.sh`, `seed-repos.sh`, `sync-token.sh`] Token never on `argv`. Bootstrap logs only the byte-count, seed-repos uses `set +x` around the URL assembly, token-sync passes the value via env to `mongosh`. Pre-commit trufflehog stays clean.
- [evidence: `08de29b`] Sourcing the Gitea token from `gitea_settings` (instead of compose env) means rotation propagates without a Camel restart. The token-sync sidecar refreshes the singleton on every boot; Camel reads it on each request.
- [evidence: `gdfkube-camel` env overrides only, no source edits to `application.properties`] Quarkus env-var binding (`APP_SYSTEM_GITEA_EXTERNAL_URL` ↔ `app.system.gitea-external-url`) is the right level of indirection: no profile gymnastics, no source duplication.
- [evidence: `seed-collections.js` untouched + `sync-token.sh` using `$set`] The `$setOnInsert` (seed) + `$set` (token-sync) coexistence on the same `_id="gitea"` doc means the two writers do not fight each other — exactly the cooperation contract specified in D5.

## 2. Misses

- 🔴 [blocking | evidence: `08de29b` followed `cf96a85` to fix it] The end-to-end pipeline was *not* working on the first compose-up after `cf96a85`. Camel failed at startup on `direct:` route registration because `camel-quarkus-direct` was missing from `pom.xml`. The failure mode was silent — the ITSM request `01KREXSW4NY1G7NQMTRPCNVEQJ` sat in `dbz.gdfkube.requests` and only a `No endpoint could be found for: direct://git-push` log line in `gdfkube-camel` revealed it. The fix landed in `08de29b`; the regression-prevention work is captured in `harden-camel-build-verification`.
- 🟡 [painful | evidence: `08de29b` bootstrap.sh diff] `bootstrap.sh` initially leaked the admin password via `curl -u`. Hardened in `08de29b` (stops leaking the password). The narrow logging contract in D4 (token byte-count only) was honored for the *token*; the password slipped through under a different code path.
- 🟡 [painful | evidence: `tasks.md` 6.x and 7.x left unchecked] The smoke walkthrough and idempotency re-run checkboxes were not back-filled even after the pipeline was verified working. The verified state had to be reconstructed from commit history for this retrospective. Lesson: when verification happens informally during follow-up commits, still walk back and check the `tasks.md` boxes.
- 📌 [nit | evidence: `b7f383f`] Compose YAML arrays were initially formatted inconsistently; cleaned up later. Cosmetic, but a follow-up commit could have been avoided with a `prettier`/`yamlfmt` pass during the initial landing.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 6.x smoke walkthrough | Performed informally during `08de29b` end-to-end pipeline restoration | The walkthrough required the `camel-quarkus-direct` hotfix to land first; once both were in place, the live smoke succeeded but the checkboxes were never back-filled |
| 7.x idempotency re-run | Performed implicitly during subsequent compose-up cycles | Multiple `down -v && up -d` cycles during the Camel hardening work exercised idempotency; not back-filled in `tasks.md` |
| 8.x openspec verify/retrospective | Completed by this archival pass | Authoring was queued for the archive step rather than blocking the working pipeline |

## 4. Skill / workflow compliance

| Skill                                            | Used | Reason if skipped |
|--------------------------------------------------|------|-------------------|
| superpowers:brainstorming                        | ✓    | `brainstorm.md` resolved the four-sidecar-split, SQLite-vs-Postgres, force-push-vs-merge, and env-overrides-vs-profile decisions |
| superpowers:writing-plans                        | ✓    | `plan.md` enumerated 8 task groups with file-level granularity |
| superpowers:using-git-worktrees                  | ✗    | Solo developer; landed on a working branch |
| superpowers:subagent-driven-development          | partial | Implementation by hand + Cursor |
| (transitive) superpowers:test-driven-development | ✗    | The change is shell-scripts + compose YAML; behavior is upstream-tested. The Camel pipeline downstream of it is what should have had earlier integration coverage — captured by `harden-camel-build-verification` |
| (transitive) superpowers:requesting-code-review  | ✗    | No formal review; the runtime regression (missing `camel-quarkus-direct`) was caught only by the failing user flow |
| superpowers:finishing-a-development-branch       | partial | Merged on `main` ahead of `harden-camel-build-verification` archive |

## 5. Surprises

- The full-classpath / production-classpath asymmetry of Quarkus tests was not visible to the local stack until the actual stuck request appeared. The Camel JAR built, the image started, the health endpoint may have even returned UP, but the `direct:` route consumer was missing. The next change (`harden-camel-build-verification`) was created specifically to close that detection gap with `@QuarkusIntegrationTest` + module-scoped CI.
- Forced workspace-mirror push was fast enough on local loopback that pruning `node_modules` and `target` was effectively the only practical concern. Initial worry about push duration didn't materialise; the prune list was sufficient.

## 6. Promote candidates

| Learning | Promote to | Notes |
|----------|------------|-------|
| Init sidecars: byte-count logs only for secrets, env (not argv) for downstream consumers, `set +x` around URL assembly | already documented in `gitea-stack/spec.md`; consider promoting to `.claude/rules/` | Reusable across any future image-bootstrap script that touches PATs or other credentials |
| Per-boot PAT rotation works when consumers read from a Mongo singleton | already in design; reinforced | The token-sync sidecar pattern is reusable for other long-lived credentials (e.g., future S3, Slack, GitHub apps) |
| `$setOnInsert` (seed) + `$set` (runtime) coexistence on a singleton | already in design; reinforced | Pattern of "the seed sets defaults that runtime overrides" is reusable for any settings-style doc |
| `@QuarkusIntegrationTest` smoke is the missing gate for Quarkus apps | promoted to `harden-camel-build-verification` | The class of "works in test, fails in packaged artifact" bug is the broader lesson; the IT smoke is the cure |
| Back-fill `tasks.md` checkboxes even when verification happens via follow-up commits | CLAUDE.md / `.claude/rules/` candidate | "If verification happens off-task, walk back and check the boxes. Reconstructing the verified state from git history is more expensive than the 30-second back-fill." |

---

## Follow-up work

| Item | Priority | Suggested change |
|---|---|---|
| Production Gitea (RHACM/ArgoCD) | future | Out of scope; explicit non-goal |
| SSH-based clones | future | HTTP+token is sufficient for Camel/CLI/CI |
| TLS for local Gitea | LOW | HTTP-on-loopback acceptable for dev |
| Pre-seed per-org `gdfkube/gdfkube-<org>` repos | LOW | `RepoBootstrapRoute` creates them on demand; explicit non-goal |
