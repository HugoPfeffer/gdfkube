# gdfkube ITSM Portal — Implementation vs Reference Audit

> **Historical — superseded by the Express API.** This report predates
> `2026-05-11-add-itsm-express-api`. Any guidance below that treats the SPA
> as the source of truth for ITSM state (frontend-only seeds, in-memory
> reducers as the canonical store, `FALLBACK_USERS`, etc.) is superseded:
> all ITSM state now lives behind `/api/itsm/*` and `DEMO_USERS` in
> `gdfkube-src/gdfkube-itsm/server/src/data/demoUsers.ts` is the single
> source of truth for identity. See `docs/02-express-api.md` and
> `CLAUDE.md` § "Demo identity". Findings about visual/UX fidelity (layout
> scaffolding, tweaks panel, page-level affordances) remain valid.

**Date:** 2026-05-05
**Reference (desired state):** `/.tmp/handoff/gdfkube-remix/project/` (extracted from `gdfkube (Remix)-handoff.zip`, anchor file `gdfkube ITSM Portal.html`)
**Implementation:** `/workspace/gdfkube-src/gdfkube-itsm/src/`
**Method:** 5 parallel audit agents, each owning one slice of the surface area, returned structured findings against the reference handoff.

---

## Executive summary

The React/TypeScript port reproduces the design system's tokens, fonts, and icon set faithfully but diverges on **layout scaffolding**, several **page-level affordances**, and the **tweaks-panel host-message protocol**.

The single most disruptive issue is that `App.tsx` wraps the app in `.app-shell > .shell > .main-col` (with `density-*` and `banner` modifiers), none of which are styled — the reference's `.app` CSS-grid layout (`grid-template-areas: utility / sidebar / topbar / main`) is therefore dead. Combined with ~50 other JSX class names that exist only in markup, this means much of the visual fidelity present in the reference HTML is silently lost at runtime.

Secondary themes:
- **Page-level regressions** in Dashboard (no banner, no header CTA, vertical instead of side-by-side cards), RequestsList (no tabs, no toolbar, only 5 of 9 columns), RequestDetail (no header pill/title/actions, no pipeline header/progress), and Approvals (no queue KPIs, simplified rows, missing reject-without-comment guard).
- **Form runtime** drops inline error rendering, default seed values, prefix lower-casing, and the "What happens next" / Kafka-topic narrative.
- **Tweaks panel** is a hand-rolled drawer instead of the reference's floating `twk-*` panel with drag-positioning and host postMessage protocol.
- **Foundations** are mostly faithful but with a `pulse` animation default that's 3× slower than the reference and a few seed/id renames.

There are no auditor-reported P0s in the **Admin** slice; the admin pages exist with the right sub-tab structure, just with several missing affordances (Submissions column, Reload-from-Git/Save buttons, MongoDB shape preview, Template/Rendered tabs, etc.).

The reference's `clusters-admin.jsx` is **dead in the reference itself** (not loaded by `gdfkube ITSM Portal.html`, not navigated from `shell.jsx`); the implementation's omission is correct.

### Severity tally
| Severity | Count |
|---|---|
| P0 — Critical | 12 |
| P1 — High | 36 |
| P2 — Medium | 31 |
| P3 — Low | 30 |

---

## P0 — Critical (broken or missing core behavior)

### Layout / shell
1. **`.app` grid is unused; impl wraps in unstyled `.app-shell > .shell > .main-col`** — `App.tsx:166-192` vs ref `shell.jsx` + `styles.css:87-95`. The whole 3-row utility/sidebar/topbar/main layout never engages.
2. **Density tweak has no effect** — `App.tsx:162` emits `density-${tweaks.density}` but only `.app[data-density="compact"]` exists in `styles.css:96`. No `.density-*` rules anywhere.
3. **Tweaks panel is a different component** — `TweaksPanel.tsx:42-238` ships a right-edge drawer; ref `tweaks-panel.jsx:160-246` is a floating 280px panel using `twk-*` classes, drag-to-reposition, and a host postMessage protocol (`__activate_edit_mode`, `__edit_mode_set_keys`, `__edit_mode_dismissed`).
4. **Tweak control library missing** — Ref exports `TweakSection/Row/Slider/Toggle/Radio/Select/Text/Number/Color/Button` (`tweaks-panel.jsx:250-419`) plus the inline `__TWEAKS_STYLE`. Impl reimplements with native form controls inline.
5. **Pulse animation default 3× slower than designed** — `styles.css:567` uses `animation: pulse var(--anim-duration, 4s)`; ref literal `1.4s`. Without inline `Pipeline` var the active stage pulses much slower.

### Dashboard
6. **Dashboard banner not rendered as `.banner`** — `Dashboard.tsx:62-84` renders a plain `card` instead of ref's dark `.banner` block (`dashboard.jsx:22-29`). CSS `.banner`/`.detail-grid` rules go unused.
7. **Dashboard "New cluster request" header CTA missing** — ref `dashboard.jsx:16-18` page-head-row + primary button; impl `Dashboard.tsx:57-60` has no row, no button.
8. **Dashboard `.detail-grid` collapsed** — ref renders Recent Requests + Activity Stream side-by-side via `.detail-grid` (`dashboard.jsx:45-95`); impl stacks two cards vertically (`Dashboard.tsx:106-189`).

### RequestsList
9. **Tabs missing** — ref `requests-list.jsx:9-13,44-51` shows three tabs (mine / department / all) with counts; impl has none.
10. **Toolbar missing** — ref `requests-list.jsx:37-40` shows CSV ghost + New request primary; impl `RequestsList.tsx:70-75` has neither.
11. **Table reduced from 9 to 5 columns** — `requests-list.jsx:64-75` (Number/Cluster/Department/Environment/Nodes/Requester/Status/Submitted/↗) vs `RequestsList.tsx:96-105` (Number/Form/Department/Status/Submitted). Drops env/nodes/requester/chevron and renames Cluster→Form.

### RequestDetail
12. **Detail header gutted** — `request-detail.jsx:36-55` shows pill+row-id, "Cluster {cluster} · {orgName}" title, "Submitted by …", plus Back/Open-in-Gitea/Approve/kubeconfig actions; impl `RequestDetail.tsx:94-98` shows only `request.id` mono title and form-label sub.
13. **Pipeline header/progress missing** — ref `request-detail.jsx:57-70` renders "Provisioning Pipeline" title, Live/Completed/Failed pill, and overall % progress bar; impl mounts `<Pipeline>` raw at `RequestDetail.tsx:100`.
14. **Cluster Access card always present and content drift** — ref `request-detail.jsx:137-151` only renders when `status === "ready"`, with API/Console/Version dl rows; impl `RequestDetail.tsx:146-163` always renders with explanation paragraph and disabled button.

> Total tally above is 14, but #13 and #14 are scoped under one critical area; auditor reports flagged 12 distinct P0s.

---

## P1 — High (clear regression vs reference)

### Shell / tweaks
- **Host protocol absent in `useTweaks`** — ref posts `__edit_mode_set_keys` to `window.parent`; impl `useTweaks.ts:23-33` uses localStorage instead.
- **Tweaks toggle button is hand-rolled** — `App.tsx:194-207` adds a fixed "Tweaks" button overlapping the panel's intended position (right:16/bottom:16).
- **Sidebar nav uses `<button>` where ref uses `<div>`** — `Sidebar.tsx:100-112`. A11y win, but parity drift.
- **Unstyled JSX classes** — `.toast-icon`, `.toast-close`, `.menu-check` referenced in `ToastStack.tsx:41,48` and `Topbar.tsx:137,156`; no rules in `styles.css`.
- **Sidebar collapse unreachable in normal UI** — only togglable via the (broken) tweaks drawer.

### Foundations
- **Many JSX classes have no CSS** — absent from `styles.css`: `page-placeholder`, `tweaks-panel`, `twk-*` (panel/hd/body/sect/row/lbl/val/num/slider/toggle/seg-thumb/swatch/x), `payload-preview`, `fields-table`, `cell-input`, `drag-handle`, `form-editor`, `group-editor`, `user-editor`, `template-editor`, `template-tabs`, `vars-panel`, `vars-group`, `kv`, `menu-check`, `sessions`, `subtabs`, `approval-step-head`, `approval-chain`, `new-form-page`, `new-user-page`, `new-group-page`, `new-request-page`, `my-icon`, `row-form-id`, `row-group-id`, `row-source-form-id`.
- **Form-id slug rewrite** — `seeds.ts:72-76,401-405` rewrites `cluster`→`cluster-request`, `scale`→`scale-request`, `namespace`→`namespace-request`; `CatalogItem` type drops `title`/`desc`/`icon`/`meta` (`types.ts:137-140`).

### Dashboard / Catalog / RequestsList
- **StatusPill class names diverge from CSS** — `StatusPill.tsx:28` outputs `pill pill-<status> <tone>`, but only legacy `.pill.green/.amber/.red/.blue` (`styles.css:386-391`) is styled.
- **StatusPill labels drift** — "Awaiting approval" (ref) vs "Approval pending" / "Approval" (impl).
- **StatusPill missing `pending`, `healthy`, `degraded`** — ref covers seven statuses; impl restricts to four (`StatusPill.tsx:18-23`).
- **Catalog tiles drop `meta` row** — ref renders `.meta` row with `<Icons.clock>` + duration; impl `Catalog.tsx:83-89` renders icon/title/description only.
- **Catalog drops shortTitle override** — ref `catalog.jsx:5-8,44` uses "OpenShift Cluster" / "Namespace Onboarding" / "Cluster Scale Change"; impl always uses `form.name`.
- **Catalog missing empty state** — ref renders `<Icons.form size={32}>` + "No active forms…"; impl shows empty grid.
- **Filter chip set drift** — ref order: `All, Provisioning, Awaiting approval, Ready, Failed`; impl: `All, Approval, Provisioning, Ready, Failed`.
- **RequestsList `<Icons.filter>` indicator + "Showing X of Y" counter missing** — ref `requests-list.jsx:53,59-60`.
- **Recent Requests "View all" CTA missing** — ref `dashboard.jsx:48-50`.
- **Recent Requests "Submitted" column shows full datetime** — ref uses time-only via `r.submitted.split(" ")[1]`.

### RequestDetail / Approvals / NewRequest / Forms
- **Approval-chain semantics inverted** — ref ties chain to lifecycle ("Department lead / Platform admin (you) / Provisioning pipeline"); impl uses abstract triplet `['Operator submitted','Group lead','SETIC']` (`DecisionPanel.tsx:25,233-256`).
- **Queue header KPIs absent** — ref `approvals.jsx:83-96` puts in-queue/approved-today/rejected-today stat tiles in the page-head; impl shows only title+sub.
- **Queue row meta drift** — missing failing-checks badge, requester name, color-coded env (`Approvals.tsx:227-239` vs `approvals.jsx:142-159`).
- **Decision panel header drift** — missing StatusPill, no `Cluster <name>` hero (`DecisionPanel.tsx:51-69` vs `approvals.jsx:205-223`).
- **Decision panel adds Justification card not in ref** — `DecisionPanel.tsx:73-98,100-125` vs ref's inline divider in payload card.
- **Reject-without-comment guard missing** — ref disables Reject when `!comment.trim()` ("required for reject"); impl has no enforcement.
- **Override-modal copy/CTA drift** — ref title "Approve despite warnings?" + "Approve with override"; impl "Override failing policy checks?" + "Confirm override".
- **NewRequest "What happens next" card removed** — ref `new-request.jsx:262-292` 6-step (cluster) / 5-step (other) sidebar narrative.
- **Kafka topic footer + Routed-via row removed** — ref `new-request.jsx:235-238` shows shield icon + "Routed via Kafka topic dbz.gdfkube.requests".

### Admin
- **NewFormPage missing Fields and Template sub-tabs** — ref `admin.jsx:891-1056`; impl `NewFormPage.tsx:79-142` only renders Definition.
- **FormsTable missing "Submissions" column** — ref `admin.jsx:495,508`.
- **FormEditor header lacks Reload-from-Git and Save-changes** — ref `admin.jsx:568-573`; impl has only "← All forms".
- **FieldsTable: existing field key read-only and "Add field" button absent** — ref `admin.jsx:631,690-691`.
- **FieldsTable: "MongoDB document shape" preview block missing** — ref `admin.jsx:784-792`.
- **TemplateEditor: tab pair replaced by checkbox; line counter and Download-all dropped** — ref `admin.jsx:276-301`.
- **TemplateEditor: Camel/Git reconcile info banner missing** — ref `admin.jsx:233-236`.
- **AvailableVariablesPanel: rows are not whole-row click-to-copy** — ref `admin.jsx:339-353,364-381`.

---

## P2 — Medium (visible drift, content / styling / tokens)

### Shell
- **`role-switch` becomes a button** — `Topbar.tsx:90-105`; ref uses `<div onClick>` (`shell.jsx:94-101`). CSS at `styles.css:250` assumes a div.
- **Menu items mixed div/button** — `Topbar.tsx:120-157`: role choices use `<button role="menuitem">`, Preferences/Sign out use `<div className="menu-item">`. Ref uses divs throughout.
- **Icons get `aria-hidden="true"`** — `Icons.tsx:48`. Topbar refresh/notifications buttons rely on `title` alone (`Topbar.tsx:77-88`); no `aria-label`.
- **`.banner` class collision** — `App.tsx:163` appends `banner` to the shell class; `.banner` (`styles.css:619`) is the inline gradient banner. Toggling `showDemoBanner` likely produces a navy gradient as the entire app body.
- **Tweaks panel has no focus management** — `TweaksPanel.tsx:42-60` sets `role="dialog"` but no focus trap, no return-focus on close, no Escape handler.
- **`page-placeholder` unstyled** — `App.tsx:158`.

### Dashboard / Catalog / RequestsList
- **Banner copy drift** — "median time-to-ready 1m 47s" (ref) vs "2m 18s" (impl).
- **RequestsList live-update interval missing** — ref `requests-list.jsx:6-7` uses 1.5s `setInterval` to tick progress.
- **Provisioning row UI drift** — ref shows 100px bare progress bar; impl adds extra `.progress-bar`, "58% · Camel" caption, 160px width.
- **Cluster cell content** — ref shows `<strong>cluster</strong> / env`; impl Dashboard shows monospaced cluster name with no env suffix.
- **RequestsList env color-coding lost** — ref `requests-list.jsx:85-89` colors env mono text by env.
- **Subtitle copy drift** — ref "Cluster provisioning requests submitted through the IT service portal."; impl rewrites.
- **Dead CSS** — `.detail-grid`, `.banner`, `.cat-tile .meta` (`styles.css:512,619-645`) have no consumer.

### RequestDetail / Approvals / NewRequest / Forms
- **Decision actor drift** — impl uses real user; ref hardcodes `"Maria Costa"` (test-alignment note).
- **Reject status target differs** — ref records decision locally only; impl dispatches `UPDATE_REQUEST_STATUS` with `status:"failed"`.
- **Approve target stage drift** — ref does not mutate stage/status server-side; impl sets `status:"provisioning", stage:1`.
- **Decision-this-session label drift** — ref shows green/red Approved/Rejected pill on each decided row; impl shows plain text after a dot-sep.
- **Empty state copy** — ref "All caught up." 40px check icon; impl 13px muted "Select a request from the queue…".
- **Form fields lack inline error display** — `GenericRequest.tsx:213-231` only computes `isValid`; never renders `validateField` output.
- **Default field values seed missing** — `GenericRequest.tsx:75` initialises `useState<FormValues>({})` empty; ref seeds defaults (first select option, min for number, false for checkbox).
- **Prefix lower-casing dropped** — ref lower-cases text input value when validation regex includes `[a-z]`; impl does not.
- **Pipeline-stage CSS class drift** — `Pipeline.tsx:62` outputs both `stage-${state}` and `pipe-stage ${state}`; ref CSS only defines `.pipe-stage.done/.active/.failed`.
- **OverrideModal blocks click-through** — `OverrideModal.tsx:46-54` has no backdrop `onClick` to close.

### Admin
- **UserEditor: avatar/name banner, role/status radio-cards, "Disable account" button missing** — ref `admin.jsx:1191-1244,1187`.
- **NewUserPage: missing info banner, role descriptions, status radio-cards, SETIC group option** — ref `admin.jsx:1308-1356,1226-1230`.
- **NewUserPage: "Initial credentials" subsection with invite-email help missing** — ref `admin.jsx:1367-1380`.
- **NewGroupPage: ManagedClusterSet `<select>` and "Resources that will be created" preview drift** — ref `admin.jsx:1477-1503` lists Keycloak group `/id`, AppProject `id-apps`, ManagedClusterSetBinding; impl uses free-text input and different preview keys (`gdf-{id}`, `appproj-{id}`).
- **NewFormPage: missing Git/Camel reconcile info banner** — ref `admin.jsx:912-915`.
- **FormEditor description default text differs** — ref hardcodes `defaultValue="Provision a HyperShift hosted control plane cluster…"`; impl uses `form.description ?? ''`.
- **GroupEditor introduced with no reference parallel** — impl ships `GroupEditor.tsx` for a per-group editor that ref does not have.

### Foundations
- **`Org`/`User` shapes diverge from ref** — ref `{id,name,full}`; impl renames `full`→`fullName`, adds `group`, requires `email`/`role`.
- **PIPELINE_STAGES `key` vs `id`** — ref `data.jsx:158-165` uses `key`; impl uses `id`.
- **`KPI`/`ActivityEntry` synthetic ids** — `seeds.ts:327-348,353-396` adds `id`, `actor`, `verb`, `objectId`, `detail` not in ref.
- **`CLUSTER_FORM_ID` constant** — `seeds.ts:57` defaults `formId` to `cluster-request` for un-tagged seeds; ref never sets `form` for those rows.

---

## P3 — Low (nits, naming, minor a11y)

### Shell / dashboard / catalog / list
- My Requests badge derived vs hardcoded `3` (`Sidebar.tsx:39-47` vs `shell.jsx:19`).
- Dashboard activity row layout drift — inline `borderBottom` (ref) vs gap-stacked (impl).
- Dashboard activity field mapping — `a.txt`/`a.who`/`a.time` (ref) vs `a.detail ?? a.verb`/`a.actor`/`a.at` (impl).
- Activity Stream "Refresh" ghost button missing.
- Catalog description copy drift ("for your team" vs "for your department").
- `info` activity color — `--civic-400` (ref) vs `--civic-500` (impl).
- Catalog test asserts impl-only fallback copy.
- `role-switch` open icon doesn't rotate.
- Topbar crumb links are `<a href="#">` — both ref and impl.
- `ToastStack` adds `role="status"` aria-live="polite" + 5000ms auto-dismiss (impl-only).

### Detail / Approvals / NewRequest / Forms
- Submit button label "Submit request" + chevron + "Submitting…" state (ref) vs plain "Submit" (impl).
- PayloadPreview wraps in dark theme + injects `formId` and `requestId` (ref) vs unstyled `<pre>` with `{ meta, vars }` (impl).
- Number input value coercion — empty → `undefined` (impl) vs blank string (ref).
- Validate error wording drift — `Required` (impl) vs `Required.`, `Must match {regex}.` (ref).
- Token interpolation regex differs — `\w+` with `<key>` for missing (ref) vs `[^{}]+` keeping literal `{key}` (impl).
- RadioCards keyboard / role — `<button role="radio">` with Enter/Space (impl) vs bare `<div onClick>` (ref).

### Admin
- TemplateEditor: file-tab styling and remove-tab UX simplified.
- AvailableVariablesPanel: section icons and footer help text omitted.
- `scale-request` template name `nodepool-patch.yaml` (ref) vs `nodepool.yaml` (impl).
- `namespace-request` template uses `vars.memQuotaGi` (impl, internally consistent) vs `vars.memQuota` (ref); preview placeholder map at `TemplateEditor.tsx:27` only knows `vars.memQuota`.
- "Last edited" (impl) vs "Updated" column header (ref).
- Sidebar count badges differ — hardcoded 7 (ref) vs live `data.groups.length` (impl).

### Foundations
- Reference routes `policies`/`reports`/`audit` not registered in impl `RouteName`.
- `Group.users`/`forms`/`clusters` are demo numbers; ref had no Group seed.
- `Field.id` is `number` but `policyId()` makes string ids (`PolicyCheck.id: string`).
- Unused token `--radius-sm: 3px` (`styles.css:43`).
- Duplicate `@keyframes pulse` (`styles.css:570` and `:834`); inherited from ref.

---

## Cross-cutting observations (not severity-graded)

- **Reference's `clusters-admin.jsx` is dead in the reference itself** — `gdfkube ITSM Portal.html:23-37` does not load it; `shell.jsx:20-24` has no `admin-clusters` nav. Impl correctly omits it.
- **Tests encode several drift items** (`Catalog.test.tsx:55,117`; `Dashboard.test.tsx:114-134,205,220`; `RequestsList.test.tsx:154-158`; `RequestDetail.test.tsx:87-105`; `Approvals.test.tsx:286-303,305-350`; `Forms.test.tsx:125-130`; `Users.test.tsx:160-168`). Reverting drift will require adjusting the test suite in tandem.
- **`GenericRequest.tsx:97` defaults `env` to `'production'`** — ref defaults to `'development'`; this can produce accidental production requests in the demo flow.
- **`GenericRequest.tsx:115-132` hard-codes `'saude'` group fallback** — brittle demo artifact, not in the ref.
- **Reference `tweaks-panel.jsx` documents a host iframe edit-mode protocol** — entire workflow is missing from the React app; possibly an intentional product decision but worth confirming.
- **Pipeline stages parity is exact** (`seeds.ts:279-287` ↔ `data.jsx:157-165`) — id/label/sub/icon match.
- **Icon set parity is exact** (`Icons.tsx:56-350` ↔ `icons.jsx:8-46`, all 35 icons, identical SVG path strings).
- **Router has no missing routes** for what `Sidebar.tsx:49-72` actually renders.

---

## Suggested remediation order

1. **Restore the `.app` grid shell** — change `App.tsx:166-192` to emit `.app` with `data-density={tweaks.density}`, drop `app-shell`/`shell`/`main-col`. Resolves P0 #1 and #2 and a large fraction of the P1 "unstyled classes" list.
2. **Fix `StatusPill`** — emit only `pill <tone>` so existing CSS engages; align label set ("Awaiting approval"); add `pending`/`healthy`/`degraded` cases. Update tests.
3. **Restore `Pipeline` header + progress + Live pill** in `RequestDetail.tsx:100`. Then remove the always-on Cluster Access card; gate by `status === 'ready'`.
4. **Restore RequestsList** — tabs, toolbar, full column set, "Showing X of Y", filter icon, env color-coding.
5. **Restore Dashboard** — `.banner` markup, `.detail-grid` layout, "New cluster request" CTA, "View all" / Refresh ghost buttons, time-only column.
6. **Restore Approvals queue header KPIs** + queue-row failing-checks badge / requester name; enforce reject-without-comment.
7. **Restore NewRequest** — "What happens next" sidebar, Kafka-topic footer, default field values, inline error display.
8. **Restore TemplateEditor tab pair** + Camel/Git info banner + line counter + Download-all; restore FieldsTable Add-field, editable keys, MongoDB-shape preview; restore FormsTable Submissions column and FormEditor Reload-from-Git/Save buttons.
9. **Replace `TweaksPanel`** with the `twk-*` floating panel + drag positioning + host postMessage protocol — or formally remove the host-protocol dependency from the spec.
10. **Address foundation drift** — set `--anim-duration` default to `1.4s`, fix the `density-*` selector mismatch, normalize `PIPELINE_STAGES` `id`→`key`, decide whether `cluster-request`/`scale-request`/`namespace-request` slug rewrite is intentional and update `data.jsx` consumers accordingly.

---

## Slice reports

Per-auditor markdown blocks are in `/.tmp/audit-results/`:
- `auditor-1.md` — App shell & tweaks
- `auditor-2.md` — Dashboard / Catalog / Requests List
- `auditor-3.md` — Detail / Approvals / NewRequest / Forms
- `auditor-4.md` — Admin
- `auditor-5.md` — Foundations (styles / data / types / icons / routes)
