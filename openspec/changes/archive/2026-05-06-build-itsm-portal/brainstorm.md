## Design Summary

Build the **gdfkube ITSM Portal** as a self-service web frontend for operators across government departments to request OpenShift cluster provisioning, scale changes, and namespace onboarding through a GitOps-driven CDC pipeline (Form → MongoDB → Debezium → Kafka → Camel → Git → ArgoCD).

The design was validated iteratively in the Claude Design tool (handoff bundle `UM8oI594JuuCpxaNBVoITA`, six chat transcripts). The user (Hugo) drove the pruning and scope decisions; the design medium was an HTML/React/Babel prototype rendered from a `gdfkube ITSM Portal.html` shell that wires together small JSX modules (`shell`, `dashboard`, `catalog`, `new-request`, `requests-list`, `request-detail`, `approvals`, `admin`, `data`, `icons`, `tweaks-panel`) and a single `styles.css` design system.

Visual identity: **government-formal** — navy/civic-blue palette, conservative typography (Inter Tight + JetBrains Mono + Source Serif 4), original (non-ServiceNow) iconography, dense data tables, status pills, breadcrumbs, role switcher.

Two roles: **Operator** (department user — submits requests) and **Platform Admin** (SETIC — approves, manages forms/users/groups). Persona switcher in the topbar swaps the seeded user (João Silva @ saude / Maria Costa @ setic) and gates Operations + Administration nav sections.

Seven primary screens:
1. **Home / Dashboard** — KPIs (Active Clusters / Pending Provisioning / Failed 30d), pipeline-health banner, Recent Requests table, Activity Stream.
2. **Service Catalog** — dynamic tile grid sourced from active forms in the admin registry; OpenShift Cluster tile is featured.
3. **New Request** — generic dynamic form runner driven by `GDF_ADMIN_DATA.fields[<formId>]`; supports rich select grammar (`value | label | description | dotColor`, `;`-separated), `displayAs: radio-cards`, `prefix` with `{token}` interpolation, and live `meta`/`vars` payload preview. The OpenShift Cluster form is **not** bespoke — it renders through the same generic runner using the admin schema.
4. **My Requests / All Requests** — tabbed list scoped by role (operator sees own; admin sees all), status filters, inline progress bars on `provisioning` rows.
5. **Request Detail** — animated 7-stage CDC pipeline (Form → MongoDB → Debezium → Kafka → Camel → Git → ArgoCD), Request Details panel, Approvals chain, Cluster Access (kubeconfig download). No raw manifests are shown to end users (per Hugo's review: "user does not need to see these artifacts").
6. **Approvals** (admin-only) — pending queue (left), filter chips (All / Production / Scale), decided-this-session log, decision detail (right) with policy/governance checks (PASS/WARN), justification, comment, Approve/Reject + override modal, 3-step approval-chain visualization.
7. **Administration** (admin-only) — split into **Forms** (Forms list + Form Fields global view, plus per-form editor with Definition / Fields / Template sub-tabs and multi-file YAML templates with `{{ meta.* }}` / `{{ vars.* }}` Go-template tokens) and **Users** (Users list + Groups list + per-user / per-group editors).

Submission flow: every new request lands at `status: "approval"` (never auto-`provisioning`) and shows up in the Admin Approvals queue. Only after approval does the pipeline advance through stages.

UI state surface (Tweaks panel, demo-only): theme (light/dark), density (compact/comfortable), sidebar collapse, pipeline animation speed, demo-banner toggle, role-switch shortcut.

## Alternatives Considered

### Option A: Recreate ServiceNow truthfully
- **Approach**: Mirror ServiceNow's UI patterns and visual language directly.
- **Pros**: Instant familiarity for users coming from existing ITSM tools; minimum design effort.
- **Cons**: ServiceNow's UI patterns, iconography, and visual identity are proprietary/branded; reproducing them creates trademark and copyright exposure for a government-stakeholder demo. The user's email domain doesn't authorize ServiceNow asset reuse.
- **Why not chosen**: Legal/brand risk and inappropriate for an open demo. The design assistant explicitly redirected away from this on first contact (chat1).

### Option B: Original government-portal aesthetic, generic dynamic form runner (CHOSEN)
- **Approach**: Build an original visual identity in the *genre* of enterprise ITSM (left rail, breadcrumbs, status pills, dense tables) with a navy/civic-blue government palette. Drive every screen — including the flagship OpenShift Cluster request — from a single admin-managed form schema (fields, validation, display variants, templates). Persona switcher gates admin features.
- **Pros**: No brand risk. Form changes propagate from Admin → Catalog → Request page automatically (no drift). One runner means one place to fix bugs. Government-formal feel matches the gdf.kube stakeholder. Aligns with project value: "we deeply value maintainability and driftless codebases".
- **Cons**: Slightly more upfront work to make `radio-cards`, `prefix`, and rich select grammar configurable rather than bespoke per form.
- **Why not chosen**: Chosen — explicitly selected by Hugo in chat5 ("Proceed with option #2 additive").

### Option C: Bespoke per-form components
- **Approach**: Hand-build a separate React component for each form (cluster, namespace, scale).
- **Pros**: Maximum visual flexibility per form.
- **Cons**: Drift between admin schema and rendered form (admin says one thing, form does another); duplicated layout/validation logic; every new form is a code change. Directly conflicts with the project's stated "no-drift" value.
- **Why not chosen**: Discarded in chat5 — Hugo explicitly asked the cluster form to come from the same generic runner so the admin tool is the single source of truth.

## Agreed Approach

**Option B**, as iteratively pruned by Hugo across 6 design-tool sessions. The final shape is the contents of `gdfkube-remix/project/` in the handoff bundle: a small set of JSX modules glued by `gdfkube ITSM Portal.html`, all behavior driven by `window.GDF_DATA` (seed clusters/requests) and `window.GDF_ADMIN_DATA` (forms + fields registry).

Key reductions from earlier iterations (do not reintroduce):
- No "Cluster Fleet" admin view (replaced by Forms/Users administration).
- No Generated Manifests card on Request Detail.
- No Pipeline Activity log card on Request Detail.
- No Insights section (Reports, Audit Log) in the sidebar.
- No Policies nav item.
- No "Knowledge Base" panel in Catalog.
- No catalog filter chips; only OpenShift Cluster is featured among active tiles.
- No Export / "My audit trail" / Documentation / Status page chrome.
- No Hub/Region in the utility band (just "operational" status + version).
- No `priority` field on requests.
- No estimated-cost row on approval detail.
- No "Quota: dept under 60% of cap" policy check.
- No redundant "New field" button on the Form Fields tab (field creation lives only inside per-form editor).

## Key Decisions

1. **Source of truth for forms = admin registry**. `Catalog`, `NewRequest`, and breadcrumbs all read live from `GDF_ADMIN_DATA.forms` and `GDF_ADMIN_DATA.fields`. Adding/disabling a form in Admin → Forms reflects immediately.
2. **Approval is mandatory.** New requests submit with `status: "approval"`, populated `justification` and `policyChecks`, and a "submitted for approval" toast — never auto-provisioning.
3. **Multi-file YAML templates per form**, edited as sub-tabs inside the form editor, with a System (auto-injected) variable group covering `meta.requestId`, `meta.correlationId`, `meta.requesterName`, `meta.requesterFullName`, `meta.requesterEmail`, `meta.requesterRole`, `meta.submittedAt`, `meta.formId`. Click-to-copy on every variable token.
4. **Rich field grammar in one place**. Field schema supports `displayAs: dropdown | radio-cards`, `prefix` (with `{fieldKey}` interpolation against sibling field values), `help` (same interpolation), and select options as `value | label | description | dotColor` separated by `;` (with `,` fallback for plain lists). Migration of `cluster-request` to this grammar is part of the demo's correctness.
5. **Drag-and-drop field reordering** via the `⋮⋮` handle on the per-form Fields editor (HTML5 drag API, visual drop indicator).
6. **Clipboard-write fallback** required: `navigator.clipboard.writeText` is unreliable in sandboxed iframes; copy buttons must use a `document.execCommand('copy')` fallback via a hidden textarea (chat6 fix).
7. **Demo-only Tweaks panel** persists across sessions; defaults: density compact, theme light, sidebarCollapsed false, pipelineSpeed 1, showDemoBanner true.
8. **Two seeded personas**: Operator João Silva (`joao.silva` @ saude), Admin Maria Costa (`m.costa` @ setic). Operators cannot navigate to admin-forms / admin-users / approvals routes; the App effect-redirects them home if the role flips.

## Open Questions

1. **Hosting target inside the gdfkube monorepo**: confirm the canonical location is `gdfkube-src/gdfkube-itsm/` per `CLAUDE.md` (the directory does not yet exist; `CLAUDE.md` declares it as the home for ITSM source).
2. **Production technology**: the prototype is React 18 + Babel-standalone in a single HTML file. Production should use a real build (Vite + React + TypeScript is the lowest-friction match for the prototype shape). Confirm before tasks lock that choice.
3. **Backend wire-up scope**: this proposal covers frontend recreation only. Real Mongo/Debezium/Kafka/Camel wiring already exists elsewhere (see `gdfkube-src/gdfkube-camel/`); whether to stub `GDF_DATA` / `GDF_ADMIN_DATA` from those services or keep them as in-memory seeds for v1 is a follow-up change.
