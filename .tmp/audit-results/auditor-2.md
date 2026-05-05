## Auditor 2 — Dashboard / Catalog / Requests List

### Summary
The three pages are roughly faithful but have meaningful drift. Dashboard is missing the "New cluster request" CTA, the styled `.banner` markup, and the right-rail two-column `.detail-grid` layout — instead it stacks plain cards. Catalog drops `meta` chips, the `featured` ribbon styling intent, the empty state, and the spec-driven copy/short titles. RequestsList drops tabs (mine/group/admin-all), the toolbar (CSV + New request), the row count "Showing X of Y", several columns (Environment, Nodes, Requester, chevron), and bumps `pill-<status>` class while only the legacy `.pill.<color>` rules exist in CSS.

### P0 — Critical
- **Dashboard banner not rendered as `.banner`** — ref `dashboard.jsx:22-29` uses dark `<div class="banner">` with `.icn` circle and "View activity" CTA; impl `Dashboard.tsx:62-84` renders a plain `card` with inline styles. CSS `.banner`/`.detail-grid` rules in `styles.css:619-645` go unused, breaking visual identity.
- **Dashboard missing "New cluster request" header CTA** — ref `dashboard.jsx:16-18` (page-head-row + primary button); impl `Dashboard.tsx:57-60` has no row, no button.
- **Dashboard top-row layout (`detail-grid`) collapsed** — ref `dashboard.jsx:45-95` renders Recent Requests + Activity Stream side-by-side via `.detail-grid`; impl `Dashboard.tsx:106-189` stacks two `.card`s vertically with `marginBottom: 18`.
- **RequestsList missing tabs (mine / department / all)** — ref `requests-list.jsx:9-13,44-51` shows three tabs with counts; impl `RequestsList.tsx` (no equivalent). Major navigation/UX regression for admins and group views.
- **RequestsList missing toolbar buttons** — ref `requests-list.jsx:37-40` renders `CSV` ghost button + `New request` primary; impl `RequestsList.tsx:70-75` has neither.
- **RequestsList table columns reduced from 9 to 5** — ref columns `Number, Cluster, Department, Environment, Nodes, Requester, Status, Submitted, ↗` (`requests-list.jsx:64-75`); impl `RequestsList.tsx:96-105` only has `Number, Form, Department, Status, Submitted`. Drops env/nodes/requester/chevron and renames Cluster→Form.

### P1 — High
- **StatusPill class names diverge from CSS** — impl `StatusPill.tsx:28` outputs `pill pill-<status> <tone>`, but `.pill-<status>` is not in `styles.css`; only legacy `.pill.green/.amber/.red/.blue` (`styles.css:386-391`) is styled. The spurious `pill-<status>` class is dead code.
- **StatusPill labels drift** — ref `dashboard.jsx:104` uses "Awaiting approval"; impl `StatusPill.tsx:19` uses "Approval pending". RequestsList chip also reads "Approval" (`RequestsList.tsx:27`) vs ref "Awaiting approval" (`requests-list.jsx:24`).
- **StatusPill missing `pending`, `healthy`, `degraded`** — ref map at `dashboard.jsx:101-109` covers seven statuses (used by clusters/health pills); impl restricts to four (`StatusPill.tsx:18-23`).
- **Catalog tiles drop `meta` row** — ref `catalog.jsx:46-48` renders a `.meta` row with `<Icons.clock>` + duration/labels; impl `Catalog.tsx:83-89` renders icon, title, description only. CSS `.cat-tile .meta` (`styles.css:512`) goes unused.
- **Catalog drops shortTitle override** — ref `catalog.jsx:5-8,44` shows "OpenShift Cluster" / "Namespace Onboarding" / "Cluster Scale Change"; impl `Catalog.tsx:87` always uses `form.name`. Test `Catalog.test.tsx:55` asserts the verbose name, contradicting the design's short titles.
- **Catalog missing empty state** — ref `catalog.jsx:32-33` renders `<Icons.form size={32}>` with "No active forms…"; impl `Catalog.tsx:65-92` simply renders empty grid.
- **Filter chip set drift** — ref order: `All, Provisioning, Awaiting approval, Ready, Failed` (`requests-list.jsx:21-27`); impl: `All, Approval, Provisioning, Ready, Failed` (`RequestsList.tsx:24-30`).
- **RequestsList missing `<Icons.filter>` indicator + "Showing X of Y" counter** — ref `requests-list.jsx:53,59-60`; impl `RequestsList.tsx:78-93` skips both.
- **Recent Requests missing "View all" CTA** — ref `dashboard.jsx:48-50` ghost button "View all >"; impl `Dashboard.tsx:107-109` shows only the heading.
- **Recent Requests "Submitted" column shows full datetime** — ref `dashboard.jsx:69` uses `r.submitted.split(" ")[1]` (time only); impl `Dashboard.tsx:145` shows full `submittedAt` string.

### P2 — Medium
- **Banner copy drift** — ref `dashboard.jsx:26` "median time-to-ready 1m 47s"; impl `Dashboard.tsx:74` "2m 18s".
- **RequestsList live-update interval missing** — ref `requests-list.jsx:6-7` 1.5s `setInterval` for ticking progress; impl has no auto-refresh.
- **Provisioning row UI drift** — ref shows 100px bare progress bar (`requests-list.jsx:94-98`); impl `RequestsList.tsx:132-150` adds extra `.progress-bar`, "58% · Camel" caption, 160px width.
- **Cluster cell content** — ref `<strong>{cluster}</strong>` only (`requests-list.jsx:81-83`); Dashboard ref `<strong>cluster</strong> / env` (`dashboard.jsx:66`). Impl Dashboard `Dashboard.tsx:138-140` shows monospaced cluster name with no env suffix.
- **RequestsList environment color-coding lost** — ref `requests-list.jsx:85-89` colors env mono text by env (red/amber/green); impl drops the column.
- **Subtitle copy drift** — ref `requests-list.jsx:35` "Cluster provisioning requests submitted through the IT service portal."; impl `RequestsList.tsx:53-55` rewrites.
- **`.detail-grid` / `.banner` / `.cat-tile .meta` CSS rules dead** — present in `styles.css:512,619-645` but no consumer.

### P3 — Low
- **Dashboard activity row layout drift** — ref `dashboard.jsx:84-92` inline `borderBottom` separators; impl `Dashboard.tsx:157-188` gap-stacked divs.
- **Dashboard activity mapping** — ref uses `a.txt`/`a.who`/`a.time`; impl uses `a.detail ?? a.verb`, `a.actor`, `a.at`. Works because seeds carry both, but ref shape is canonical.
- **Activity Stream "Refresh" ghost button missing** — ref `dashboard.jsx:80`; impl `Dashboard.tsx:153-156` omits.
- **Catalog description copy diverges** — e.g. ref `catalog.jsx:5` "…HyperShift hosted control plane cluster for your team"; impl `Catalog.tsx:30` "…hosted control plane for your department".
- **`info` activity color** — ref uses `var(--civic-400)`; impl uses `var(--civic-500)`.
- **Catalog test asserts impl-only fallback copy** (`Catalog.test.tsx:117`) not matching ref's `Submit a {name} request through the gdfkube pipeline.` (`catalog.jsx:15`).

### Out-of-scope observations
- `seeds.ts:279-287` `PIPELINE_STAGES` matches ref `data.jsx:157-165` exactly — pipeline stage parity is good.
- `dataContext` exposes `state.forms` with `status: 'active'|'disabled'` (`types.ts:164-170`); ref reads `GDF_ADMIN_DATA.forms` filter by `f.active` — semantic parity OK, but catalog page never uses `state.fields[form.id]` to derive field-count meta.
- `RequestsList` uses `ownsRequest()` matching by `username/id/name`; ref simply matches `joao.silva` literal. Impl is more flexible.
- Tests encode the drift cited above (`Dashboard.test.tsx:114-134,220`; `RequestsList.test.tsx:154-158`).
