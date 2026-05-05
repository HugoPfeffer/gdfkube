# gdfkube ITSM Portal Design-Drift Remediation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Restore design fidelity to the merged `gdfkube-itsm` portal against the original Claude Design handoff bundle (`UM8oI594JuuCpxaNBVoITA`), addressing 109 audit findings while preserving the prior change's deliberate spec decisions.

**Architecture:** In-place remediation across 13 work clusters (layout shell → animation baseline → StatusPill → form runtime → Dashboard → Catalog → RequestsList → RequestDetail → Approvals → NewRequest sidebar → Admin Forms → Admin Users → TweaksPanel a11y), plus 2 cosmetic clusters (template filename + foundations cleanup). Each cluster commits independently; tests update in the same commit as their fix; spec deltas accompany behavior changes.

**Tech Stack:** Existing — React 18 + TypeScript 5 + Vite 5 + Vitest 1 + Testing Library 14. No new dependencies. No CI changes.

---

## Task 1: Layout shell

- [ ] **Step 1:** Read `App.tsx`. Replace the wrapper `<div className={`app-shell density-${tweaks.density}${tweaks.showDemoBanner ? ' banner' : ''}`}>` with `<div className="app" data-density={tweaks.density}>`.
- [ ] **Step 2:** If a banner is intended, render it as a sibling element using a non-conflicting class (`with-banner` modifier OR a top-level `.demo-banner` rendered above the `.app` grid). Keep `showDemoBanner` toggle.
- [ ] **Step 3:** Drop the inner `<div className="shell">` and `<div className="main-col">` wrappers. The `.app` Grid uses named areas; the children become direct grid items via their existing `.utility`, `.sidebar`, `.topbar`, `.main` classes.
- [ ] **Step 4:** Update `App.test.tsx` assertions: `document.querySelector(".app")` exists; `getAttribute("data-density")` returns the current density; no element has class `app-shell` / `shell` / `main-col`.
- [ ] **Step 5:** Run `npm run typecheck && npm run test && npm run lint && npm run build`. Visual smoke: `npm run dev`, browse Dashboard, confirm grid layout engages.
- [ ] **Step 6:** Commit `restore .app grid layout`.

## Task 2: Pulse animation duration baseline

- [ ] **Step 1 (TEST FIRST):** Update `Pipeline.test.tsx` and `RequestDetail.test.tsx` to assert `--anim-duration: 1.4s` at speed 1, `0.7s` at speed 2, `2.8s` at speed 0.5.
- [ ] **Step 2:** Update `styles.css:567` `--anim-duration` fallback from `4s` to `1.4s`.
- [ ] **Step 3:** Update `Pipeline.tsx` to compute `1.4 / pipelineSpeed` instead of `4 / pipelineSpeed`.
- [ ] **Step 4:** Run tests; commit `set pulse animation baseline to 1.4s`.

## Task 3: StatusPill realignment

- [ ] **Step 1:** Read `StatusPill.tsx`. Drop the `pill-<status>` class output. Emit `pill <tone>` only.
- [ ] **Step 2:** Update labels: `approval` → "Awaiting approval"; keep others as-is unless audit specifies different.
- [ ] **Step 3:** Add `pending`, `healthy`, `degraded` cases (tone mapping: pending → amber, healthy → green, degraded → amber).
- [ ] **Step 4:** Grep for `pill-approval`, `pill-provisioning`, etc. across `src/` and update assertions in tests to use the tone class or the label text instead.
- [ ] **Step 5:** Run tests; commit `realign StatusPill output to existing CSS`.

## Task 4: GenericRequest functional fixes

- [ ] **Step 1 (TEST FIRST):** In `GenericRequest.test.tsx`, add tests for: select seeds first option; number seeds `min`; checkbox seeds `false`; inline error appears below an invalid field; env defaults to `'development'` when no environment field exists.
- [ ] **Step 2:** Compute `seedDefaults(fields)` in `GenericRequest.tsx`. Pass to initial `useState`.
- [ ] **Step 3:** Change submit-handler default for `env` from `'production'` to `'development'`.
- [ ] **Step 4:** Drop the `'saude'` group fallback. Use `user.group ?? user.username + '-default'`.
- [ ] **Step 5:** Render `validateField(field, values[field.key])` output as `<small className="field-error">` directly below each field's input.
- [ ] **Step 6:** Run tests; commit `fix generic form runner functional defaults`.

## Task 5: Dashboard restoration

- [ ] **Step 1 (TEST FIRST):** Update `Dashboard.test.tsx` to assert: pipeline-health card has class `banner`; Recent Requests + Activity Stream are inside `.detail-grid`; operator role shows "New cluster request" header CTA; "View all" navigates to `requests`; Submitted column displays time only.
- [ ] **Step 2:** In `Dashboard.tsx`, change the pipeline-health card's outer class from `card` to `banner`.
- [ ] **Step 3:** Wrap Recent Requests + Activity Stream cards in `<div className="detail-grid">`.
- [ ] **Step 4:** Add a `.page-head-row` containing the title plus "New cluster request" primary button (operator role only).
- [ ] **Step 5:** Add "View all" ghost button in Recent Requests card header → `navigate("requests")`.
- [ ] **Step 6:** Add "Refresh" ghost button in Activity Stream card header (info toast on click).
- [ ] **Step 7:** Render Submitted column as `r.submittedAt.split(' ')[1] ?? r.submittedAt`. Set the cell `title` to the full timestamp.
- [ ] **Step 8:** Run tests; commit `restore dashboard banner and detail-grid`.

## Task 6: Catalog restoration

- [ ] **Step 1 (TEST FIRST):** Update `Catalog.test.tsx` to assert: each tile contains a `.meta` element with clock icon + duration string; empty state renders when no active forms exist.
- [ ] **Step 2:** Add a per-id duration lookup keyed by formId (`cluster-request` → "~3 min", etc.).
- [ ] **Step 3:** Render `.meta` row in each tile with `<Icons.clock>` + duration string.
- [ ] **Step 4:** Render empty state (32px `<Icons.form>` + text) when `state.forms.filter(f => f.status === 'active').length === 0`.
- [ ] **Step 5:** Run tests; commit `add catalog meta row and empty state`.

## Task 7: RequestsList restoration

- [ ] **Step 1 (TEST FIRST):** Update `RequestsList.test.tsx` to assert: 3 tabs render for admin (Mine / Department / All) with count badges; toolbar with Export CSV + New request; table has 9 columns; environment cell color-codes; "Showing X of Y" counter updates with filter.
- [ ] **Step 2:** Add tab state (`activeTab: 'mine' | 'department' | 'all'`). Compute counts per tab.
- [ ] **Step 3:** Render the 3 tabs above the chip row (operator only sees "Mine").
- [ ] **Step 4:** Add toolbar: Export CSV ghost (info toast), New request primary (→ catalog).
- [ ] **Step 5:** Expand the table to 9 columns: Number, Cluster, Department, Environment, Nodes, Requester, Status, Submitted, Open chevron.
- [ ] **Step 6:** Color-code Environment cell via inline `style={{ color: envColor(r.env) }}` (production red, staging amber, development green).
- [ ] **Step 7:** Add `<Icons.filter>` next to the chip row and a `<small>` "Showing X of Y" counter to the right.
- [ ] **Step 8:** Run tests; commit `restore requests list tabs and full table`.

## Task 8: RequestDetail header + pipeline header

- [ ] **Step 1 (TEST FIRST):** Update `RequestDetail.test.tsx` to assert: header title "Cluster {clusterName} · {orgName}"; subtitle "Submitted by {fullName}"; Pipeline section has "Provisioning Pipeline" + Live/Completed/Failed pill + progress bar; Cluster Access panel hidden when not ready, renders `<dl>` rows when ready; Download kubeconfig button enabled iff `status === "ready"`.
- [ ] **Step 2:** In `RequestDetail.tsx`, render the new `.page-head` row with StatusPill + mono id + actions (Back / Open in Gitea / Approve / Download kubeconfig).
- [ ] **Step 3:** Compose title from `r.vars.clusterName` + `state.orgs.find(...)?.fullName`.
- [ ] **Step 4:** Add Pipeline section header with title, status pill, overall progress bar showing `r.progress`%.
- [ ] **Step 5:** Gate Cluster Access panel by `r.status === 'ready'`. When ready, render `<dl>` rows for API URL / Console URL / OpenShift Version (with synthesized fallbacks).
- [ ] **Step 6:** Run tests; commit `restore request detail header and pipeline section`.

## Task 9: Approvals page-head + queue row + reject guard

- [ ] **Step 1 (TEST FIRST):** Update `Approvals.test.tsx` to assert: 3 KPI tiles in page-head; queue row shows failing-checks badge / requester name / colored env; DecisionPanel header has StatusPill + cluster hero; chain labels are "Department lead → Platform admin (you) → Provisioning pipeline"; Reject button disabled with empty comment.
- [ ] **Step 2:** Add 3 KPI tiles in `Approvals.tsx` page-head (in-queue / approved-today / rejected-today; the latter two driven by `decidedThisSession`).
- [ ] **Step 3:** In each pending-queue row, render failing-checks badge (when applicable) + requester display name + colored env cell.
- [ ] **Step 4:** In `DecisionPanel.tsx`, add a header with StatusPill + "Cluster {clusterName}" hero. Inline justification as `<blockquote>` below payload (drop separate Justification card).
- [ ] **Step 5:** Update the chain labels.
- [ ] **Step 6:** Disable Reject button when `comment.trim() === ''`. Update `commitReject` precondition.
- [ ] **Step 7:** Run tests; commit `restore approvals queue header and decision panel`.

## Task 10: NewRequest "What happens next" sidebar + Kafka topic

- [ ] **Step 1 (TEST FIRST):** Update `GenericRequest.test.tsx` to assert: sidebar with text "What happens next" exists; cluster-request shows 6 numbered steps; Kafka-topic footer with shield icon and topic text exists.
- [ ] **Step 2:** Add the sidebar block below `PayloadPreview`. Use a `getNextSteps(formId)` helper to return 6-step (cluster) or 5-step (other) lists.
- [ ] **Step 3:** Add the Kafka-topic footer row.
- [ ] **Step 4:** Run tests; commit `add new-request next-steps sidebar`.

## Task 11: Admin Forms restoration

- [ ] **Step 1 (TEST FIRST):** Update `NewFormPage.test.tsx` to assert: 3 sub-tabs (Definition/Fields/Template); switching to Fields shows the editable list; Create persists drafts via ADD_FORM + UPDATE_FIELD + UPDATE_TEMPLATES.
- [ ] **Step 2:** Refactor `NewFormPage.tsx` to host all 3 sub-tabs. Reuse `FieldsTable.tsx` and `TemplateEditor.tsx` in draft mode (operating on local state until Create).
- [ ] **Step 3:** Add Submissions column to `Forms.tsx` Forms tab.
- [ ] **Step 4:** Add Reload-from-Git + Save-changes buttons in `FormEditor.tsx` header. Wire to info toasts.
- [ ] **Step 5:** Add "Add field" button at the bottom of `FieldsTable.tsx`. Append a new editable field on click.
- [ ] **Step 6:** Add "MongoDB document shape (preview)" block below `FieldsTable.tsx` (with `<pre>` showing `{vars: {...}, meta: {...}}` derived from the field set).
- [ ] **Step 7:** Add the info banner in `TemplateEditor.tsx` ("Templates are reconciled by Camel and committed to Git on approval.").
- [ ] **Step 8:** Add line counter and Download-all button in TemplateEditor.
- [ ] **Step 9:** Update `Forms.test.tsx`, `FormEditor.test.tsx`, `FieldsTable.test.tsx`, `TemplateEditor.test.tsx`, `NewFormPage.test.tsx`.
- [ ] **Step 10:** Run tests; commit `restore admin forms affordances`.

## Task 12: Admin Users restoration

- [ ] **Step 1 (TEST FIRST):** Update `UserEditor.test.tsx`, `NewUserPage.test.tsx`, `NewGroupPage.test.tsx` for the new affordances.
- [ ] **Step 2:** Add `.user-banner` block at the top of `UserEditor.tsx` with initials avatar + fullName + `username · email`.
- [ ] **Step 3:** Convert role and status inputs to radio-cards.
- [ ] **Step 4:** Add "Disable account" red ghost button at the editor footer.
- [ ] **Step 5:** Add role-description info banner in `NewUserPage.tsx`.
- [ ] **Step 6:** Add "Initial credentials" subsection (invite-email toggle + help text) in NewUserPage.
- [ ] **Step 7:** Convert ManagedClusterSet input in `NewGroupPage.tsx` to `<select>` with seeded options.
- [ ] **Step 8:** Update the "Resources that will be created" preview to four lines.
- [ ] **Step 9:** Run tests; commit `restore admin users affordances`.

## Task 13: TweaksPanel a11y

- [ ] **Step 1 (TEST FIRST):** Update `TweaksPanel.test.tsx` to assert: theme select is focused on open; Escape closes the panel and returns focus to the trigger; Tab cycle stays within the panel.
- [ ] **Step 2:** Add `useRef<HTMLSelectElement>` for the theme select; in `useEffect`, focus on open.
- [ ] **Step 3:** Capture the `document.activeElement` before open in a ref; on close, return focus to it.
- [ ] **Step 4:** Add an Escape `keydown` listener (window-scoped while open) that calls `onClose`.
- [ ] **Step 5:** Implement focus trap: capture Tab and Shift+Tab inside the panel; if focus would leave, redirect to first/last focusable.
- [ ] **Step 6:** Run tests; commit `complete tweaks panel a11y`.

## Task 14: nodepool template rename

- [ ] **Step 1:** In `defaultTemplates.ts`, rename the `scale-request` template's filename from `nodepool.yaml` to `nodepool-patch.yaml`.
- [ ] **Step 2:** Update any test assertion referencing the old filename.
- [ ] **Step 3:** Run tests; commit `rename scale-request template to nodepool-patch.yaml`.

## Task 15: Foundations cleanup

- [ ] **Step 1:** Locate the reference handoff bundle's `styles.css` (extracted at `/tmp/gdfkube-design/gdfkube-remix/project/styles.css` from prior work, or re-extract the bundle if missing). For each audit-flagged "unstyled" landmark class (24 listed in tasks.md §15.1), grep the reference CSS for the class definition.
- [ ] **Step 2:** Replicate each found rule into the impl's `styles.css`, grouped under `/* === Landmark classes restored by fix-itsm-portal-design-drift === */` at the bottom. Where a reference rule depends on surrounding-context selectors that don't exist in the impl's DOM, adapt the selector chain to match the impl's structure (the goal is visual parity, not byte-for-byte copy).
- [ ] **Step 3:** For any class where the reference does not define a rule (e.g. impl-only additions like `.field-error`), add a small invented rule that fits the existing palette / typography tokens.
- [ ] **Step 4:** Remove the duplicate `@keyframes pulse` at `styles.css:834`.
- [ ] **Step 5:** Run typecheck/test/lint/build. Visual smoke: `npm run dev`, browse every page, confirm no regression vs Task 14's state and that the previously-dead landmark blocks now have visible chrome. Commit `restore landmark CSS per reference; dedupe keyframes`.

## Task 16: Spec validation

- [ ] **Step 1:** Run `openspec validate fix-itsm-portal-design-drift --json` and confirm it returns valid.
- [ ] **Step 2:** If any spec file has invalid format (e.g. missing scenarios), fix and re-validate.

## Task 17: Verify and finishing

- [ ] **Step 1:** Run `npm run typecheck && npm run test && npm run lint && npm run build` from `gdfkube-src/gdfkube-itsm`. Confirm all green.
- [ ] **Step 2:** Run `openspec validate --all --json` from repo root. Confirm valid.
- [ ] **Step 3:** Produce `verify.md` (auto-fallback if `openspec-verify-change` skill unavailable).
- [ ] **Step 4:** Run `superpowers:finishing-a-development-branch` to merge / open PR / cleanup the worktree.

---

**Verification before merge:** every spec scenario in `specs/**/spec.md` is exercised by at least one Vitest assertion. Coverage target: maintain ≥80% lines on `src/**` excluding `src/data/**`. Total test count expected ~290 (+20 from current 270 baseline).
