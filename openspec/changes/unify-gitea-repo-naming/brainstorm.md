## Design Summary

Unify the per-org Gitea repo-name composition across Camel routes by introducing a single canonical helper, `HelmValuesBuilder.getRepoName(groupId)`, that returns `gdfkube-<groupId>`. Both `RepoBootstrapRoute` and `OrgBootstrapRoute` consume the helper; the dead `groupRepo` parameter is dropped from `HelmValuesBuilder.buildForOrg`.

Today, `RepoBootstrapRoute` composes `giteaOwner + "-" + org` while `OrgBootstrapRoute` (and the ArgoCD `applicationset.yaml`) uses `"gdfkube-" + groupId`. These agree only as long as `giteaOwner == "gdfkube"` — the first non-default owner produces a split-brain where ArgoCD points at one repo and the route writes to another. Centralizing the rule in one helper kills the drift and gives a single point of change if the convention ever evolves.

## Alternatives Considered

### Option A: Canonical `gdfkube-<groupId>` via shared helper (CHOSEN)
- **Approach**: Add `HelmValuesBuilder.getRepoName(groupId)` returning `"gdfkube-" + groupId`. Flip `RepoBootstrapRoute` to call it; replace inline `"gdfkube-" + groupId` in `OrgBootstrapRoute` with the helper. Drop the unused `groupRepo` arg from `buildForOrg`.
- **Pros**:
  - ArgoCD `applicationset.yaml` already hardcodes `gdfkube-{{ .Values.meta.org }}.git` — zero chart edits.
  - Docs/specs already use `gdfkube-{groupId}` — zero spec edits.
  - Single point of change if the convention later becomes owner-derived.
  - Folds in M-1 (dead `groupRepo` parameter) cheaply on the same edit.
- **Cons**:
  - The diff is silent for the demo (since `giteaOwner == "gdfkube"`), so the fix is only observable under a non-default owner.

### Option B: Standardize on `<giteaOwner>-<groupId>` (REJECTED)
- **Approach**: Flip `OrgBootstrapRoute` and the ArgoCD `applicationset.yaml` to compose the repo name from `giteaOwner`.
- **Pros**:
  - Owner-derived names are conceptually tidy.
- **Cons**:
  - Requires editing `applicationset.yaml` (chart change).
  - Would silently re-target every running ArgoCD source if the owner ever changes.
  - `gdfkube` is a brand constant for the demo, not an owner-derived value — coupling them is wrong-modeling.
- **Why not chosen**: Bigger blast radius, worse failure mode, contradicts the brand-constant intent.

### Option C: Make the `gdfkube-` prefix configurable (REJECTED)
- **Approach**: Externalize the prefix into Quarkus config (e.g. `gdfkube.repo.prefix`).
- **Pros**:
  - Maximum flexibility.
- **Cons**:
  - Adds a knob no caller asks for.
  - Spreads the source of truth across config + helper + chart values.
  - Violates the project's "prefer modifying existing functions/services" and "no cleverness for its own sake" stance.
- **Why not chosen**: YAGNI; the helper is already the single point of change for a future requirement.

## Agreed Approach

**Option A.** A single helper method on `HelmValuesBuilder` is the cheapest move that eliminates the drift, preserves the existing ArgoCD wiring, and stays within the project's "modify existing services" principle. The `gdfkube-` prefix is treated as a brand constant; the helper is where it lives.

## Key Decisions

- **Canonical repo name**: `gdfkube-<groupId>` (matches `OrgBootstrapRoute` and `applicationset.yaml`).
- **Helper location**: `HelmValuesBuilder.getRepoName(String groupId)` — sits with the other naming utilities.
- **No `giteaOwner` in the helper**: the `gdfkube-` prefix is a brand constant per C-1, not an owner-derived value.
- **Fold in M-1**: drop `groupRepo` from `HelmValuesBuilder.buildForOrg(String groupId, String groupRepo)` → `buildForOrg(String groupId)` since the parameter is unused.
- **No chart edits**: `applicationset.yaml` already matches the canonical form.
- **No spec/doc edits**: existing specs already use `gdfkube-{groupId}`.
- **Out of scope here**: dropping the `node.path("repo")` read in `OrgBootstrapRoute.processGroupEvent` — folded into the separate `harden-org-bootstrap-route` change so the route refactor stays in one place. This change blocks that one.

## Open Questions

- None. The unified-audit-findings decision log (C-1, M-1) and the plan resolve all open points.
