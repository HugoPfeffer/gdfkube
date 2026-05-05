## Auditor 4 — Admin

### Summary
Implementation provides Forms and Users admin pages with the same Forms/Form Fields and Users/Groups sub-tab structure as the reference. There is no Clusters admin section in the impl, but the reference's `clusters-admin.jsx` is itself orphaned (never mounted in `gdfkube ITSM Portal.html` nor referenced from `shell.jsx`/the App router), so it appears dead in the reference too. Several editor affordances are missing or simplified: NewFormPage drops the Fields/Template sub-tabs, UserEditor and NewUserPage drop the radio-card status pattern, info banners, and role descriptions, and the TemplateEditor swaps the "Template / Rendered preview" tab pair for a checkbox. Seeds (`adminSeeds.ts`, `defaultTemplates.ts`) match the reference data shapes.

### P0 — Critical
- _none_

### P1 — High
- **NewFormPage missing Fields and Template sub-tabs** — ref `admin.jsx:891-1056` defines Definition/Fields/Template sub-tabs; impl `NewFormPage.tsx:79-142` only renders the Definition grid, so a brand-new form must be saved before any field/template can be added.
- **FormsTable missing "Submissions" column** — ref `admin.jsx:495,508` shows a Submissions column populated with `f.submissions`; impl `Forms.tsx:73-80,82-95` omits it entirely.
- **FormEditor header lacks Reload-from-Git and Save-changes affordances** — ref `admin.jsx:568-573`; impl `FormEditor.tsx:53-58` only renders "← All forms".
- **FieldsTable: existing field key is read-only and "Add field" button absent** — ref `admin.jsx:631,690-691` lets users add and edit field keys; impl `FieldsTable.tsx:142-145,172` has no Add-field button on this table and forces `readOnly` on the key input.
- **FieldsTable: "MongoDB document shape" preview block missing** — ref `admin.jsx:784-792`; impl has no equivalent.
- **TemplateEditor: tab pair replaced by checkbox; toolbar features dropped** — ref `admin.jsx:276-301` uses pill tabs (Template/Rendered preview), shows a line counter, and a "Download all" button; impl `TemplateEditor.tsx:109-116` collapses these to a single "Rendered preview" checkbox.
- **TemplateEditor: explanatory info banner missing** — ref `admin.jsx:233-236` Camel/Git reconcile callout above the file tabs; impl has no equivalent.
- **AvailableVariablesPanel: rows are not whole-row click-to-copy** — ref `admin.jsx:339-353,364-381`; impl `AvailableVariablesPanel.tsx:20-28` only the icon button copies.

### P2 — Medium
- **UserEditor: avatar/name banner, role/status radio-cards, and "Disable account" button missing** — ref `admin.jsx:1191-1244,1187`; impl `UserEditor.tsx:43-102` uses a plain status `<select>` and omits the banner and disable button.
- **NewUserPage: missing info banner, role descriptions, status radio-cards, and SETIC group option** — ref `admin.jsx:1308-1356,1226-1230` includes `<option value="setic">SETIC (Platform)</option>` and full role descriptions; impl `NewUserPage.tsx:84-99` lists only group ids, plain role strings, status `<select>`.
- **NewUserPage: "Initial credentials" subsection with invite-email help missing** — ref `admin.jsx:1367-1380`; impl `NewUserPage.tsx:117-124` shows only the bare checkbox.
- **NewGroupPage: ManagedClusterSet as `<select>` (shared/dedicated/none) and "Resources that will be created" block** — ref `admin.jsx:1477-1503` uses a select and a code preview listing Keycloak group `/id`, AppProject `id-apps`, ManagedClusterSetBinding; impl `NewGroupPage.tsx:96-118` uses a free-text input and a different preview (`gdf-{id}`, `appproj-{id}`).
- **NewFormPage: missing info banner about Git/Camel reconcile** — ref `admin.jsx:912-915`; not present in `NewFormPage.tsx:52-78`.
- **FormEditor description default text differs** — ref `admin.jsx:620` `defaultValue="Provision a HyperShift hosted control plane cluster…"`; impl `FormEditor.tsx:127-132` shows whatever the form record stores.
- **GroupEditor lacks reference parallel** — ref doesn't have a per-group editor (only `GroupsTable` + `NewGroupPage`); impl ships a `GroupEditor.tsx` introducing a new editing surface — drift in either direction depending on intended scope.

### P3 — Low
- **TemplateEditor: file-tab styling and remove-tab UX simplified** — ref uses doc-icon + close button; impl `TemplateEditor.tsx:78-105` uses ✕ glyph and a different active-tab style.
- **AvailableVariablesPanel: section icons and footer help text omitted** — ref `admin.jsx:325-326,359,385-387`; impl renders only group titles.
- **`scale-request` template name drift** — ref `admin.jsx:171` uses `nodepool-patch.yaml`; impl `defaultTemplates.ts:108` uses `nodepool.yaml`.
- **`namespace-request` resourcequota uses `vars.memQuotaGi` vs `vars.memQuota`** — ref interpolates `{{ vars.memQuota }}Gi`; impl `defaultTemplates.ts:103` uses `{{ vars.memQuotaGi }}Gi`. Field key in seeds is `memQuotaGi`, so impl is internally consistent, but the rendered preview placeholder map at `TemplateEditor.tsx:27` only knows `vars.memQuota` — preview will print `<vars.memQuotaGi>` instead of a value.
- **"Last edited" column header label differs** — ref `admin.jsx:497` "Updated"; impl `Forms.tsx:79` "Last edited".
- **Sidebar count badges differ** — ref `admin.jsx:434-435` hardcodes 7 for Groups; impl uses live `data.groups.length`.

### Out-of-scope observations
- **`clusters-admin.jsx` is dead in the reference too** — `gdfkube ITSM Portal.html:23-37` does not load it, `shell.jsx:20-24` exposes no `admin-clusters` nav, and no other file imports `ClustersAdmin`. The implementation correctly omits it; flagging as "missing" would be incorrect.
- **Tests assert behavior beyond reference parity** — `Forms.test.tsx:125-130` asserts the absence of a "New field" button (matching impl design), and `Users.test.tsx:160-168` exercises a `GroupEditor` that has no reference. These are spec-driven tests for impl-only behavior, not drift.
- **`adminSeeds.ts` and `defaultTemplates.ts` shapes track the reference verbatim** — id/label/options/min/max all align with `data.jsx` and the `DEFAULT_TEMPLATE_FILES` map in `admin.jsx:73-181`, except for the `memQuota`→`memQuotaGi` rename noted above.
