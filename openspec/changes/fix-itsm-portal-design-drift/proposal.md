## Why

A post-merge audit against the original Claude Design handoff bundle (`UM8oI594JuuCpxaNBVoITA`) found 109 distinct fidelity regressions in the merged `gdfkube-itsm` portal. The single most disruptive issue is that the App component wraps everything in unstyled `.app-shell > .shell > .main-col` — bypassing the `.app` CSS Grid layout already defined in `styles.css`. ~50 reference CSS rules go dead at runtime. Combined with page-level affordances (Dashboard banner / detail-grid, RequestsList tabs / toolbar, RequestDetail header / pipeline progress, Approvals queue KPIs) and form runtime drift (env defaulting to `production`, no inline errors, missing default field values) the demo's narrative coherence is impaired. Address now while the spec is fresh and tests are still green.

## What Changes

**Layout shell**
- From: `<div className="app-shell density-{d}{ banner}"><div className="shell">…</div></div>` with no matching CSS rules
- To: `<div className="app" data-density={tweaks.density}>…</div>` engaging the existing `.app` Grid layout in `styles.css:87`
- Reason: revives ~50 dead CSS rules and the entire utility/sidebar/topbar/main grid
- Impact: non-breaking; tests assert against semantic landmarks, not the wrapper class

**Pipeline animation duration**
- From: `--anim-duration` default `4s`; `Pipeline.tsx` sets `4 / pipelineSpeed`
- To: default `1.4s`; formula `1.4 / pipelineSpeed`
- Reason: reference active stage pulses at `1.4s` literal; current is 3× slower than designed
- Impact: tests in `Pipeline.test.tsx` and `RequestDetail.test.tsx` need value updates

**StatusPill output classes and labels**
- From: emits `pill pill-<status> <tone>`; labels "Approval pending" / "Approval"; covers 4 statuses
- To: emits `pill <tone>` (matches existing CSS); labels "Awaiting approval"; adds `pending`, `healthy`, `degraded`
- Reason: no `.pill-<status>` rules exist in `styles.css`; ref label set differs; full status coverage
- Impact: Vitest assertions on the `pill-approval` class need to switch to the tone class

**GenericRequest form runtime**
- From: empty `useState<FormValues>({})`; `env` defaults to `'production'`; hardcoded `'saude'` group fallback; no inline error rendering
- To: seed defaults (first select option, `min` for number, `false` for checkbox); `env` defaults to `'development'`; group fallback uses only `user.group`; renders `validateField` output below each invalid field
- Reason: ref behavior; safer demo defaults; missing inline errors silently disable Submit without explanation
- Impact: spec `itsm-request-submission` adds inline-error and seeded-defaults requirements

**Dashboard / Catalog / RequestsList page-level affordances**
- From: vertical card stack; no banner; "New cluster request" CTA missing; reduced 5-column requests table; no tabs / toolbar
- To: `.banner` block + `.detail-grid` side-by-side cards; header CTA primary button; full 9-column requests table with env color-coding; tabs (mine / department / all); CSV ghost + "New request" primary toolbar; "Showing X of Y" + filter icon
- Reason: ref parity restoration; spec scenarios tighten
- Impact: spec `itsm-dashboard` and `itsm-requests-list` add ADD/MODIFIED requirements; ~6 tests need updates

**RequestDetail header + pipeline header**
- From: title shows only `request.id` mono; Pipeline component mounted bare; Cluster Access card always rendered
- To: title shows "Cluster {clusterName} · {orgName}", subtitle "Submitted by {requesterFullName}", actions row with Back / Open in Gitea / Approve / Download kubeconfig; Pipeline header with "Provisioning Pipeline" title + Live/Completed/Failed pill + overall progress bar; Cluster Access gated by `status === "ready"`
- Reason: ref parity; spec `itsm-request-detail` already requires gating
- Impact: spec `itsm-request-detail` adds header + pipeline-header requirements

**Approvals queue KPIs and decision-panel header**
- From: page-head shows only title + subtitle; queue rows lack failing-checks badge / requester name / env color; decision panel adds an extra "Justification" card; reject without comment is allowed
- To: page-head adds 3 KPI tiles (in-queue, approved-today, rejected-today); queue rows show failing badge + requester + colored env; decision panel inlines justification under payload (matches ref); Reject button disabled when comment is empty
- Reason: ref parity; reject-without-comment guard is a UX safeguard
- Impact: spec `itsm-approvals-queue` adds queue-header KPI and reject-comment-required requirements

**NewRequest "What happens next" sidebar**
- From: only PayloadPreview is rendered in the right column
- To: PayloadPreview + a "What happens next" 6-step (cluster) / 5-step (other) narrative + Kafka topic footer ("Routed via Kafka topic dbz.gdfkube.requests")
- Reason: ref parity; communicates the CDC pipeline to the operator
- Impact: spec `itsm-request-submission` adds informational-sidebar requirement (informational, not behavioral)

**Admin Forms / Users affordances**
- From: NewFormPage Definition only; FormsTable missing Submissions column; FormEditor lacks Reload-from-Git/Save; FieldsTable lacks Add-field, editable keys disabled, MongoDB shape preview missing; TemplateEditor lacks Camel/Git info banner, line counter, Download-all
- To: NewFormPage gains Fields and Template sub-tabs; FormsTable adds Submissions column; FormEditor adds Reload-from-Git + Save buttons (decorative for the demo, with toast); FieldsTable adds Add-field button, MongoDB-shape preview footer; TemplateEditor adds Camel/Git info banner + line counter + Download-all
- Reason: ref parity; admin pages were under-implemented
- Impact: spec `itsm-admin-forms` ADDS requirements; spec `itsm-admin-users` ADDS UserEditor banner, NewUserPage info banner + role descriptions, NewGroupPage ManagedClusterSet `<select>` with seeded options

**TweaksPanel a11y completion**
- From: `role="dialog"` set; no focus trap; no return-focus; no Escape handler
- To: focus first form control on open; trap focus inside the panel; return focus to trigger on close; Escape closes
- Reason: WCAG 2.1.2; matches the OverrideModal a11y baseline already in place
- Impact: 1-2 new tests in `TweaksPanel.test.tsx`

**Foundations**
- From: dead JSX class names without CSS (`page-placeholder`, `payload-preview`, `fields-table`, `cell-input`, `drag-handle`, `template-tabs`, `vars-panel`, `vars-group`, `kv`, `subtabs`, `approval-step-head`, `approval-chain`, `new-form-page`, `new-user-page`, `new-group-page`, `new-request-page`, `sessions`, `row-form-id`, `row-group-id`, `row-source-form-id`, `menu-check`, `toast-icon`, `toast-close`); `<button>` elements used for nav/menu/tab/radio-card without resets rendering with native chrome; missing `input[type="email/password/search"]` selectors; inline styles for layout properties that belong in CSS classes; `.var-row` lacking grid structure
- To: add full CSS rules for landmark classes; apply button resets to `.nav-item`, `.menu-item`, `.tab`, `.radio-card`; expand input selectors; move inline styles to class rules (`.template-tabs`, `.filters`); add `.var-row` grid layout with copy-feedback state
- Reason: keeps the visual landmarks the audit listed; keeps `styles.css` honest; eliminates inline style drift; ensures density overrides work uniformly
- Impact: cosmetic only; +68 lines in `styles.css`

**`scale-request` template filename**
- From: `nodepool.yaml`
- To: `nodepool-patch.yaml`
- Reason: ref alignment per user decision (cosmetic; preview-only YAML)
- Impact: `defaultTemplates.ts` rename; one test reference update

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `itsm-portal-shell`: TweaksPanel adds focus trap + Escape handler requirements; layout shell mandates `.app[data-density=...]` host
- `itsm-dashboard`: ADDS `.banner` + `.detail-grid` layout requirements + "New cluster request" header CTA + "View all" / Refresh ghost buttons + time-only Submitted column
- `itsm-service-catalog`: ADDS optional `.meta` row with duration; ADDS empty-state requirement
- `itsm-request-submission`: ADDS seeded-default requirement; ADDS inline `validateField` error display; ADDS env default `'development'`; ADDS "What happens next" sidebar (informational)
- `itsm-requests-list`: ADDS three tabs (mine / department / all); ADDS CSV + "New request" toolbar; ADDS full 9-column table with env color-coding; ADDS "Showing X of Y" counter + filter icon
- `itsm-request-detail`: ADDS header (cluster + org title, requester subtitle, action row); ADDS Pipeline header (title + status pill + overall progress); MODIFIES Cluster Access to gate by status
- `itsm-approvals-queue`: ADDS queue-header KPI tiles; ADDS queue-row failing-badge / requester / colored env; ADDS reject-comment-required guard; MODIFIES decision-panel header (StatusPill + Cluster hero) and inlines justification
- `itsm-admin-forms`: ADDS NewFormPage Fields and Template sub-tabs; ADDS FormsTable Submissions column; ADDS FormEditor Reload-from-Git + Save buttons; ADDS FieldsTable Add-field + MongoDB-shape preview; ADDS TemplateEditor Camel/Git banner + line counter + Download-all
- `itsm-admin-users`: ADDS UserEditor avatar/name banner + role/status radio-cards + Disable-account button; ADDS NewUserPage role-description info banner + Initial-credentials subsection; ADDS NewGroupPage ManagedClusterSet `<select>` (seeded options) + "Resources that will be created" preview rows

## Impact

**Affected code (file paths)**:
- `gdfkube-src/gdfkube-itsm/src/App.tsx` — wrapper class change
- `gdfkube-src/gdfkube-itsm/src/styles.css` — `--anim-duration` default 4s → 1.4s; minimal rules for missing class hooks
- `gdfkube-src/gdfkube-itsm/src/components/StatusPill.tsx` — class output + labels + missing statuses
- `gdfkube-src/gdfkube-itsm/src/components/Pipeline.tsx` — formula `1.4 / pipelineSpeed`
- `gdfkube-src/gdfkube-itsm/src/forms/GenericRequest.tsx` — env default, group fallback, default values, inline errors
- `gdfkube-src/gdfkube-itsm/src/pages/Dashboard.tsx` — banner + detail-grid + header CTA + View-all / Refresh
- `gdfkube-src/gdfkube-itsm/src/pages/Catalog.tsx` — `.meta` row + empty state + shortTitle override
- `gdfkube-src/gdfkube-itsm/src/pages/RequestsList.tsx` — tabs + toolbar + 9 columns + filter icon + counter + env color
- `gdfkube-src/gdfkube-itsm/src/pages/RequestDetail.tsx` — header + pipeline header + Cluster Access gating
- `gdfkube-src/gdfkube-itsm/src/pages/Approvals.tsx` — queue KPIs + queue row meta + reject-comment guard
- `gdfkube-src/gdfkube-itsm/src/pages/approvals/DecisionPanel.tsx` — header + inline justification (drop separate card) + chain semantics
- `gdfkube-src/gdfkube-itsm/src/pages/approvals/OverrideModal.tsx` — backdrop dismiss + copy realignment
- `gdfkube-src/gdfkube-itsm/src/admin/FieldsTable.tsx`, `FormEditor.tsx`, `TemplateEditor.tsx`, `NewFormPage.tsx`, `UserEditor.tsx`, `NewUserPage.tsx`, `NewGroupPage.tsx`, `AvailableVariablesPanel.tsx` — affordance restoration
- `gdfkube-src/gdfkube-itsm/src/data/defaultTemplates.ts` — `nodepool.yaml` → `nodepool-patch.yaml`
- `gdfkube-src/gdfkube-itsm/src/tweaks/TweaksPanel.tsx` — focus trap + Escape
- 10 test files updated alongside their components

**Tests**: ~30 tests will need value/assertion updates; total count expected to grow by ~15 new assertions covering the new requirements. No test deletions planned — all current tests assert real behavior.

**No new dependencies.** No CI changes. No version bumps.

**Out of scope** (will-not-fix, recorded in design.md):
- TweaksPanel host postMessage protocol + `twk-*` floating panel + drag-to-position (P0 #3, #4)
- Form-id slug reversal (`cluster` vs `cluster-request`)
- Full per-tile `CatalogItem` shape with title/desc/icon/meta
- Approve/Reject local-only behavior (current dispatch is spec-mandated)
- `vars.memQuota` reversion (impl fixed a ref bundle inconsistency)
- PipelineStage `id` → `key` rename
- A11y improvements added during the original code-review cycles
- My Requests sidebar derived-count vs hardcoded 3
- Reference's `clusters-admin.jsx` is dead in the reference itself; impl correctly omits it
