## Context

The ITSM admin Group pages (`GroupEditor.tsx` and `NewGroupPage.tsx`) render two controls — "ManagedClusterSet binding" and "Auto-provision repo + AppProject on save" — whose state is held only in component-local `useState`. These values are never dispatched to the React data context, never PATCHed/POSTed to the Express API, never stored on the `Group` document, and never present in the backend PATCH whitelist (`server/src/services/groupAdminService.ts`). The controls imply capabilities that do not exist anywhere downstream.

The agreed direction (decided in plan-mode session) is that ManagedClusterSet binding and per-org repo/AppProject provisioning become **automatic via Camel routes** on group create/update events from MongoDB Debezium. Until that automation lands, the manual UI is misleading.

The frontend currently in scope:
- `gdfkube-src/gdfkube-itsm/src/admin/GroupEditor.tsx` — per-group editor with 6 fields (4 real, 2 dead)
- `gdfkube-src/gdfkube-itsm/src/admin/NewGroupPage.tsx` — new-group form with 6 fields + a "Resources that will be created" preview
- Their tests under `src/admin/__tests__/`
- The capability spec at `openspec/specs/itsm-admin-users/spec.md`

The backend already does not accept the dead fields — `PATCH_WHITELIST` in `groupAdminService.ts` is `{name, fullName, users, forms, repo, clusters}` — so no server changes are needed.

## Goals / Non-Goals

**Goals:**
- Delete the two non-functional controls and their `useState` from both pages.
- Fix file-header comment drift in `GroupEditor.tsx` (it claims auto-suggest behavior that only exists in `NewGroupPage`).
- Keep the "Resources that will be created" preview block in `NewGroupPage.tsx`, but rewrite the binding line to reflect the new naming convention (`{id} → {id}` rather than `{selectedManagedClusterSet} → {id}`).
- Update tests to drop assertions on the removed controls and assert the new preview text.
- Update the `itsm-admin-users` spec to drop the field-list mentions and rewrite the "ManagedClusterSet seeded select" requirement.
- Capture the deferred Camel automation work as an empty openspec change scaffold so the design context is preserved for the follow-up change.

**Non-Goals:**
- Backend schema or Mongoose model changes (the dead fields were never persisted).
- Backend PATCH/POST whitelist changes (the dead fields were never accepted).
- Any Camel route, Debezium connector, or Helm chart wiring — the automation is a separate openspec change.
- Per-org repo bootstrapping or ArgoCD AppProject rendering in this change.
- Renaming or restructuring the `gdfkube-orgs` repo layout — that is part of the deferred Camel change.
- Frontend redesign of the Groups admin surface beyond removing the two dead controls.

## Decisions

**D1. Remove the controls outright; do not flag-gate them.**
The decision to replace manual controls with Camel automation is firm. A feature flag would just be debt — per CLAUDE.md, "no half-finished implementations". Reversibility is provided by git, not by dead UI.

**D2. Keep the "Resources that will be created" preview block.**
The preview describes what Camel will provision downstream, regardless of whether the user can pick the values. It still helps the admin reason about side effects of creating a group. We rewrite the binding line to `{id} → {id}` to match the post-cleanup naming convention.

**D3. Bare group-id naming for ManagedClusterSet, Binding, and AppProject.**
ClusterSet `metadata.name` = Binding `metadata.name` = AppProject `metadata.name` = `<group-id>`. Binding `metadata.namespace` = `<group-id>` (the AppProject namespace). The `-clusterset` suffix is a *file-naming-only* concern in the rendered repo to disambiguate from the AppProject manifest in the same folder — the in-cluster resource names stay bare. This decision is recorded here so the deferred Camel change inherits it.

**D4. Update the spec, do not delete the requirement entirely.**
The "ManagedClusterSet seeded select" requirement is rewritten — not deleted — so it captures the post-change behavior (no select, preview shows `{id} → {id}`). Deletion would lose the requirement that the preview block exists at all.

**D5. Defer Camel work via an empty openspec change scaffold.**
This change creates `openspec/changes/auto-provision-org-resources-from-group-events/` with proposal/design/tasks captured at scaffold-only level. No Camel/route/connector code lands in this change. Keeps the two changes independently reviewable and bisectable.

**D6. Frontend tests remain colocated under `src/admin/__tests__/`.**
We do not move tests or restructure the test layout — only update the assertions touching the removed controls.

## Risks / Trade-offs

[Brief gap where neither manual UI nor automation exists for ManagedClusterSet binding] → **Mitigation**: The manual UI never worked anyway; user-visible state is unchanged. The deferred Camel change is scaffolded as part of this change so the next step is queued.

[Spec test/preview coupling — the new `{id} → {id}` preview text is asserted in both spec.md and the Vitest test] → **Mitigation**: The new wording is the same in both. If the deferred Camel change ever decides on a different binding format, both the spec scenario and the test must be updated together — but that is the normal coupling for any user-visible string.

[File-header comment fix in `GroupEditor.tsx` is a behavior-adjacent doc change] → **Mitigation**: The comment is purely cosmetic and the test suite does not assert on it. Low risk.

[Risk that removing `MANAGED_CLUSTER_SETS` const removes a reference some other file imports] → **Mitigation**: It's not exported and is not referenced outside `NewGroupPage.tsx`. Verification step `grep -r MANAGED_CLUSTER_SETS gdfkube-src/gdfkube-itsm/src` will catch any escape.

## Migration Plan

1. Edit `GroupEditor.tsx`: remove dead `useState`, dead JSX, fix header comment.
2. Edit `NewGroupPage.tsx`: remove dead constant, dead `useState`, dead JSX, update preview binding line, fix header comment.
3. Update `GroupEditor.test.tsx` and `NewGroupPage.test.tsx`.
4. Update `openspec/specs/itsm-admin-users/spec.md`.
5. Create scaffold-only files at `openspec/changes/auto-provision-org-resources-from-group-events/`.
6. Run `npm test` in `gdfkube-itsm/` and `gdfkube-itsm/server/`.
7. Run `pre-commit run --all-files`.

**Rollback**: `git revert` the merge commit. No schema, no API contract, no data-shape change — purely additive frontend deletion.

## Open Questions

None — plan-mode session resolved naming, idempotency strategy, output repo, and scope boundaries.
