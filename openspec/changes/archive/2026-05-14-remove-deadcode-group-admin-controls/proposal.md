## Why

Two ITSM admin controls — "ManagedClusterSet binding" and "Auto-provision repo + AppProject on save" — are pure UI placeholders. Their state lives in component-local `useState`, never reaches the dispatcher, the API, the Group document, or the PATCH whitelist. They imply capabilities that do not exist and confuse intent for the admin user. The agreed direction is that ManagedClusterSet binding and per-org provisioning become automatic via Camel routes; the manual UI is misleading and should be removed before the Camel change lands so the two changes stay independently reviewable.

## What Changes

**GroupEditor.tsx fields**
- From: 6 fields (id, display name, full name, Git repo, ManagedClusterSet binding, Auto-provision toggle).
- To: 4 fields (id, display name, full name, Git repo).
- Reason: Two controls are dead — never dispatched, never persisted.
- Impact: Non-breaking; removed UI was non-functional. No backend change.

**NewGroupPage.tsx fields and preview**
- From: 6 form fields (id, display name, full name, Git repo, ManagedClusterSet `<select>`, Auto-provision toggle) + preview line `ManagedClusterSetBinding: {selectedManagedClusterSet} → {id}`.
- To: 4 form fields (id, display name, full name, Git repo) + preview line `ManagedClusterSetBinding: {id} → {id}`.
- Reason: Dead controls removed; preview keeps describing what Camel will provision downstream, with the new bare-id naming convention.
- Impact: Non-breaking; the preview wording change is a string-only edit.

**File-header comments in both pages**
- From: References to ManagedClusterSet binding, auto-provision toggle, and (in `GroupEditor.tsx`) an inaccurate claim that the editor auto-suggests the repo from id.
- To: Comments describe only the actual fields in each component.
- Reason: Comment drift; the auto-suggest behavior only exists in `NewGroupPage`.

**Frontend tests**
- `GroupEditor.test.tsx`: drop `/managedclusterset/i` and `/auto.?provision/i` assertions.
- `NewGroupPage.test.tsx`: delete the "ManagedClusterSet is a `<select>`" test; in the preview test, drop the select interaction and update the binding regex from `staging → cultura` to `cultura → cultura`.

**Spec `openspec/specs/itsm-admin-users/spec.md`**
- "Per-group editor and New group page" requirement: drop "ManagedClusterSet binding, and an auto-provision toggle" from the field list and drop "binding" from the preview-side mention.
- "NewGroupPage ManagedClusterSet seeded select and resource-creation preview" requirement: rewrite to drop the select requirement and scenario; keep the preview requirement with the binding line as `ManagedClusterSetBinding: {id} → {id}`; rename to drop "ManagedClusterSet seeded select".

**Deferred Camel work**
- New empty change scaffold at `openspec/changes/auto-provision-org-resources-from-group-events/` capturing the agreed naming, idempotency strategy, and output-repo decisions. No Camel/route/Debezium code in this change.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `itsm-admin-users`: requirement field-list drops the two dead controls; the "ManagedClusterSet seeded select" requirement is rewritten to drop the select and update the preview binding line to `{id} → {id}`.

## Impact

**Affected source files (all under `gdfkube-src/gdfkube-itsm/src/admin/`)**
- `GroupEditor.tsx` — remove 2 `useState` and 2 `<div className="field">` blocks; fix header comment.
- `NewGroupPage.tsx` — remove `MANAGED_CLUSTER_SETS` const, 2 `useState`, 2 `<div className="field">` blocks; rewrite preview binding line; fix header comment.
- `__tests__/GroupEditor.test.tsx` — drop 2 assertions in the existing-fields test.
- `__tests__/NewGroupPage.test.tsx` — delete one test; update one test.

**Affected spec**
- `openspec/specs/itsm-admin-users/spec.md` — modify "Per-group editor and New group page" and "NewGroupPage ManagedClusterSet seeded select and resource-creation preview" requirements.

**Backend / API / data**
- None. `PATCH_WHITELIST` already excludes the removed fields. No Mongoose schema change. No new endpoint, no removed endpoint.

**Kafka / Debezium / Camel**
- None in this change. Captured in the deferred-change scaffold.

**Dependencies**
- None added or pinned. No version conflicts.

**Testing strategy**
- Unit/component (Vitest, existing): `npm test -- GroupEditor NewGroupPage` in `gdfkube-itsm/`. Modified test files must pass; no existing assertion may still reference the removed labels.
- Server (Jest/Vitest, existing): `npm test` in `gdfkube-itsm/server/`. Must remain green; no test relied on the removed fields (verified during plan).
- Manual: SPA dev server, log in as `admin`, open Admin → Users → Groups; confirm 4 fields in the editor and the preview reads `cultura → cultura` after typing `Cultura` in the new-group form.

**Blast radius**
- Pure frontend cleanup + spec edit + scaffold creation. No service, no API endpoint, no Kafka topic, no downstream consumer is affected.
