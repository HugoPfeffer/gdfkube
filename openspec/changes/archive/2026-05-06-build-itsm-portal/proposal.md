## Why

`gdfkube-src/gdfkube-itsm/` is declared in `CLAUDE.md` but does not yet exist. Government department operators currently have no self-service entry point to request OpenShift cluster provisioning, scale changes, or namespace onboarding through the existing Mongo → Debezium → Kafka → Camel → Git → ArgoCD pipeline; requests today bypass approvals and are kicked off out-of-band. The Claude Design handoff bundle `UM8oI594JuuCpxaNBVoITA` is a complete, iteration-validated frontend that closes this gap with a government-formal portal, a single admin-driven form schema (no per-form code drift), and a mandatory approval queue. Building it now lands the demo's headline UI before downstream backend wiring tightens.

## What Changes

**ITSM frontend module exists**
- From: `gdfkube-src/gdfkube-itsm/` is referenced in `CLAUDE.md` but is missing on disk.
- To: `gdfkube-src/gdfkube-itsm/` contains a buildable React 18 + TypeScript + Vite app reproducing the design bundle pixel-faithfully.
- Reason: The bundle's chat transcripts represent the user's validated end-state; recreating it as production code anchors all subsequent backend integration work.
- Impact: Non-breaking (greenfield directory). Adds a new build target.

**Form schema is the single source of truth**
- From: No portal exists; cluster requests are filed ad-hoc.
- To: One generic dynamic form runner renders Catalog tiles, NewRequest pages, and OpenShift Cluster from `GDF_ADMIN_DATA.fields[<formId>]`. Field grammar supports `displayAs: dropdown | radio-cards`, `prefix` with `{token}` interpolation, rich select options (`value | label | description | dotColor`, `;`-separated with `,` fallback), and `help` text with the same interpolation.
- Reason: Aligns with project value "we deeply value maintainability and driftless codebases".
- Impact: Non-breaking. Establishes a contract for future backend `/forms` endpoints to honor.

**Approval is mandatory before provisioning**
- From: N/A (no portal).
- To: Every submitted request lands at `status: "approval"`, populated `justification` and `policyChecks`. Pipeline progression to `provisioning` requires an admin Approve in the Approvals queue.
- Reason: Governance baseline for a multi-department gov platform; matches the chat6 fix landed in the design bundle.
- Impact: Future backend Camel route must honor an "approval" state and only emit Git writes after approval.

**Admin manages forms, fields, templates, users, groups (no cluster fleet view)**
- From: N/A.
- To: Admin → Forms (Definition / Fields / Template multi-file YAML editor with `{{ meta.* }}` / `{{ vars.* }}` Go-template tokens and click-to-copy variables, including the System auto-injected group). Admin → Users (Users + Groups + per-record editors). No fleet/clusters admin view.
- Reason: Hugo's pruning across chats 1–5 explicitly removed the fleet view and reshaped Administration around forms/users.
- Impact: Constrains future admin API surface to forms/fields/templates/users/groups.

**Persona model: Operator vs Platform Admin only**
- From: N/A.
- To: Two seeded personas (Operator João Silva @ saude, Platform Admin Maria Costa @ setic). Operators cannot route to admin-forms / admin-users / approvals; the App effect-redirects on role flip.
- Impact: Future auth integration (Keycloak per chat4 NewUserPage hint) maps to these two roles plus the `approver` / `service` roles already enumerated in seeds.

## Capabilities

### New Capabilities
- `itsm-portal-shell`: utility band, sidebar (role-gated nav with badges), topbar (breadcrumbs, search, refresh, notifications, role switcher), toast stack, theme/density tokens, demo-only Tweaks panel.
- `itsm-dashboard`: Home / Platform Overview with KPIs (Active Clusters / Pending Provisioning / Failed 30d), pipeline-health banner, Recent Requests table, Activity Stream.
- `itsm-service-catalog`: dynamic tile grid sourced from active forms; OpenShift Cluster featured; tile click routes to NewRequest with `formId`.
- `itsm-request-submission`: generic dynamic form runner with rich select grammar, radio-card display variant, prefix and help-text token interpolation, validation (regex / min–max / required), live `meta` + `vars` payload preview, and submission that creates a request with `status: "approval"`.
- `itsm-requests-list`: tabbed list scoped by role (operator: own; admin: all), status filters, inline progress on `provisioning` rows.
- `itsm-request-detail`: animated 7-stage CDC pipeline (Form → MongoDB → Debezium → Kafka → Camel → Git → ArgoCD), Request Details panel, Approvals chain, Cluster Access (kubeconfig download). No raw manifests displayed.
- `itsm-approvals-queue`: admin-only pending queue with filter chips, decided-this-session log, decision detail with policy/governance checks, Approve/Reject + override modal, 3-step approval-chain visualization.
- `itsm-admin-forms`: Forms list + global Form Fields view + per-form editor (Definition / Fields / Template sub-tabs); multi-file YAML templates with System and From-form-fields variable groups; drag-and-drop field reordering; type-aware Validation / options control.
- `itsm-admin-users`: Users list + per-user editor (name, username, email, group, role, status, MFA, sessions); Groups list + per-group editor (id, display name, Git repo with auto-suggest, ManagedClusterSet binding, auto-provision toggle).

### Modified Capabilities
- _(none — no existing specs in `openspec/specs/`)_

## Impact

**Code**
- New directory: `gdfkube-src/gdfkube-itsm/` containing the Vite/React/TS app, components, styles, seed data, and tests. No existing code is modified.

**APIs / Topics / Consumers**
- No backend changes in this proposal. The portal operates on in-memory seed data (`window.GDF_DATA`, `window.GDF_ADMIN_DATA`) for v1. Establishes the data shapes that future REST endpoints under `/api/itsm/*` and the Kafka topic `dbz.gdfkube.requests` must produce/consume — but wiring is out of scope here.

**Dependencies (pinned, flagged for stack conflicts)**
- `react@18.3.1`, `react-dom@18.3.1` (matches the prototype's pinned UMD versions).
- `vite@5.x`, `@vitejs/plugin-react@4.x`, `typescript@5.x`.
- `vitest@1.x`, `@testing-library/react@14.x`, `@testing-library/jest-dom@6.x`, `jsdom@24.x` for unit/component tests.
- `@playwright/test@1.x` for end-to-end role/approval flows (optional, gated behind a CI label).
- Fonts via Google Fonts CDN: Inter Tight 400/500/600/700, JetBrains Mono 400/500, Source Serif 4 600/700 (no npm dependency).
- Conflicts with stack: none. Quarkus / Helm / Kafka / MongoDB / Debezium / Camel are backend-only; this module is browser-side and isolated under its own folder. Node is already present in the devcontainer.

**Testing strategy**
- **Unit**: Vitest for pure helpers — `parseSelectOptions`, `interpolateTokens`, `clipboardCopyFallback`, breadcrumb resolver, role-route guard.
- **Component**: Testing Library + jsdom for: Sidebar (role-gated items + badge math), Topbar (role switch toggles user + nav), Catalog (dynamic tiles), GenericRequest (rich select + prefix interpolation + submit creates `status:"approval"`), Approvals (Approve transitions request to `provisioning`), FormEditor (drag reorder updates state, type-aware validation control switches per field type, multi-file template editor add/rename/remove + click-to-copy variable).
- **End-to-end (Playwright, optional)**: operator submits OpenShift Cluster → toast "submitted for approval" → admin opens Approvals → Approve → request appears as `provisioning` in admin's All Requests.
- **Visual parity**: a single golden-snapshot test pinning the rendered HTML structure of each top-level page to catch unintentional layout drift from the bundle.
- **Coverage target**: ≥ 80% line coverage on `src/` (excluding seed data files).
