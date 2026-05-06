## 1. Layout shell

- [x] 1.1 Replace `App.tsx` wrapper class chain `app-shell > shell > main-col` with `<div className="app" data-density={tweaks.density}>` engaging the existing `.app` Grid layout in `styles.css:87-126`.
- [x] 1.2 Rename the demo-banner modifier on the wrapper from `banner` to `with-banner` (or drop entirely, applying via a sibling element) so it does not stomp on the page-level `.banner` rule used by Dashboard.
- [x] 1.3 Remove the floating "Tweaks" button at `position:fixed; right:16px; bottom:16px;` if it conflicts with the `.app` Grid; reposition into the topbar or keep absolute as long as it doesn't overlap content.
- [x] 1.4 Update `App.test.tsx` to assert `document.querySelector(".app")` exists and has `data-density="compact"` after first mount.

## 2. Pulse animation duration baseline

- [x] 2.1 Update `styles.css:567` `--anim-duration` fallback from `4s` to `1.4s`.
- [x] 2.2 Update `Pipeline.tsx` to set `--anim-duration: ${1.4 / pipelineSpeed}s` (currently `4 / pipelineSpeed`).
- [x] 2.3 Update `Pipeline.test.tsx` and `RequestDetail.test.tsx` to assert the new values: `1.4s` at speed 1, `0.7s` at speed 2.

## 3. StatusPill realignment

- [x] 3.1 In `StatusPill.tsx`, drop the `pill-<status>` class output. Emit `pill green` for `ready` / `healthy`, `pill amber` for `pending` / `provisioning` / `degraded`, `pill blue` for `approval`, `pill red` for `failed`.
- [x] 3.2 Update labels: `approval` → "Awaiting approval" (was "Approval pending").
- [x] 3.3 Add the missing statuses (`pending`, `healthy`, `degraded`) to `RequestStatus` if needed (or keep them as a status-pill-only union if no Request actually carries them).
- [x] 3.4 Update tests asserting `pill-approval` / `pill-provisioning` to assert the tone class instead.

## 4. GenericRequest functional fixes

- [x] 4.1 Compute `seedDefaults(fields)` and pass to initial `useState`: select → first parsed option's `value`; number → `field.min ?? ''`; checkbox → `false`; text/textarea → `''`.
- [x] 4.2 Change submit-handler default for `env` from `'production'` to `'development'` when no `environment` field exists.
- [x] 4.3 Drop the hardcoded `'saude'` group fallback. Use only `user.group ?? user.username + '-default'`.
- [x] 4.4 Render `validateField(field, values[field.key])` output below each invalid field as `<small className="field-error">`.
- [x] 4.5 Update `GenericRequest.test.tsx` to cover: seed defaults visible in PayloadPreview at first render; inline error appears below an invalid field; env defaults to development when no environment field exists.

## 5. Dashboard restoration

- [x] 5.1 In `Dashboard.tsx`, render the pipeline-health card with `<div className="banner">` instead of `<div className="card">`.
- [x] 5.2 Wrap the Recent Requests + Activity Stream cards in `<div className="detail-grid">`.
- [x] 5.3 Add a `.page-head-row` containing the title plus a primary "New cluster request" button (operator role only) navigating to `new-request` with `formId: "cluster-request"`.
- [x] 5.4 Add a "View all" ghost button in the Recent Requests card header navigating to `requests`.
- [x] 5.5 Add a "Refresh" ghost button in the Activity Stream card header (decorative — show a brief icon spin or info toast).
- [x] 5.6 Render Submitted column as `r.submittedAt.split(' ')[1]` (time only) with the full timestamp as the cell `title`.
- [x] 5.7 Update `Dashboard.test.tsx` for the banner class, detail-grid layout, header CTA, View-all button, and time-only Submitted format.

## 6. Catalog restoration

- [x] 6.1 Add `.meta` row to each tile with `<Icons.clock>` + a duration string (cluster: "~3 min", namespace: "~30 sec", scale: "~1 min", unknown: "Self-service · varies").
- [x] 6.2 Add an empty-state block (32px form icon + "No active forms.") when no active forms exist.
- [x] 6.3 Update `Catalog.test.tsx` for the meta row presence and the empty state.

## 7. RequestsList restoration

- [x] 7.1 Add three tabs ("Mine" / "Department" / "All") with count badges. Operator sees only "Mine".
- [x] 7.2 Add a toolbar above the table: "Export CSV" ghost (decorative info toast) + "New request" primary (→ `catalog`).
- [x] 7.3 Expand the table from 5 to 9 columns: Number, Cluster (`vars.clusterName ?? formLabel`), Department, Environment (color-coded), Nodes, Requester, Status, Submitted (time only), Open chevron link.
- [x] 7.4 Add a `<Icons.filter>` icon adjacent to the chips and a "Showing X of Y" counter to the right.
- [x] 7.5 Color-code the Environment cell (production red, staging amber, development green).
- [x] 7.6 Update `RequestsList.test.tsx` for tabs, toolbar, full column set, env color, counter.

## 8. RequestDetail header + pipeline header

- [x] 8.1 Render a `.page-head` row containing StatusPill + mono request id + actions row (Back / Open in Gitea / Approve / Download kubeconfig).
- [x] 8.2 Compose the title as "Cluster {clusterName} · {orgName}" with subtitle "Submitted by {requester.fullName}".
- [x] 8.3 Add the Pipeline section header: title "Provisioning Pipeline", a status pill (Live / Completed / Failed; hidden when `approval`), and an overall `progress-bar` showing `r.progress`%.
- [x] 8.4 Gate the Cluster Access panel by `status === "ready"`: when not ready, do not render the panel at all (no disabled placeholder).
- [x] 8.5 When ready, render the Cluster Access content as a `<dl>` with API URL / Console URL / OpenShift Version rows. Synthesize fallbacks if the request lacks the values.
- [x] 8.6 Update `RequestDetail.test.tsx` for the new header, pipeline header, and gated Cluster Access (test both branches: not-ready hides; ready renders dl rows).

## 9. Approvals page-head + queue row + reject guard

- [x] 9.1 In `Approvals.tsx` page-head, add three KPI tiles: "In queue" / "Approved today" / "Rejected today".
- [x] 9.2 In each pending-queue row, render a failing-checks badge when any `policyChecks.ok === false`, the requester's `fullName ?? username`, and a colored env cell.
- [x] 9.3 In `DecisionPanel.tsx`, add a header containing StatusPill + "Cluster {clusterName}" hero. Inline the justification as a `<blockquote>` directly below the payload card; remove any separate "Justification" card.
- [x] 9.4 Update the 3-step approval-chain labels to "Department lead → Platform admin (you) → Provisioning pipeline".
- [x] 9.5 Disable the Reject button while `comment.trim() === ''`. Update tests.
- [x] 9.6 Update `Approvals.test.tsx` for the KPI tiles, queue-row affordances, decision-panel header, chain labels, and reject-comment guard.

## 10. NewRequest "What happens next" sidebar + Kafka topic

- [x] 10.1 Add a sidebar block below `PayloadPreview` titled "What happens next". For `cluster-request`: 6 numbered steps (Submit → MongoDB → Debezium → Kafka → Camel → Git → ArgoCD). For other forms: 5 steps (omitting MongoDB-Debezium intermediate).
- [x] 10.2 Add a footer row with `<Icons.shield>` and the text "Routed via Kafka topic dbz.gdfkube.requests".
- [x] 10.3 Update `GenericRequest.test.tsx` for the sidebar's existence and step count.

## 11. Admin Forms restoration

- [ ] 11.1 Promote `NewFormPage.tsx` to expose Definition / Fields / Template sub-tabs (matching FormEditor). On Create, dispatch ADD_FORM, then UPDATE_FIELD per draft field, then UPDATE_TEMPLATES for draft templates.
- [ ] 11.2 Add a "Submissions" column to `Forms.tsx` (Forms tab table). Sort numerically when clicked.
- [ ] 11.3 Add "Reload from Git" ghost + "Save changes" primary buttons in `FormEditor.tsx` header. Both wire info toasts ("Reloaded from Git (demo)" / "Saved (demo)").
- [ ] 11.4 Add an "Add field" button at the bottom of `FieldsTable.tsx`. Clicking appends a new editable field row.
- [ ] 11.5 Add a "MongoDB document shape (preview)" block below `FieldsTable.tsx` showing JSON of `{vars, meta}` derived from the current field set.
- [ ] 11.6 Add an info banner in `TemplateEditor.tsx` reading "Templates are reconciled by Camel and committed to Git on approval."
- [ ] 11.7 Add a line-count caption next to each file's name in `TemplateEditor.tsx`.
- [ ] 11.8 Add a "Download all" ghost button in the editor header that triggers a synthesized blob download with `--- {filename} ---` separators.
- [ ] 11.9 Update `Forms.test.tsx`, `FormEditor.test.tsx`, `FieldsTable.test.tsx`, `TemplateEditor.test.tsx`, `NewFormPage.test.tsx` accordingly.

## 12. Admin Users restoration

- [ ] 12.1 In `UserEditor.tsx`, render a `.user-banner` block at the top with initials avatar + fullName + `username · email`.
- [ ] 12.2 Convert the role and status inputs to radio-cards (operator / approver / admin / service for role; active / disabled for status). Keyboard activatable.
- [ ] 12.3 Add a red "Disable account" ghost button at the bottom of the UserEditor.
- [ ] 12.4 In `NewUserPage.tsx`, add a role-description info banner.
- [ ] 12.5 In `NewUserPage.tsx`, add an "Initial credentials" subsection with the "Send invite email" toggle (default checked) and help text.
- [ ] 12.6 Convert the ManagedClusterSet input in `NewGroupPage.tsx` to a `<select>` with options `default`, `production`, `staging`, `internal`.
- [ ] 12.7 Update the "Resources that will be created" preview to four lines: Keycloak group / AppProject / ManagedClusterSetBinding / Git repo.
- [ ] 12.8 Update `Users.test.tsx`, `UserEditor.test.tsx`, `NewUserPage.test.tsx`, `NewGroupPage.test.tsx` accordingly.

## 13. TweaksPanel a11y

- [ ] 13.1 In `TweaksPanel.tsx`, focus the first form control (theme `<select>`) on open via `useEffect` + `useRef`.
- [ ] 13.2 Trap Tab cycling within the panel: capture Tab and Shift+Tab in a `keydown` handler scoped to the panel; if focus would leave the panel, redirect to the first/last focusable element.
- [ ] 13.3 Capture and restore the `document.activeElement` from before open; on close call `previousFocus.current?.focus()`.
- [ ] 13.4 Add an Escape `keydown` listener on the panel that calls `onClose()`.
- [ ] 13.5 Update `TweaksPanel.test.tsx` to cover the first-control-focus, escape-closes, and return-focus paths.

## 14. nodepool template rename

- [ ] 14.1 In `defaultTemplates.ts`, rename the `scale-request` template's filename from `nodepool.yaml` to `nodepool-patch.yaml`.
- [ ] 14.2 Update any test or doc reference to the old filename.

## 15. Foundations cleanup

- [ ] 15.1 Add **full visual styling per the reference** in `styles.css` for the audit-flagged "unstyled" landmark classes the implementation emits: `.page-placeholder`, `.payload-preview`, `.fields-table`, `.cell-input`, `.drag-handle`, `.template-tabs`, `.vars-panel`, `.vars-group`, `.kv`, `.subtabs`, `.approval-step-head`, `.approval-chain`, `.new-form-page`, `.new-user-page`, `.new-group-page`, `.new-request-page`, `.sessions`, `.row-form-id`, `.row-group-id`, `.row-source-form-id`, `.menu-check`, `.toast-icon`, `.toast-close`, `.user-banner`, `.field-error`. Inspect `/.tmp/handoff/gdfkube-remix/project/styles.css` (or whichever path the reference handoff is extracted to) for each class and replicate its rules. Where the reference defines the class with surrounding-context-dependent rules, adapt to the impl's DOM structure. Aim for visual parity, not blind copy.
- [ ] 15.2 Remove the duplicate `@keyframes pulse` at `styles.css:834` (kept the one at `:570`).
- [ ] 15.3 Confirm no other call sites reference the dead `pill-<status>` class names.

## 16. Spec deltas

- [ ] 16.1 Verify each delta spec under `openspec/changes/fix-itsm-portal-design-drift/specs/<capability>/spec.md` validates via `openspec validate fix-itsm-portal-design-drift`.

## 17. Verify and finishing

- [ ] 17.1 Produce `verify.md` after all tasks complete (all `- [x]`); confirm `npm run typecheck && npm run test && npm run lint && npm run build` are green; confirm `openspec validate --all --json` returns valid.
- [ ] 17.2 Run `superpowers:finishing-a-development-branch` to merge / PR / cleanup the worktree.
