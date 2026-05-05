## Auditor 5 — Foundations (styles / data / types / icons / routes)

### Summary
Tokens, color palette, fonts, sizes, and pill/banner/card/pipeline definitions are byte-for-byte ports from the reference, and the icon set matches geometry exactly. The major foundation drift is the App's shell layout: `App.tsx` introduces `.app-shell`, `.shell`, `.main-col`, `.density-compact`, `.page-placeholder` and `.tweaks-panel` classes that have **no rules in `styles.css`**, so the reference grid (`.app` + `grid-template-areas: utility/sidebar/topbar/main`) is unused and the page falls back to an unstyled stack. Several admin/editor and `twk-*` tweaks classes are likewise unstyled. Seed data is faithful with two normalizations (form-id slugs, KPI/activity ids) that may or may not be intended.

### P0 — Critical
- **Reference `.app` grid is unused; wrong shell classes** — `gdfkube-itsm/src/App.tsx:166-192` emits `app-shell`/`shell`/`main-col` which are absent from `gdfkube-itsm/src/styles.css`; the only grid rules are `.app{...}` at `styles.css:87-95` and `.app[data-density=...]` at `:96`. The whole 3-row utility/sidebar/topbar/main layout never engages.
- **Density tokens not applied** — `App.tsx:162` writes `density-${tweaks.density}` (e.g. `density-compact`) but `styles.css:96` only matches `.app[data-density="compact"]`; compact mode (smaller `--row-h`/font) is dead.
- **Pulse animation default drift** — `styles.css:567` uses `animation: pulse var(--anim-duration, 4s)` (4s fallback) vs ref `styles.css:567` literal `1.4s`. Without the `Pipeline` inline var the active stage pulses 3x slower than designed.

### P1 — High
- **Many JSX classes have no CSS** — used in impl but absent from `gdfkube-itsm/src/styles.css`: `page-placeholder`, `tweaks-panel`, `twk-panel`, `twk-hd`, `twk-body`, `twk-sect`, `twk-row`, `twk-row-h`, `twk-field`, `twk-lbl`, `twk-val`, `twk-num`, `twk-num-lbl`, `twk-num-unit`, `twk-slider`, `twk-toggle`, `twk-seg-thumb`, `twk-swatch`, `twk-x`, `toast-icon`, `toast-close`, `payload-preview`, `fields-table`, `fields-adv-row`, `cell-input`, `drag-handle`, `form-editor`, `group-editor`, `user-editor`, `template-editor`, `template-tabs`, `vars-panel`, `vars-group`, `vars-group-head`, `kv`, `menu-check`, `sessions`, `subtabs`, `approval-step-head`, `approval-chain`, `new-form-page`, `new-user-page`, `new-group-page`, `new-request-page`, `my-icon`, `row-form-id`, `row-group-id`, `row-source-form-id`.
- **Catalog/Form id normalization deviates from reference seeds** — `seeds.ts:72-76,401-405` rewrites `cluster`→`cluster-request`, `scale`→`scale-request`, `namespace`→`namespace-request`, and the `CatalogItem` type drops `title`/`desc`/`icon`/`meta` (`types.ts:137-140`). Reference `data.jsx:193-197` ships those fields inline.

### P2 — Medium
- **`Org` and `User` shapes diverge from reference** — ref `data.jsx:2-9` uses `{id,name,full}`; impl `seeds.ts:18-40` renames `full`→`fullName` and adds `group`, and `User` requires `email`/`role` (`types.ts:5-17`) while ref carries no User type at all.
- **PIPELINE_STAGES key vs id** — ref uses `key` (`data.jsx:158-165`); impl uses `id` (`seeds.ts:280-287`, `types.ts:83-89`). Any code copy-pasted from the bundle expecting `stages[i].key` would silently render `undefined`.
- **`KPI`/`ActivityEntry` synthetic ids** — `seeds.ts:327-348,353-396` adds `id`, `actor`, `verb`, `objectId`, `detail` not present in ref `data.jsx:179-191`. The impl `ActivityEntry.detail` duplicates the ref `txt` value verbatim, so the extra fields are demo-padding.
- **`CLUSTER_FORM_ID` constant divergence** — `seeds.ts:57` defaults `formId` to `cluster-request` for un-tagged seeds (provisioning/ready/failed). Reference never sets `form` for those rows, so the impl invents a relationship.

### P3 — Low
- **Reference routes `policies`/`reports`/`audit` not registered** — ref `gdfkube ITSM Portal.html:73,95-99,112-121` switches on these and renders a placeholder page; impl `types.ts:19-27` `RouteName` enum has no entries for them and `App.tsx:99-126` exhaustive-switches without them.
- **`Group.users`/`forms`/`clusters` are demo numbers in `adminSeeds.ts:292-356`** — ref had no Group seed; values are unverifiable but harmless.
- **Type `Field.id` is `number` (`types.ts:160-162`) but `policyId()` makes string ids** — inconsistent with `PolicyCheck.id: string` (`types.ts:46-51`).
- **Unused token: `--radius-sm: 3px`** — `styles.css:43`, declared in both ref and impl, never referenced via `var(--radius-sm)`.
- **Duplicate `@keyframes pulse`** — `styles.css:570` and `:834`, second overrides first. Same flaw inherited from ref.

### Out-of-scope observations
- `router.ts:53-61` is a clean reducer router; no missing routes for what `Sidebar.tsx:49-72` actually renders.
- `Icons.tsx:56-350` covers every icon name used by ref `icons.jsx:8-46` (all 35) with identical SVG path strings.
- `dataContext.tsx:54-134` reducer covers all admin mutations; types don't leak runtime values.
- Unused exports: `SelectOption` (`types.ts:190-195`) and `RouteParams.submitted` (`types.ts:32`) — possible dead types.
