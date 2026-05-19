# Retrospective: deploy-platform-to-openshift-argocd

> Written: 2026-05-19 (after verify passed — ⚠️ PASS WITH WARNINGS, no blocking ❌)
> Commit range: `dfecf09..72c3a5f` (19 implementation commits)
> Worktree: `/workspace/.claude/worktrees/openshift-argocd-bootstrap-plan` (branch `worktree-openshift-argocd-bootstrap-plan`, not yet merged to `main-openshift`)

---

## 1. Wins

- [evidence: `40f650e`] One-command app-of-apps entrypoint delivered — `platform/app-of-apps.yaml` (single `oc apply`) plus the full `platform/` tree realizes the "Single-command app-of-apps bootstrap" requirement.
- [evidence: `gdfkube-src/gdfkube-infra/argocd/discovery/org-repos-discovery.yaml` unchanged; `git log` touches only `platform/**` + `Dockerfile.jvm`] Tenant-provisioning two-layer model preserved exactly — only `gitea-seed-job.yaml` clones `gdfkube-src` into in-cluster Gitea (spec "Tenant-provisioning layer preserved").
- [evidence: `platform/manifests/mongo`, `platform/manifests/kafka`] Compose-faithful topology kept — 3 single-replica StatefulSets each for mongo/kafka with per-instance Services, so `init-rs.js` / KRaft quorum DNS needed zero script edits (design D2).
- [evidence: verify.md §2 — `pre-commit run --all-files` → TruffleHog **Passed**] Secret handling met the no-plaintext bar; demo defaults carry `# trufflehog:ignore`, runtime tokens go to Secrets (design D7, spec "Secret handling without committed plaintext").
- [evidence: `7de6c34`,`7f90154`,`78c4df7`,`b7946dd`,`d17bb66` … 12 focused fix commits] OpenShift-runtime hardening was done as small, single-concern, imperative-message commits — consistent with CLAUDE.md simplicity/maintainability values; each commit isolates one failure mode.
- [evidence: `openspec validate deploy-platform-to-openshift-argocd` → valid] All 8 artifacts structurally valid; spec/design/proposal coherence spot-check (verify.md §4) found no requirement-level drift.

## 2. Misses

- 🔴 [blocking | evidence: `3048d7e`; `platform/app-of-apps.yaml:14`, `platform/values.yaml:3`, `platform/manifests/apps/camel.yaml:26`] `targetRevision` points at `worktree-openshift-argocd-bootstrap-plan`, not `main-openshift` as the spec scenario "Entrypoint targets the GitHub repo and branch" requires. Deliberate dev-time retarget for live ArgoCD iteration, but it **must be reverted and the branch merged to `main-openshift` before any real bootstrap**, or the clean-cluster single-apply scenario fails. (Does not block the OpenSpec archive; blocks deploy. Tied to open tasks 9.2/9.3.)
- 🟡 [painful | evidence: `6b7cd20` "convert to Helm chart for RHDP compatibility"; `platform/Chart.yaml`,`templates/`] Mid-stream rearchitecture from kustomize bases (as written in plan.md / design D5 / spec "Zero-drift init assets") to a Helm chart. The mechanism in design.md and the spec text still say "kustomize `configMapGenerator`" while the implementation uses Helm templates + `manifests/init-jobs/configmaps.yaml`. The *intent* (zero-drift init assets) holds, but the documented mechanism is now stale — spec/design were not updated to match the Helm reality.
- 🟡 [painful | evidence: verify.md §2 — tasks 6.1, 9.3–9.7] Six verification tasks need a live cluster and cannot be closed in this environment; end-to-end confidence (operator CSV, builds Complete, functional endpoints, idempotency, two-layer reconciliation) is deferred to operator-run deploy time.
- 📌 [nit | evidence: `git status` → ` M .mcp.json`] `.mcp.json` carried an unrelated uncommitted modification through the whole effort — harmless but noise; not part of this change.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 1.1–1.5 (kustomize bases / app-of-apps) | Whole tree converted to a Helm chart (`Chart.yaml`/`values.yaml`/`templates/`) | RHDP/RHPDS catalog deploy requires Helm packaging (`6b7cd20`) |
| 1.3 (`targetRevision: main-openshift`) | Set to the worktree branch in app-of-apps/values/camel | ArgoCD had to pull the in-progress branch for live iteration (`3048d7e`) — pre-deploy revert owed |
| 5.x init Jobs via configMapGenerator | Static `manifests/init-jobs/configmaps.yaml` rendered through Helm | Side effect of the Helm conversion |
| 5.2 / 6.x sync-wave ordering | Gitea bootstrap/seed/token-sync became ArgoCD **PostSync hooks** | Sync-waves alone didn't gate correctly (`a358fe3`) |
| 6.2 Gitea operator Subscription | Iterated: installer RBAC ordering (`c30de00`), HTTPS install not git-remote kustomize (`9309dc2`), CRD-name poll fix (`72c3a5f`) | Operator install mechanics were more involved than the plan assumed |
| 4.2 Kafka StatefulSets | Added not-ready address publication + log-dir `subPath` | KRaft quorum bootstrap (`78c4df7`) and PVC `lost+found` (`b7946dd`) |

## 4. Skill / workflow compliance

| Skill                                            | Used | Reason if skipped |
|--------------------------------------------------|------|-------------------|
| superpowers:brainstorming                        | Yes  | `brainstorm.md` produced from a validated session |
| superpowers:writing-plans                        | Yes  | `plan.md` (micro-task plan) produced |
| superpowers:using-git-worktrees                  | Yes  | Work isolated in `.claude/worktrees/openshift-argocd-bootstrap-plan` |
| superpowers:subagent-driven-development          | Partial | Infra/YAML change; 19 direct commits — per-task subagent loop not evidenced in history |
| (transitive) superpowers:test-driven-development | Skipped | Infra-only (manifests); no unit/contract surface — proposal explicitly states unit/contract tests do not apply. Static gates (`kustomize build`, `oc apply --dry-run`, `pre-commit`) used as the test analogue |
| (transitive) superpowers:requesting-code-review  | Not evidenced | No code-review subagent dispatch visible in the commit log |
| superpowers:finishing-a-development-branch       | Pending | Owed: revert `targetRevision`, merge branch to `main-openshift`, push (open task 9.2) |

## 5. Surprises

- OpenShift `restricted-v2` SCC friction was far deeper than the design anticipated: needed `HOME=/tmp`, explicit `securityContext`, `fsGroup`, BusyBox-compatible `wget`, and a `subPath` mount to dodge `lost+found` at a PVC root. ~12 of 19 commits were runtime adaptation, not the core compose→OpenShift translation.
- KRaft refused to form quorum until the broker Services published **not-ready** addresses (`78c4df7`) — non-obvious and not in the plan.
- Gitea operator install was a chicken-and-egg: installer RBAC must precede the operator-install hook, install must be over HTTPS (not a git-backed remote kustomize), and the poll loop watched the wrong CRD name (`c30de00`/`9309dc2`/`72c3a5f`).
- RHDP catalog compatibility forced a kustomize→Helm rearchitecture mid-stream (`6b7cd20`) — neither brainstorm nor design considered the packaging target; design D5 assumed kustomize.

## 6. Promote candidates

| Learning | Promote to | Notes |
|----------|------------|-------|
| OpenShift `restricted-v2` SCC checklist: `HOME=/tmp`, explicit `securityContext`/`fsGroup`, BusyBox `wget`, PVC-root `subPath` to skip `lost+found`, no root-owned mount | long-term memory | Recurred across init-jobs, kafka, sonar; reusable for any future compose→OpenShift work |
| App-of-apps `targetRevision` must be reverted from the dev/worktree branch to the release branch (and merged) as part of finishing-a-development-branch | CLAUDE.md / schema "finishing" checklist | Caused the one blocking miss this change |
| Decide kustomize vs Helm up front when RHDP/RHPDS is a deploy target | design template / schema design rule | A mid-stream pivot rewrote the whole tree |
| Gitea operator install ordering (installer RBAC → HTTPS install → correct CRD-name poll) | long-term memory / reference | Non-obvious; cost 3 fix commits |
