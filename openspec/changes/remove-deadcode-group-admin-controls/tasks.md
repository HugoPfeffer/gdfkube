## 1. Frontend cleanup — GroupEditor

- [x] 1.1 Remove `binding` and `autoProvision` `useState` declarations from `gdfkube-src/gdfkube-itsm/src/admin/GroupEditor.tsx` (currently lines 25–26).
- [x] 1.2 Remove the two `<div className="field">` blocks for "ManagedClusterSet binding" and "Auto-provision" from `GroupEditor.tsx` (currently lines 101–114).
- [x] 1.3 Update the file-header comment in `GroupEditor.tsx` (currently lines 1–6): drop references to ManagedClusterSet binding and auto-provision; remove the inaccurate auto-suggest claim (auto-suggest only exists in `NewGroupPage`); reword to reflect actual fields (id read-only, display name, full name, mapped Git repo).
- [x] 1.4 Confirm `isDirty`, `handleSave`, and the Git Repo field are unchanged and still wired to `name`/`fullName`/`repo`.

## 2. Frontend cleanup — NewGroupPage

- [x] 2.1 Remove the `MANAGED_CLUSTER_SETS` constant from `gdfkube-src/gdfkube-itsm/src/admin/NewGroupPage.tsx` (currently line 23).
- [x] 2.2 Remove `managedClusterSet` and `autoProvision` `useState` declarations (currently lines 32–33).
- [x] 2.3 Remove the two `<div className="field">` blocks for the ManagedClusterSet `<select>` and the Auto-provision toggle (currently lines 123–145).
- [x] 2.4 Update the "Resources that will be created" preview block (currently lines 148–156): change the `ManagedClusterSetBinding:` line from `{managedClusterSet} → {idDisplay}` to `{idDisplay} → {idDisplay}`.
- [x] 2.5 Update the file-header comment in `NewGroupPage.tsx` (currently lines 1–9): drop the seeded-select description and the auto-provision toggle description; keep the preview-block description but reflect the new `{id} → {id}` binding wording.
- [x] 2.6 Confirm `slugify`, repo auto-suggest (`repoDirty` machinery), `handleCreate`, and the create disabled-until-id rule are unchanged.

## 3. Frontend tests

- [x] 3.1 In `gdfkube-src/gdfkube-itsm/src/admin/__tests__/GroupEditor.test.tsx`, remove the two `/managedclusterset/i` and `/auto.?provision/i` assertions from the existing-fields test (currently lines 65–66).
- [x] 3.2 Update the file-header comment in `GroupEditor.test.tsx` (currently lines 1–5) to drop ManagedClusterSet binding and auto-provision references.
- [x] 3.3 In `gdfkube-src/gdfkube-itsm/src/admin/__tests__/NewGroupPage.test.tsx`, delete the entire "ManagedClusterSet is a `<select>` with seeded options" test (currently lines 80–88).
- [x] 3.4 In the "preview block renders four lines" test in `NewGroupPage.test.tsx` (currently lines 90–101), remove the `select` lookup and the `fireEvent.change(select, …)` step (currently lines 92, 94); update the binding regex on line 99 from `/ManagedClusterSetBinding:\s*staging\s*→\s*cultura/` to `/ManagedClusterSetBinding:\s*cultura\s*→\s*cultura/`.

## 4. Spec update

- [x] 4.1 Update `openspec/specs/itsm-admin-users/spec.md` "Per-group editor and New group page" requirement (currently lines 62–70): drop "ManagedClusterSet binding, and an auto-provision toggle" from the field list and drop "binding" from the preview-side mention.
- [x] 4.2 Rewrite the "NewGroupPage ManagedClusterSet seeded select and resource-creation preview" requirement (currently lines 99–119): rename to "NewGroupPage resource-creation preview"; drop the select requirement and its scenario; update the preview binding line to `ManagedClusterSetBinding: {id} → {id}`; rewrite the preview scenario accordingly; add a scenario asserting no `<select>` and no Auto-provision input is present.

## 5. Deferred Camel work — change scaffold only

- [x] 5.1 Verify a deferred-change scaffold exists (or create a minimal one) at `openspec/changes/auto-provision-org-resources-from-group-events/` capturing the agreed naming/idempotency/output-repo decisions. **No Camel/route/connector code is written in this change** — scaffold only.

## 6. Verification

- [x] 6.1 From `gdfkube-src/gdfkube-itsm/`: run `npm run lint` (or project equivalent) and confirm no new warnings.
- [x] 6.2 From `gdfkube-src/gdfkube-itsm/`: run `npm test -- GroupEditor NewGroupPage`; confirm modified test files pass and no test still references `managedclusterset` or `auto.?provision`.
- [x] 6.3 From `gdfkube-src/gdfkube-itsm/`: run full `npm test`; confirm no regression in other admin/users tests.
- [x] 6.4 From `gdfkube-src/gdfkube-itsm/server/`: run `npm test`; confirm `groups.test.ts` continues to pass unchanged.
- [ ] 6.5 Run the SPA dev server, log in as `admin`, open Admin → Users → Groups: editor shows exactly four fields; saving an edited Display name shows the "Saved" toast.
- [ ] 6.6 Click "+" New group: form shows exactly four fields plus the preview; type "Cultura" and confirm preview reads `ManagedClusterSetBinding: cultura → cultura`; click Create and confirm group appears in the table.
- [x] 6.7 From repo root: run `openspec validate itsm-admin-users` and confirm it passes; run `openspec list` and confirm both this change and the deferred Camel change scaffold are listed.
- [ ] 6.8 From repo root: run `pre-commit run --all-files` (per CLAUDE.md) before committing.
