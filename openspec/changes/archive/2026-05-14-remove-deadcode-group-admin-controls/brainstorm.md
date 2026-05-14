## Design Summary

Remove the two non-functional UI controls — "ManagedClusterSet binding" and "Auto-provision repo + AppProject on save" — from `GroupEditor.tsx` and `NewGroupPage.tsx`. Their state is held only in component-local `useState`, never dispatched, never sent to the backend, and the corresponding columns do not exist on the `Group` type, the Mongoose schema, or the PATCH whitelist. They imply capability that does not exist.

The intent is that ManagedClusterSet binding and per-org repo/AppProject provisioning become **automatic via Camel routes** (idempotent on group create/update). This change covers only the **frontend half**: removing the dead controls, aligning the tests, and updating the spec. A separate openspec change scaffold is created to capture the deferred Camel automation work.

## Alternatives Considered

### Option A: Remove the controls now, capture Camel work as a separate openspec change scaffold (chosen)
- **Approach**: Delete dead `useState` + JSX from both pages, fix file-header comments, update tests and spec text to drop the removed UI surface, and create an empty openspec change scaffold for the deferred Camel work that captures the design decisions already agreed (resource naming, idempotency strategy, output repo).
- **Pros**: Smallest reversible step. Removes user-visible non-functional controls immediately. Preserves design context for the follow-up Camel work without coupling the two changes.
- **Cons**: Leaves a brief gap where neither manual UI nor automation exists for ManagedClusterSet binding — but the manual UI never worked anyway, so the user-visible state is unchanged.
- **Why chosen**: Fastest path to remove the lie. Keeps the Camel change clean — it can be designed against the post-cleanup frontend without rewriting UI.

### Option B: Wire the existing UI controls to a real backend
- **Approach**: Add `managedClusterSet` and `autoProvision` to the Group schema, PATCH whitelist, and Mongoose model; have the backend trigger Camel from these fields.
- **Pros**: Preserves the UI surface as-is.
- **Cons**: Bakes manual controls into the data model when the agreed direction is automatic provisioning. Two-way drift risk between user-toggled state and Camel-derived state. Forces a schema migration for fields that should not exist.
- **Why not chosen**: Contradicts the agreed direction. Would need to be undone to land the Camel automation.

### Option C: Hide the controls behind a feature flag instead of removing
- **Approach**: Wrap both fields in an `import.meta.env` flag, default off.
- **Pros**: Reversible; controls survive in code if intent changes.
- **Cons**: Adds a flag for code that the team has already decided to remove. Dead code with a flag is still dead code. Per CLAUDE.md "no half-finished implementations".
- **Why not chosen**: The decision is firm — automation replaces the manual controls. Flag would just be debt.

## Agreed Approach

Option A. Remove the dead controls in this change; defer all Camel work (route, Debezium connector, helm chart wiring) to a follow-up openspec change whose scaffold this change creates.

## Key Decisions

For this change (frontend cleanup):
- Remove `binding` and `autoProvision` `useState` + their JSX in `GroupEditor.tsx`.
- Remove `MANAGED_CLUSTER_SETS` constant, `managedClusterSet` and `autoProvision` `useState` + their JSX in `NewGroupPage.tsx`.
- Keep the "Resources that will be created" preview block — these still describe what Camel will provision downstream — but change the binding line from `{managedClusterSet} → {idDisplay}` to `{idDisplay} → {idDisplay}` (both ClusterSet name and binding namespace are the bare group id).
- Fix the file-header comment in `GroupEditor.tsx`: it incorrectly claims auto-suggest behavior that only exists in `NewGroupPage`.
- Update tests: drop `/managedclusterset/i` and `/auto.?provision/i` assertions in `GroupEditor.test.tsx`; delete the "ManagedClusterSet is a `<select>`" test and adjust the preview test in `NewGroupPage.test.tsx`.
- Update `openspec/specs/itsm-admin-users/spec.md` to drop the field-list mentions and rewrite the "ManagedClusterSet seeded select" requirement to drop the select entirely (preview keeps the binding line with the `id → id` form).

For the deferred Camel change (captured here so the second change has full context):
- Resource naming: ManagedClusterSet `metadata.name` = ManagedClusterSetBinding `metadata.name` = AppProject `metadata.name` = `<group-id>`. ManagedClusterSetBinding `metadata.namespace` = `<group-id>`. No new schema field on Group.
- File naming inside `orgs/<id>/`: rendered ManagedClusterSet/Binding manifest is `<group-id>-clusterset.yaml` (file-only suffix; in-cluster names stay bare).
- Idempotency = git-file-exists check in the destination repo (pure GitOps, no k8s client added to Camel).
- Output repo = central `gdfkube-orgs` (rendered-manifests scope, ephemeral Gitea), under `orgs/<id>/`.
- Trigger = new Debezium connector on the `groups` Mongo collection emitting to `dbz.gdfkube.groups`.

## Open Questions

None — the prior plan-mode session resolved naming, idempotency strategy, output repo, and scope boundaries with the user.
