## Context

The merged `gdfkube-itsm` portal (commit `d5c2b3e` on `main`) implements every spec scenario in `openspec/changes/build-itsm-portal/specs/**/spec.md`, but a separate audit against the original Claude Design handoff bundle (`UM8oI594JuuCpxaNBVoITA`) found 109 fidelity regressions: 12 P0, 36 P1, 31 P2, 30 P3. The audit report is at `/.tmp/REPORT-ISSUES.md`. The audit's per-slice details are in `/.tmp/audit-results/auditor-{1..5}.md`.

This change remediates the regressions while preserving every deliberate spec decision the prior change made. Conflicts between audit recommendations and spec contracts were resolved up-front via a series of AskUserQuestion checkpoints; the resolutions are recorded as Decision D8 below ("Conflict resolutions").

The portal has 30 test files and 270 passing tests. The fix scope is large enough that test churn is itself a significant axis: ~30 existing assertions encode current-state drift and will need updates in the same commit as their fix, plus ~15 new assertions covering ADDED requirements.

## Goals / Non-Goals

**Goals:**
- Restore the `.app` CSS-Grid layout shell, unblocking ~50 dead reference CSS rules.
- Restore page-level affordances flagged by the audit (Dashboard banner + detail-grid + header CTA, RequestsList tabs + toolbar + 9 columns, RequestDetail header + pipeline header, Approvals queue KPIs + reject-comment guard, NewRequest "What happens next" sidebar, admin sub-tab affordances).
- Fix form-runtime functional bugs (env default `'production'` → `'development'`, hardcoded `'saude'` group fallback, missing seeded defaults, missing inline errors).
- Realign foundations (animation duration default `4s` → `1.4s`, StatusPill class set, missing CSS for landmark classes).
- Update each affected spec capability with a delta block so verify finds them.
- Update tests in the same commits as their corresponding component changes.

**Non-Goals:**
- Reverting the original `build-itsm-portal` change's deliberate decisions: localStorage-backed Tweaks panel (D10), suffixed form ids, minimal `CatalogItem` shape, dispatched Approve/Reject behavior, `vars.memQuotaGi` consistency, PipelineStage `id` naming, accepted a11y improvements, derived My Requests badge.
- Building the reference's host-iframe `postMessage` protocol or `twk-*` floating panel.
- Adding new capabilities; this is a remediation change.
- Changing the production build pipeline, CI workflow, or dependency versions.
- Introducing visual regressions outside the audit-flagged surface area.

## Decisions

### D1. Layout shell uses the existing `.app[data-density=...]` Grid
- **Choice**: Replace `<div className={app-shell density-${density} banner...}><div className="shell">…</div></div>` with `<div className="app" data-density={tweaks.density}>…</div>`.
- **Why**: `styles.css:87-126` already defines the entire `.app` Grid layout, the `[data-density="compact"]` selector at `:96`, and `:has(.sidebar.collapsed)` at `:126`. The implementation simply emits the wrong wrapper. Fixing the class name engages the entire reference layout.
- **Consequence**: ~50 audit-flagged "unstyled JSX classes" go from dead to live without any new CSS.
- **Banner toggle**: rename the `banner` class on the wrapper to a non-conflicting modifier (e.g. `with-banner`) to avoid stomping on the page-level `.banner` rule used by Dashboard.

### D2. Pulse animation baseline `1.4s`, formula `1.4 / pipelineSpeed`
- **Choice**: Update `styles.css:567` `--anim-duration` fallback from `4s` to `1.4s`. Update `Pipeline.tsx` to set `--anim-duration: ${1.4 / pipelineSpeed}s` on the active stage.
- **Why**: Reference uses literal `1.4s`; the current formula yields 4s/2.0s/8s for speeds 1/2/0.5 — 3× slower than designed. The `pipelineSpeed` tweak still scales inversely; only the absolute duration changes.
- **Tests touched**: `Pipeline.test.tsx` (new expected values), `RequestDetail.test.tsx` (assert ratio).

### D3. StatusPill emits only `pill <tone>`
- **Choice**: Drop the `pill-<status>` class output. Emit `pill green` for `ready` / `healthy`, `pill amber` for `pending` / `provisioning` / `degraded`, `pill blue` for `approval`, `pill red` for `failed`. Update labels: `approval` → "Awaiting approval".
- **Why**: `styles.css:386-391` defines `.pill.green/.amber/.red/.blue` only. The `pill-<status>` classes are dead. Reference status set is broader (7 statuses) than the 4 currently exposed.
- **Trade-off**: tests asserting `pill-approval` need to assert `blue` (or `Awaiting approval` text). Behavior preserved.

### D4. GenericRequest functional fixes
- **Choice**:
  - `useState<FormValues>(seedDefaults(fields))` — first select option, `min` for number, `false` for checkbox.
  - `env` default `'development'` (was `'production'`).
  - Drop hardcoded `'saude'` group fallback in submit handler. Use only `user.group ?? user.username + "-default"` (the latter never triggers in practice because seeded users always have a group).
  - Render `validateField(field, values[field.key])` output below each invalid field as `<small class="field-error">`.
- **Why**: Reference parity for seeded defaults; `production` default is a real demo footgun; missing inline errors silently disable Submit without explanation.
- **Trade-off**: One spec scenario in `itsm-request-submission` ("missing required field disables submit") still passes because the button stays disabled; we just now render the per-field reason too.

### D5. Page-level layout fixes use existing CSS
- Dashboard renders `.banner` + `.detail-grid` (rules already exist).
- Catalog adds `.meta` row + empty state.
- RequestsList adds tabs + toolbar + filter icon (use existing `.tabs`, `.toolbar`, `.filter-icon` rules if present; else add minimal rules in `styles.css`).
- RequestDetail adds the header row using existing `.page-head` + `.page-head-row` if present.
- Approvals page-head adds 3 KPI tiles using existing `.kpi-grid` rule.

### D6. Admin affordance restoration is additive
- **Choice**: Each missing affordance is added without removing existing functionality. The Reload-from-Git and Save buttons in FormEditor are decorative for the demo (no backend), wired to a "Reloaded from Git (demo)" success toast on click.
- **Why**: Keeps the demo coherent; users see the buttons, get feedback, but no real Git fetch happens.
- **Trade-off**: A future change wiring real persistence will replace these with no-ops or real handlers.

### D7. TweaksPanel a11y completion (no protocol change)
- **Choice**: Keep the localStorage-backed protocol from the original D10. Add: focus first form control on open, focus trap (constrain Tab cycling within the panel), return focus to the trigger button on close, Escape closes.
- **Why**: WCAG baseline; matches the OverrideModal a11y pattern already in place. Avoids the heavy host-iframe protocol rebuild.

### D8. Conflict resolutions (audit recommendations the user explicitly declined)
The user resolved the following audit-vs-spec conflicts via AskUserQuestion before this change was scaffolded:

| Audit recommendation | Decision | Rationale |
|---|---|---|
| Restore `twk-*` floating panel + host postMessage protocol | Keep localStorage | Original D10 was deliberate |
| Revert form ids `cluster-request` → `cluster` | Keep suffixed | Spec-faithful; broad rename otherwise |
| Restore full per-tile `CatalogItem` (`title`, `desc`, `icon`, `meta`) | Keep minimal `{formId, featured?}` | Per-id lookup map supports unknown-form fallback |
| Approve/Reject local-only (no dispatch) | Keep dispatch | Spec-mandated |
| `vars.memQuotaGi` → `vars.memQuota` | Keep `memQuotaGi` | Impl fixed a ref bundle bug |
| `PipelineStage.id` → `.key` | Keep `id` | TS-idiomatic |
| Revert a11y wins | Keep all wins | Strict superset of ref |
| My Requests badge derived → hardcoded `3` | Keep derived | Real-time, consistent with Approvals |
| `nodepool.yaml` → `nodepool-patch.yaml` | Revert to ref | Cosmetic; user chose ref alignment |

### D8b. CSS foundations: button resets, input selectors, layout-from-class
- **Choice**: All interactive elements rendered as `<button>` (nav items, menu items, tabs, radio-cards) apply CSS resets to eliminate native button chrome. Input field selectors explicitly list all used `type` attributes (`text`, `email`, `password`, `number`, `search`). Layout properties that were previously inline (`display: flex`, `border-bottom`, `padding`) are moved into class-based rules (`.template-tabs`, `.filters`). The `.var-row` uses CSS Grid with copy-button feedback.
- **Why**: Inline styles drift silently because they bypass the CSS class contract. Button elements without resets break in every browser upgrade. Missing input selectors cause inconsistent styling for email/password/search fields across the portal.
- **Consequence**: Density overrides via `[data-density="compact"]` selectors now apply uniformly because all spacing lives in CSS. New pages that reuse `.filters` or `.template-tabs` inherit correct spacing without redeclaring inline styles.
- **Trade-off**: Slightly larger `styles.css` (68 added lines); justified by eliminating per-component inline style maintenance.

### D9. Test churn pattern
- **Choice**: When a fix changes observable behavior (e.g. StatusPill class output, env default, header text), update its tests in the *same commit* as the fix. Do not split fix and test update.
- **Why**: Keeps history bisectable. A red commit in between would block git-bisect and confuse reviewers.

### D10. Spec deltas accompany code changes
- **Choice**: Each modified capability gets exactly one spec edit in the corresponding commit. Use `## ADDED Requirements` for net-new requirements (e.g. inline error display) and `## MODIFIED Requirements` for tightened existing ones (e.g. Cluster Access gating language). Use the OpenSpec scenarios DSL (Requirement / WHEN / THEN).
- **Why**: Verify (post-implementation) compares spec deltas against impl. Drift here is itself a future audit finding.

## Risks / Trade-offs

- **Risk: layout shell change cascades into ~30 visual regressions across pages already shipped.** *Mitigation*: each page's tests already assert against semantic landmarks (`getByRole`, `getByText`), not wrapper classes. Manual visual smoke-check after the layout fix lands.
- **Risk: pulse animation duration change breaks tests asserting specific values.** *Mitigation*: Pipeline tests assert ratios, not absolute values; only the active-stage style assertion needs updating.
- **Risk: StatusPill class realignment breaks `pill-<status>` selector use elsewhere.** *Mitigation*: grep confirms `pill-<status>` is only emitted, never read by other code; the rename is local.
- **Risk: env default change from `'production'` to `'development'` lands during a demo and surprises someone.** *Mitigation*: this matches the reference; the change is a one-line default in GenericRequest and is mentioned in CHANGELOG-style summary.
- **Risk: admin affordance additions overflow file-size targets.** *Mitigation*: original code-review caps stand (FieldsTable ≤270 lines, NewFormPage ≤150 lines). Decompose into smaller subcomponents if needed.
- **Trade-off: the `nodepool.yaml` → `nodepool-patch.yaml` rename is cosmetic but generates 1 commit + 1 test diff. Accepted to honor user choice.**
- **Trade-off: keeping the dispatched Approve/Reject behavior means the audit's recommendation is recorded as "won't fix" rather than implemented. The proposal makes this explicit.**
- **Trade-off: not building the host postMessage protocol leaves the reference's iframe edit-mode integration unimplemented. This was always out of scope per the original D10 — repeated here for clarity.**

## Migration Plan

This is an in-place fix, not a migration. No data files, no manifests, no schema changes. Existing user state in `localStorage["gdfkube.tweaks"]` remains valid.

**Sequence** (each commit independently green per `npm run typecheck && npm run test && npm run lint && npm run build`):

1. Layout shell (`App.tsx` wrapper + tests).
2. Animation duration baseline (`styles.css` + `Pipeline.tsx` + tests).
3. StatusPill realignment (component + tests using it).
4. GenericRequest functional fixes (component + tests).
5. Dashboard restoration (component + tests).
6. Catalog restoration.
7. RequestsList restoration.
8. RequestDetail header + pipeline header.
9. Approvals page-head KPIs + queue row + reject-comment guard.
10. NewRequest "What happens next" sidebar + Kafka topic footer.
11. Admin Forms (FormsTable / FormEditor / FieldsTable / TemplateEditor / NewFormPage).
12. Admin Users (UserEditor / NewUserPage / NewGroupPage).
13. TweaksPanel a11y.
14. `nodepool.yaml` → `nodepool-patch.yaml`.
15. Foundations cleanup (dead-CSS rules, missing landmark classes).
16. Spec deltas (one commit per modified capability).
17. Verify + retrospective.

## Open Questions

None. All conflicts resolved up-front. Four implementation-detail ambiguities resolved via AskUserQuestion after artifacts were produced:

- FormEditor Reload-from-Git / Save-changes buttons → info toasts on click.
- TemplateEditor Camel/Git reconcile banner → static info row.
- **Foundations cleanup CSS scope** → full visual styling per reference (broader than the original "minimal typography/spacing" intent). Updates Task 15 — see tasks.md and plan.md.
- Inline error display → `<small className="field-error">` below the input, red text.
