# Retrospective: add-demo-argocd-instance

> Written: 2026-05-21 (after verify passed with warnings)
> Commit range: `e63db76..2bfb0dd` (2 commits on `worktree-wire-demo-argocd-plan`)
> Worktree: `/workspace/.claude/worktrees/wire-demo-argocd-plan` (not yet merged)

---

## 1. Wins

- [evidence: commit `e63db76` `feat(argocd): add gdfkube-gitops demo ArgoCD instance and per-group AppProjects`, 9 manifests under `platform/manifests/argocd-demo/` + 1 new platform template + 2 chart edits + 1 deletion] Source-side implementation landed in a single coherent commit, exactly mirroring the plan's task groups 1–5; no half-finished files.
- [evidence: `helm template platform … | yq '.metadata.name == "gdfkube-argocd-demo"'` shows correct sync-wave `-8`, source path, and `automated` syncPolicy] Reuse of existing `_helpers.tpl` (`gdfkube-platform.source`, `gdfkube-platform.syncPolicy`) kept the new `templates/03-argocd-demo.yaml` to 19 lines with zero new helpers — followed the CLAUDE.md "prefer modifying existing functions/services over creating new ones" guideline.
- [evidence: `kubectl kustomize platform/manifests/argocd-demo` exits 0 and renders 4 documents whose Kinds are exactly `ApplicationSet, ArgoCD, ClusterRoleBinding, Namespace`] Bundle is self-contained and works without Helm dependencies — keeps the demo ArgoCD install completely declarative.
- [evidence: `docs/09-argocd.md:9-10` adds backlinks to both `argocd-org-stack` and `argocd-demo-instance`; embedded YAML samples now show `namespace: gdfkube-gitops` and the automated `syncPolicy`] Documentation was reconciled in the same commit as the manifests, so docs do not drift from code.
- [evidence: `openspec validate add-demo-argocd-instance --json` → `failed=0` both before and after the corrective commit] Spec deltas (RENAMED + REMOVED + MODIFIED + ADDED) shape was right on first try and survived a mid-change rewrite of one Requirement.

## 2. Misses

- 🔴 [blocking | evidence: original `platform/manifests/argocd-demo/repo-secret.yaml` shipped only a `url:` field with no `username`/`password`; `gitea-token-sync-job.yaml` was not extended as plan Task 4 Step 3 required] The first implementation pass shipped a no-op repository Secret. ArgoCD treats a `repo-creds` Secret with no creds as inert; the implementation worked only because `gitea-bootstrap-job.yaml:35` creates the `gdfkube` org with `visibility:"public"`. The Secret would have been actively misleading to a future operator reading the bundle. Fixed in `2bfb0dd` by deleting the Secret, removing it from `kustomization.yaml`, and rewriting the spec Requirement from "ships a Secret" to "reads anonymously" with a SHALL-revisit clause.
- 🟡 [painful | evidence: `tasks.md` lines 44–57 still show 8 unchecked tasks (groups 7–9) after implementation] The cluster-side verification tasks (7.1–7.3, 8.1–8.4, 9.1) require a live OpenShift cluster which was not available in this session. They were left unchecked rather than mass-marked. `verify.md` section 2 explains this is non-blocking but it makes the tasks.md skim ambiguous about completion state. Could be improved by future plans splitting "source-side" vs "cluster-side" task groups in `tasks.md` so the source-side counter goes to 100%.
- 📌 [nit | evidence: `argocd.yaml` sets `sourceNamespaces: ["gdfkube-gitops"]` — the ArgoCD CR's own namespace] `sourceNamespaces` enables apps-in-any-namespace for *additional* namespaces beyond the ArgoCD's home namespace; listing only the home namespace is a no-op. Leaving it for now since it documents intent, but a future cleanup could drop the field.
- 📌 [nit | evidence: ArgoCD CR has `controller: {}`, `repo: {}`, `applicationSet: {}`, `redis: {}` — empty maps] Empty maps mean "use operator defaults"; they're slightly noisy. Could be removed once the operator-version assumption is locked in.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| Plan Task 4 (Gitea repo-creds Secret) | First implementation shipped an empty `url:`-only Secret; corrective commit removed it entirely. Plan + tasks.md + spec were rewritten to "no Secret needed" | Original plan assumed token-gated repos and a copy job from `gitea-pat`; verification revealed the `gdfkube` Gitea org is created with `visibility:"public"` and `GiteaGitProvider.createRepo` never sets `private`, so anonymous reads suffice. Simpler and more truthful than shipping a no-op Secret. |
| tasks.md Task 1.5 | Originally "Add repo-secret.yaml … (no literal token)"; now "No Gitea repository Secret is needed" | Same root cause. |
| `specs/argocd-demo-instance/spec.md` | Original Requirement "Demo ArgoCD has Gitea repository credentials" (MUST ship a Secret) → rewritten to "Demo ArgoCD reads Gitea repos anonymously" (MUST NOT ship a Secret) | Same root cause; spec follows the implementation reality and adds an explicit revisit clause if Gitea org ever flips private. |
| Tasks 7–9 (cluster smoke) | Left unchecked, not skipped | No live cluster in this session; deferred to operator smoke pass on next bootstrap. Documented in `verify.md` §2. |
| Tasks 10.1–10.2 (commit) | Marked `[x]` post-hoc after the commit landed | The plan put the commit step inside the task list, but the apply-phase agent committed before marking tasks done; bookkeeping caught up during verify. |

## 4. Skill / workflow compliance

| Skill                                            | Used | Reason if skipped |
|--------------------------------------------------|------|-------------------|
| superpowers:brainstorming                        | No   | Decisions were collected interactively via `AskUserQuestion` during the original plan-mode session; `brainstorm.md` written directly from those answers using the template. Approach was acceptable per the OpenSpec instruction's manual-fallback path. |
| superpowers:writing-plans                        | Yes  | Invoked at the start of the plan-mode session that produced `.claude/plans/we-need-to-wire-sunny-koala.md` and later the OpenSpec `plan.md`. |
| superpowers:using-git-worktrees                  | Yes (implicit) | The session ran inside `wire-demo-argocd-plan` worktree from the start; entered via `EnterWorktree` after the bg-isolation guard fired. |
| superpowers:subagent-driven-development          | No   | Apply phase was driven by an external coding agent (per the user's framing "It was done through another coding agent"). The current session verified the work but did not re-implement tasks subagent-style. |
| (transitive) superpowers:test-driven-development | No   | Manifest-only change; no executable tests. `helm template` / `kubectl kustomize` renders + `openspec validate` served as the assertion layer. |
| (transitive) superpowers:requesting-code-review  | No   | User requested a "deep verification" instead of formal code review; verification was performed against the spec, design, and tasks. |
| superpowers:verification-before-completion       | Yes  | Invoked when the user asked for deep verification; drove the audit that surfaced the repo-Secret defect. |
| superpowers:finishing-a-development-branch       | No (yet) | Will fire when the user merges this branch; out of scope for the archive step. |

## 5. Surprises

- The `gdfkube` Gitea org's visibility was already `public` in `gitea-bootstrap-job.yaml` — the design.md "Open Questions" item assumed this was uncertain. A 5-line check of the bootstrap job would have closed the question during planning instead of producing a misleading Secret in the first implementation pass.
- The OpenShift GitOps operator's per-CR ServiceAccount naming (`<argocd-name>-argocd-application-controller`) was correctly predicted by the plan and matches the rendered ClusterRoleBinding exactly — no surprises there.
- `openspec validate --all --json` surfaced 17 pre-existing failures in unrelated capability specs (missing `## Purpose` section). They are not regressions from this change; they look like leftover formatting tech debt from older changes that pre-date OpenSpec's stricter spec linter. Recorded in `verify.md` §1 as a follow-up cleanup candidate.

## 6. Promote candidates

| Learning | Promote to | Notes |
|----------|------------|-------|
| Before shipping a repo-creds Secret, verify the source repo's visibility — empty creds are misleading, not safe defaults | `.claude/rules/` or CLAUDE.md "Coding Standards" | One-line rule: "Never ship an ArgoCD repo-creds Secret with empty username/password; resolve repo visibility first." |
| Plans that include both source-side and live-cluster verification tasks should split them into two top-level groups so completion state is unambiguous | OpenSpec `tasks` schema template / writing-plans skill | The current convention bundles them; a separator like `## Cluster Verification (manual)` would let the source-side checkbox count tell the truth at archive time. |
| Repo-wide `openspec validate --all` failing on pre-existing specs creates noise during change verification | New cleanup change: "add Purpose sections to legacy specs" | 17 specs need `## Purpose` headers; one clean-up change covers them all. |
| When the demo Gitea org is public-read, ArgoCD needs no repo Secret at all | docs/09-argocd.md "Decisions Resolved" section | Already noted in commit `2bfb0dd` and reflected in the spec's "Demo ArgoCD reads Gitea repos anonymously" Requirement. |
