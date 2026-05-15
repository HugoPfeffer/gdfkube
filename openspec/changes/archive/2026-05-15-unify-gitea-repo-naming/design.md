## Context

The Camel orchestrator has two routes that target the per-org Gitea repo:

- `RepoBootstrapRoute` (handles direct request-driven repo bootstrap) composes the name as `giteaOwner + "-" + org`.
- `OrgBootstrapRoute` (handles `dbz.gdfkube.groups` events) composes the name as `"gdfkube-" + groupId`, with a `node.path("repo")` override read from the group document.

The ArgoCD `applicationset.yaml` in `gdfkube-src/gdfkube-infra/charts/infra/argocd-org` hardcodes `gdfkube-{{ .Values.meta.org }}.git`. So `OrgBootstrapRoute` and ArgoCD agree on a canonical form (`gdfkube-<groupId>`), while `RepoBootstrapRoute` diverges. The two compositions match only as long as `giteaOwner == "gdfkube"` — the demo default. A non-default owner produces a split-brain where Camel writes to `<owner>-<group>.git` but ArgoCD reads from `gdfkube-<group>.git`.

Separately, `HelmValuesBuilder.buildForOrg(String groupId, String groupRepo)` takes a `groupRepo` argument that the body never uses (M-1, dead parameter).

Stakeholder context: solo developer + future demo operators. Source of truth for the decision: `tmp/unified-audit-findings.md` (C-1 "Critical" + M-1 "Critical").

## Goals / Non-Goals

**Goals:**
- One canonical form for the per-org Gitea repo name: `gdfkube-<groupId>`.
- A single helper method (`HelmValuesBuilder.getRepoName(String groupId)`) that both routes call.
- Drop the dead `groupRepo` parameter from `HelmValuesBuilder.buildForOrg`.
- Keep the audit-log `repo` field byte-identical for the demo (`giteaOwner == "gdfkube"`).
- Zero chart edits, zero doc edits — the existing manifests and specs already match the canonical form.

**Non-Goals:**
- Renaming existing Gitea repos in flight (operational, separate runbook — and a no-op for the demo).
- Making the `gdfkube-` prefix configurable (rejected — brand constant per C-1).
- Touching the central `gdfkube-orgs` repo (single tenant-agnostic repo, no naming question).
- Removing the `node.path("repo")` read from the group document (folded into the separate `harden-org-bootstrap-route` change to keep that route refactor contained).
- Refactoring `HelmValuesBuilder` into smaller beans.

## Decisions

### D1. Canonical form is `gdfkube-<groupId>`

**Decision:** Standardize on `"gdfkube-" + groupId`. The `gdfkube-` prefix is a brand constant for the demo, not derived from `giteaOwner`.

**Alternatives considered:**
- `<giteaOwner>-<groupId>` — would require editing `applicationset.yaml` AND silently re-targets every running ArgoCD source if the owner ever changes.
- Configurable prefix (e.g. `gdfkube.repo.prefix`) — adds a knob no caller asks for and spreads the source of truth across config + helper + chart.

**Why this wins:** ArgoCD and `OrgBootstrapRoute` already produce this form. The diverging side is `RepoBootstrapRoute` — the single route that flips. Zero chart edits, zero risk of silently re-targeting running ArgoCD sources.

### D2. Helper lives on `HelmValuesBuilder`

**Decision:** Add `public String getRepoName(String groupId) { return "gdfkube-" + groupId; }` to `gov.gdf.camel.bean.HelmValuesBuilder`.

**Alternatives considered:**
- A new dedicated `RepoNameComposer` bean — over-engineering for a one-liner.
- A static utility class — Camel routes already inject `HelmValuesBuilder`; making the method static would mean two injection patterns for the same bean.

**Why this wins:** `HelmValuesBuilder` already holds the other naming utilities. Routes already inject it. Adding a method is the smallest, most discoverable move. If a future requirement makes the prefix owner-derived or configurable, the helper is the single point of change.

### D3. Drop `groupRepo` from `buildForOrg`

**Decision:** Change `buildForOrg(String groupId, String groupRepo)` → `buildForOrg(String groupId)`. The parameter is unused inside the method body (verified at line 68 of `HelmValuesBuilder.java`).

**Alternatives considered:**
- Leave the dead parameter in place — preserves the call signature but propagates the dead-code smell and forces callers to keep computing a value that's thrown away.
- Replace `groupRepo` with a call to `getRepoName(groupId)` internally — still leaves callers passing a redundant arg.

**Why this wins:** Folding M-1 into this change is cheap (same files, same tests) and the alternative leaves an obvious smell on the same lines we're already editing.

### D4. Audit-log composition goes through the helper too

**Decision:** Replace `Map.of("repo", giteaOwner + "/gdfkube-" + groupId)` in `OrgBootstrapRoute` with `Map.of("repo", giteaOwner + "/" + helmValuesBuilder.getRepoName(groupId))`.

**Alternatives considered:**
- Leave the audit composition inline — preserves byte-identical demo behavior but reintroduces the duplicated literal we just removed.

**Why this wins:** Single source of truth. Audit consumers see the same string in the demo (`gdfkube/gdfkube-<group>`), and any future change to the canonical form propagates automatically.

## Risks / Trade-offs

- **The diff is silent in the demo.** Because `giteaOwner == "gdfkube"`, the produced repo names are identical before and after the change. → Mitigation: integration test asserts both routes call `gitRepoBootstrapper.ensure(giteaOwner, "gdfkube-<org>", ...)` for the same `<org>`, exercised with `giteaOwner != "gdfkube"` to make the unification observable.

- **Behavior change for in-flight non-default owners.** If anyone is currently running with a non-`gdfkube` owner, their existing repos are named `<owner>-<group>` and this change starts writing to `gdfkube-<group>` — a silent re-target. → Mitigation: this is the bug the change exists to fix; the demo is the only known deployment and uses the default owner. Document the operational caveat in the proposal so it's not surprising; defer in-flight repo renames to a separate runbook.

- **Cross-change conflict.** `harden-org-bootstrap-route` also edits `OrgBootstrapRoute.processGroupEvent`. → Mitigation: this change is declared as a blocker for that one. Sequence this change first.

- **Helper visibility.** `getRepoName` is a public method on a CDI bean. It's intentionally minimal (one line). → Trade-off accepted: the bean already has other public helpers; the cost of a one-line method is lower than the cost of a new class.

## Migration Plan

1. Land this change in a single commit on `main` (no feature flag — the diff is byte-identical in the demo).
2. Verify `./mvnw -pl gdfkube-src/gdfkube-camel test` green on the merge commit.
3. No runtime migration needed: no schema change, no Kafka rebalance, no chart re-render, no Gitea repo renames. The existing `gdfkube-<group>.git` repos remain authoritative.
4. Rollback: revert the commit. No data migration to unwind.

## Open Questions

- None. C-1 + M-1 decisions in `tmp/unified-audit-findings.md` and the source plan resolve every open point.
