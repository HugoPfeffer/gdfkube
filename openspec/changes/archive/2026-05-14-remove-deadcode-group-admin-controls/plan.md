# Remove dead group-admin controls — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development
> to implement this plan task-by-task.

**Goal:** Delete the non-functional "ManagedClusterSet binding" and "Auto-provision" controls (and their state) from `GroupEditor.tsx` and `NewGroupPage.tsx`, align tests and the `itsm-admin-users` spec, and scaffold a deferred openspec change for the Camel automation that will replace them.

**Architecture:** Pure frontend deletion + spec edit + scaffold. No backend, no API, no schema, no Kafka/Debezium/Camel changes. The "Resources that will be created" preview block in `NewGroupPage` is preserved but its binding line moves from `{managedClusterSet} → {idDisplay}` to `{idDisplay} → {idDisplay}` (bare-id naming convention agreed in plan-mode).

**Tech Stack:** React 18, TypeScript, Vitest, React Testing Library; OpenSpec for spec/change management.

---

## Task 1: GroupEditor cleanup

- [ ] **Step 1:** Open `gdfkube-src/gdfkube-itsm/src/admin/GroupEditor.tsx`. Delete the two `useState` declarations on lines 25–26 (`const [binding, setBinding] = useState('');` and `const [autoProvision, setAutoProvision] = useState(true);`).
- [ ] **Step 2:** Delete the JSX field block "ManagedClusterSet binding" (currently lines 101–106) — the `<div className="field">` containing `<input id="group-binding" …>`.
- [ ] **Step 3:** Delete the JSX field block "Auto-provision" (currently lines 107–114) — the `<div className="field">` containing `<input id="group-auto" type="checkbox" …>`.
- [ ] **Step 4:** Rewrite the file-header comment (currently lines 1–6) to: `// Per-group editor.\n//\n// Inputs for id (read-only), display name, full name, and mapped Git repo.\n// Persisted via PATCH /api/itsm/groups/:id with the {name, fullName, repo} whitelist.`
- [ ] **Step 5:** Confirm `isDirty` (lines 30–33), `handleSave` (lines 38–64), and the Git Repo `<input>` (lines 96–99) are untouched.
- [ ] **Step 6:** Run `grep -nE 'binding|autoProvision' gdfkube-src/gdfkube-itsm/src/admin/GroupEditor.tsx` and confirm zero matches.

## Task 2: NewGroupPage cleanup

- [ ] **Step 1:** Open `gdfkube-src/gdfkube-itsm/src/admin/NewGroupPage.tsx`. Delete the `MANAGED_CLUSTER_SETS` constant on line 23.
- [ ] **Step 2:** Delete the `useState` declarations on lines 32–33 (`const [managedClusterSet, …]` and `const [autoProvision, …]`).
- [ ] **Step 3:** Delete the ManagedClusterSet `<select>` field block (currently lines 123–137) — the `<div className="field">` containing the `<select id="new-group-mcs">`.
- [ ] **Step 4:** Delete the Auto-provision toggle field block (currently lines 138–145) — the `<div className="field">` containing `<input id="new-group-auto" type="checkbox" …>`.
- [ ] **Step 5:** In the "Resources that will be created" preview (currently lines 148–156), change the line `<li>ManagedClusterSetBinding: {managedClusterSet} → {idDisplay}</li>` to `<li>ManagedClusterSetBinding: {idDisplay} → {idDisplay}</li>`.
- [ ] **Step 6:** Rewrite the file-header comment (currently lines 1–9) to drop the seeded-select description and the auto-provision toggle description, and reflect the new `{id} → {id}` binding wording in the preview-block description.
- [ ] **Step 7:** Run `grep -nE 'MANAGED_CLUSTER_SETS|managedClusterSet|autoProvision' gdfkube-src/gdfkube-itsm/src/admin/NewGroupPage.tsx` and confirm zero matches.
- [ ] **Step 8:** Run `grep -rn MANAGED_CLUSTER_SETS gdfkube-src/gdfkube-itsm/src` to confirm no other file imports the removed constant.

## Task 3: GroupEditor tests

- [ ] **Step 1:** Open `gdfkube-src/gdfkube-itsm/src/admin/__tests__/GroupEditor.test.tsx`. Locate the "renders inputs for every editable field" test (around lines 53–67).
- [ ] **Step 2:** Delete the two assertions matching `/managedclusterset/i` and `/auto.?provision/i` (currently lines 65–66).
- [ ] **Step 3:** Update the file-header comment (currently lines 1–5) to drop ManagedClusterSet binding and auto-provision references.
- [ ] **Step 4:** Run `npm test -- GroupEditor` from `gdfkube-src/gdfkube-itsm/` and confirm green.

## Task 4: NewGroupPage tests

- [ ] **Step 1:** Open `gdfkube-src/gdfkube-itsm/src/admin/__tests__/NewGroupPage.test.tsx`. Delete the entire `it('ManagedClusterSet is a <select> with seeded options', …)` block (currently lines 80–88).
- [ ] **Step 2:** In the `it('preview block renders four lines …')` block (currently lines 90–101): delete the `select` lookup line (`const select = screen.getByLabelText(/managedclusterset/i) …`) and the `fireEvent.change(select, { target: { value: 'staging' } });` line.
- [ ] **Step 3:** In the same test, change the regex `/ManagedClusterSetBinding:\s*staging\s*→\s*cultura/` to `/ManagedClusterSetBinding:\s*cultura\s*→\s*cultura/`.
- [ ] **Step 4:** Run `npm test -- NewGroupPage` from `gdfkube-src/gdfkube-itsm/` and confirm green.

## Task 5: Spec update

- [ ] **Step 1:** Open `openspec/specs/itsm-admin-users/spec.md`. In the "Per-group editor and New group page" requirement (currently lines 62–70), drop "ManagedClusterSet binding, and an auto-provision toggle" from the field list and drop "binding" from the preview-side mention. The result should match the requirement text in `openspec/changes/remove-deadcode-group-admin-controls/specs/itsm-admin-users/spec.md`.
- [ ] **Step 2:** Replace the "NewGroupPage ManagedClusterSet seeded select and resource-creation preview" requirement (currently lines 99–119) with the renamed "NewGroupPage resource-creation preview" requirement defined in this change's delta spec. Drop the seeded-select scenario; rewrite the preview scenario to use the bare-id binding form; add the "no select rendered" scenario.
- [ ] **Step 3:** Run `openspec validate itsm-admin-users` and confirm pass.

## Task 6: Deferred Camel work scaffold

- [ ] **Step 1:** Confirm `openspec/changes/auto-provision-org-resources-from-group-events/` exists, or create it via `openspec new change auto-provision-org-resources-from-group-events`.
- [ ] **Step 2:** Ensure the scaffold's proposal/design captures the agreed decisions: bare-id naming for ClusterSet/Binding/AppProject (`metadata.name = <group-id>`); binding namespace = `<group-id>`; rendered file `orgs/<group-id>/<group-id>-clusterset.yaml` (file-only suffix); idempotency = git-file-exists at the destination; output repo = central `gdfkube-orgs` (rendered-manifests scope, ephemeral Gitea); trigger = new Debezium connector on `groups` collection emitting to `dbz.gdfkube.groups`. **No Java/route/connector code in this scaffold.**
- [ ] **Step 3:** Run `openspec list` and confirm both `remove-deadcode-group-admin-controls` and `auto-provision-org-resources-from-group-events` are listed.

## Task 7: Verification

- [ ] **Step 1:** From `gdfkube-src/gdfkube-itsm/`, run `npm run lint` (or equivalent). Confirm no new warnings.
- [ ] **Step 2:** From `gdfkube-src/gdfkube-itsm/`, run `npm test -- GroupEditor NewGroupPage`. Confirm all tests pass.
- [ ] **Step 3:** From `gdfkube-src/gdfkube-itsm/`, run full `npm test`. Confirm no regressions.
- [ ] **Step 4:** From `gdfkube-src/gdfkube-itsm/server/`, run `npm test`. Confirm `groups.test.ts` still passes.
- [ ] **Step 5:** Run the SPA dev server, log in as `admin`, open Admin → Users → Groups. Click an existing group: confirm exactly four fields (ID read-only, Display name, Full name, Git repo). Edit Display name and click Save: confirm "Saved" toast.
- [ ] **Step 6:** Click "+" New group: confirm exactly four fields plus the preview. Type "Cultura": confirm preview reads `ManagedClusterSetBinding: cultura → cultura`. Click Create: confirm group appears in the table.
- [ ] **Step 7:** From repo root, run `openspec validate itsm-admin-users` and `openspec list`. Confirm validate passes and both changes are listed.
- [ ] **Step 8:** From repo root, run `pre-commit run --all-files`. Confirm pass before committing.
- [ ] **Step 9:** Commit with imperative message, e.g. `remove dead ManagedClusterSet/auto-provision controls from group admin`.
