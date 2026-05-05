## Design Summary

Fix the design-fidelity regressions identified in `/.tmp/REPORT-ISSUES.md` (audit dated 2026-05-05). The audit found 109 distinct findings against the Claude Design handoff bundle (`UM8oI594JuuCpxaNBVoITA`): 12 P0 (broken / missing core behavior), 36 P1 (clear regressions), 31 P2 (visible drift), and 30 P3 (nits / a11y / minor naming). Most of the visual fidelity loss traces back to a single root cause — `App.tsx` wraps the app in unstyled `.app-shell > .shell > .main-col` shells when the original `.app` CSS Grid layout (`grid-template-areas: utility / sidebar / topbar / main`) and `[data-density="compact"]` selector are already defined in `styles.css`. With the wrong wrapper class, ~50 reference CSS rules silently go dead.

This change restores design parity for the items the audit flagged, **except** for items that conflict with deliberate prior decisions in the original `build-itsm-portal` change. Conflicts were resolved in advance via a series of explicit AskUserQuestion checkpoints — see Key Decisions below.

## Alternatives Considered

### Option A: Per-page rebuild against the reference handoff
- **Approach**: Treat each page (Dashboard, Catalog, RequestsList, RequestDetail, Approvals, admin Forms, admin Users, NewRequest, TweaksPanel) as a from-scratch rewrite from the reference JSX, replacing the implementation files wholesale.
- **Pros**: Maximum design parity; easiest to reason about per page.
- **Cons**: Huge churn; loses ~30 a11y improvements added during the original code-review cycles; would require rewriting ~270 tests; throws away every reducer-driven behavior the spec mandates (Approve/Reject dispatching, generic dynamic form runner, etc.).
- **Why not chosen**: Conflicts with the preserved spec contracts (Approve/Reject dispatch, GenericRequest schema-as-contract, derived sidebar badge) that the user explicitly chose to keep.

### Option B: Targeted remediation against the audit's severity tiers
- **Approach**: Land fixes in tiers — P0 first to restore the layout shell + page-level affordances, then P1 to address clear regressions, then P2 for visible drift, P3 for nits. Reuse existing CSS rules already in `styles.css`; preserve every conflict-resolved decision; update tests in tandem.
- **Pros**: Minimal blast radius per task; existing reducer / data-context / a11y wins survive; CSS already exists for nearly every "unstyled" class the audit flagged; tests can be updated alongside their corresponding component.
- **Cons**: ~80 distinct touchpoints across the impl + tests; some tests "encode drift" and need explicit updates; sequencing matters because the layout-shell fix at the top will surface CSS-coverage issues across every page below.
- **Why not chosen**: Chosen — see Agreed Approach.

### Option C: P0 only, defer the rest as follow-ups
- **Approach**: Fix only the 12 P0 items; archive the audit; open follow-up changes per cluster of findings.
- **Pros**: Tightest blast radius; fastest path back to a working baseline.
- **Cons**: Leaves ~97 known regressions in `main`; the audit explicitly notes that several P1/P2 items (filter chip set, queue header KPIs, decision-panel header drift, NewRequest "What happens next" sidebar) materially affect the demo's narrative coherence. The user explicitly chose the broader scope.
- **Why not chosen**: User selected "all items" with conflict-resolution per-question.

## Agreed Approach

**Option B — targeted remediation across all four severity tiers**, with the following adjustments per the user's conflict resolutions:

- **In-scope**: every audit finding that does not contradict a deliberate prior decision (see Key Decisions below).
- **Out-of-scope** (will-not-fix, with rationale recorded in design.md):
  - P0 #3, #4 — Tweaks panel host postMessage protocol + `twk-*` floating panel + drag positioning. The original change's design.md §D10 chose `localStorage` deliberately. Confirmed by user.
  - P1 — Form-id slug rewrite reversal. The current `cluster-request` / `scale-request` / `namespace-request` slugs are spec-faithful. Confirmed.
  - P1 — CatalogItem full per-tile shape (`{title, desc, icon, meta}`). Current minimal `{formId, featured?}` + per-id lookup map is spec-faithful and supports the "unknown form id falls back to generic chrome" scenario.
  - P2 — Approve/Reject local-only behavior. Current dispatch-based behavior is mandated by `itsm-approvals-queue/spec.md` scenarios.
  - P2 — `vars.memQuota` reversion. The impl fixed a ref bundle inconsistency; the field key and template token now agree on `memQuotaGi`.
  - P2 — PipelineStage `id` → `key` rename. TypeScript-idiomatic naming kept.
  - P3 — A11y improvements (button-ize nav rows, `role="status"` on toast, `role="radio"` on radio cards, OverrideModal focus + escape, Recent-Requests row keyboard support, Sidebar nav buttons). All accepted impl-better-than-ref deltas.
  - P3 — My Requests sidebar badge derived count vs hardcoded 3. Derived stays.
- **Reverted to ref despite previous deliberate choice**:
  - P3 — `scale-request` template filename `nodepool.yaml` → `nodepool-patch.yaml`. The original plan's rename was cosmetic; user chose ref alignment.

The fix is staged across roughly 12 work clusters: layout shell → StatusPill → Dashboard → RequestsList → RequestDetail → Approvals → NewRequest / GenericRequest → Admin Forms (FormsTable / FormEditor / FieldsTable / TemplateEditor / NewFormPage) → Admin Users (UserEditor / NewUserPage / NewGroupPage) → TweaksPanel a11y → Foundations (animation duration default, env default, group fallback, JSX class names, dead CSS pruning) → Scale-template rename. Each cluster commits independently.

## Key Decisions

1. **Layout shell first.** Replace `.app-shell > .shell > .main-col` with the reference `.app` CSS-grid layout. This unblocks ~50 unstyled-class warnings cascade-style and is the highest-value single fix.
2. **Pulse animation duration baseline `1.4s`.** Change the `--anim-duration` default from `4s` to `1.4s` and recompute the `pipelineSpeed` formula so `speed=1` yields `1.4s`, `speed=2` yields `0.7s`. Update Pipeline tests.
3. **Form runtime fixes are functional, not cosmetic.** Default `env` from `'production'` to `'development'`. Drop the hardcoded `'saude'` group fallback in GenericRequest's submit handler. Render inline `validateField` errors below each field. Seed default values for select (first option), number (`min`), checkbox (`false`).
4. **StatusPill realignment.** Drop the `pill-<status>` class output (no CSS exists for it); emit only `pill <tone>` so the existing `.pill.green/.amber/.blue/.red` rules engage. Add the missing `pending`, `healthy`, `degraded` cases. Update labels to ref ("Awaiting approval" not "Approval pending").
5. **Test-suite churn is part of the scope.** ~10 test files encode drift items (`Catalog.test.tsx:55,117`; `Dashboard.test.tsx:114-134,205,220`; `RequestsList.test.tsx:154-158`; `RequestDetail.test.tsx:87-105`; `Approvals.test.tsx:286-303,305-350`; `Forms.test.tsx:125-130`; `Users.test.tsx:160-168`). Each fix updates its tests in the same commit.
6. **Tweaks panel keeps the localStorage protocol but gains the audit-flagged a11y items** (focus trap, return-focus on close, Escape handler) without rebuilding to the `twk-*` style.
7. **Spec updates accompany code changes.** Decisions 1–6 require small spec edits (StatusPill labels, animation baseline, env default, inline error display). Each spec capability gets a delta commit so the verify step finds them.
8. **`scale-request` template renamed back to `nodepool-patch.yaml`** per the conflict resolution.

## Open Questions

All resolved before implementation begins. Decisions taken via AskUserQuestion checkpoints:

- **FormEditor "Reload from Git" + "Save changes" buttons**: fire info toasts (`"Reloaded from Git (demo)"` / `"Saved (demo)"`) on click. Existing reducer dispatches on field / definition edits continue to fire as today.
- **TemplateEditor Camel/Git reconcile banner**: static info row (no dismiss control).
- **Foundations cleanup CSS scope (Task 15.1)**: full visual styling per the reference handoff bundle (NOT minimal typography). Inspect each landmark class's reference CSS and replicate. Larger CSS diff (~300 lines) but closer visual parity.
- **Inline `validateField` error display**: `<small className="field-error">` directly below each input, red text via `var(--red-500)` (or equivalent if the token is unavailable).
