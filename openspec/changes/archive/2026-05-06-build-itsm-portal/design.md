## Context

`gdfkube` is a multi-department government Kubernetes platform. The end-to-end pipeline (Form → MongoDB → Debezium → Kafka → Apache Camel → Git → ArgoCD → HyperShift) already has working infra components under `gdfkube-src/gdfkube-infra/` and `gdfkube-src/gdfkube-camel/`, but no operator-facing UI. The design assistant produced a complete validated frontend over six iterative chat sessions; the bundle ships as React 18 + Babel-standalone in a single `gdfkube ITSM Portal.html` for prototyping. This design recreates that prototype as a production-quality module under `gdfkube-src/gdfkube-itsm/` while preserving every visual and behavioral decision Hugo locked in.

**Current state**: `gdfkube-src/gdfkube-itsm/` is referenced in `CLAUDE.md` but the directory does not exist. Operators submit cluster requests out-of-band; there is no approval queue.

**Constraints**:
- Keep the prototype's pixel-faithful look (navy/civic-blue palette, Inter Tight + JetBrains Mono + Source Serif 4, line-style original icons).
- No drift between admin schema and rendered forms — one runner drives every form.
- Mandatory approval before provisioning.
- Devcontainer-based dev loop, Node available, no system-wide installs.
- No backend dependency in v1; seed data lives in-memory with shapes that future REST/Kafka consumers can match.

**Stakeholders**: Hugo Pfeffer (sole developer, demo owner); SETIC (operators of the gdfkube platform); department operators (Saúde, Educação, Transportes, Fazenda, Agricultura, Segurança).

## Goals / Non-Goals

**Goals:**
- Produce a buildable, type-safe React app at `gdfkube-src/gdfkube-itsm/` that renders the seven screens of the design bundle with the same chrome, components, and interactions.
- Drive every form (including OpenShift Cluster) through one schema-driven runner; admin edits in `Forms` propagate to Catalog and NewRequest immediately.
- Enforce `status: "approval"` on every submission; advance to `provisioning` only via the Approvals page.
- Preserve all of the user's pruning decisions from chats 1–6 (no fleet view, no Reports/Audit, no Knowledge Base, no Generated Manifests card, etc.).
- Ship with unit + component + at least one e2e test exercising the operator-submit → admin-approve flow.
- Keep the demo-only Tweaks panel (theme, density, sidebar collapse, pipeline speed, demo banner, role switch shortcut).

**Non-Goals:**
- Wiring the portal to live MongoDB / Debezium / Kafka / Camel. v1 uses in-memory seeds.
- Real authentication. The role switcher in the topbar is a demo affordance; no Keycloak integration in this change.
- Internationalization. The bundle is English-only with Portuguese department names; v1 mirrors that exactly.
- Mobile/responsive layouts beyond the desktop breakpoints implicit in the prototype.
- Real persistence of admin edits across reloads. Edits live in component state for the demo, matching prototype behavior.
- Generating real Kubernetes manifests. The Template editor is a static YAML editor with token interpolation preview.

## Decisions

### D1. Build tool: Vite + React 18 + TypeScript
- **Choice**: Vite 5 + `@vitejs/plugin-react` + TypeScript 5, scaffolded into `gdfkube-src/gdfkube-itsm/`.
- **Why**: Lowest-friction match for the prototype shape (React 18 + JSX). Vite's dev server has near-instant HMR which preserves the iterative tweak-driven feel of the design bundle. TypeScript pays for itself given the form-schema surface area.
- **Alternatives**:
  - *Keep Babel-standalone single-file*: zero build but no type-checking, no tree-shaking, large UMD bundles, awkward to test.
  - *Next.js*: App Router adds SSR/routing layers we don't need; this app has no server component story.
  - *Remix* (the prototype's name `gdfkube-remix` is incidental; not the framework): heavier than needed; no nested routing demand.
- **Trade-off**: introduces a build step (Hugo's bias is simplicity) — mitigated by `npm run dev` matching the prototype loop, and the build step buys us types + tests.

### D2. Module layout mirrors the prototype JSX modules
- **Choice**: One TS/TSX file per prototype module under `src/`:
  - `src/main.tsx` — entry point + `<App />`.
  - `src/shell/` — `UtilityBand`, `Sidebar`, `Topbar`, `ToastStack`.
  - `src/pages/` — `Dashboard.tsx`, `Catalog.tsx`, `NewRequest.tsx`, `RequestsList.tsx`, `RequestDetail.tsx`, `Approvals.tsx`, `Admin/Forms.tsx`, `Admin/Users.tsx`.
  - `src/forms/` — `GenericRequest.tsx`, `parseSelectOptions.ts`, `interpolateTokens.ts`, `validate.ts`.
  - `src/admin/` — `FormEditor.tsx`, `FieldsTable.tsx`, `TemplateEditor.tsx`, `UserEditor.tsx`, `GroupsTable.tsx`, helpers.
  - `src/data/` — `seeds.ts` (`GDF_DATA`), `adminSeeds.ts` (`GDF_ADMIN_DATA`), `defaultTemplates.ts`.
  - `src/icons/Icons.tsx`, `src/styles.css`, `src/types.ts`.
  - `src/tweaks/TweaksPanel.tsx`, `src/tweaks/useTweaks.ts`.
- **Why**: keeps one-to-one traceability to the bundle; reviewers can compare a prototype JSX to its TSX equivalent without hunting.
- **Alternative**: feature-folder layout (e.g. `src/features/approvals/`) — smoother long-term but makes initial parity review harder. Defer to a follow-up refactor if needed.

### D3. Routing: a tiny in-app reducer, not React Router
- **Choice**: Reuse the prototype's pattern — a single `route` string + `routeParams` object held in `App` state, with a `navigate(route, params)` function passed as a prop.
- **Why**: The bundle has 8 routes total, no history/back semantics in scope, no deep-linkable URLs (it's a demo). Adding `react-router` would be 100+ lines of router config to recreate a 30-line switch.
- **Trade-off**: no browser back/forward + no shareable URLs. Acceptable for v1; if real users land here, swap to React Router 6 in a follow-up — the `navigate` shim makes that swap a one-line replacement.
- **Risk**: deep-link to `/requests/REQ0010247` is impossible until the router lands.

### D4. Form schema is the contract
- **Choice**: Define a single `FieldSchema` TS type in `src/types.ts` with optional `displayAs`, `prefix`, `help`, `options`, `validation`, `min`, `max`, `bucket: "meta" | "vars"`, `required`, etc. Catalog, GenericRequest, FormEditor, and TemplateEditor all consume the same type. Helpers `parseSelectOptions` and `interpolateTokens` are pure functions, unit-tested.
- **Why**: ensures admin-edits-vs-rendered-form parity by construction; prevents the chat-5 class of bug where the editor showed validation as free text but runtime parsed it.
- **Alternative**: JSON Schema + a runtime validator (Zod, Ajv) — heavier than needed for a 6-field form set; reconsider when persisting forms to a backend.

### D5. Select-option grammar uses `;` with `,` fallback
- **Choice**: `parseSelectOptions(input)` splits on `;` if present, else `,`. Each option is `value | label | description | dotColor` (last three optional, pipe-separated).
- **Why**: chat-5 verifier caught an ambiguity — descriptions can contain commas (e.g. "Dev sandbox, ephemeral"). Semicolons aren't natural in human descriptions; comma fallback preserves backward compatibility for plain lists.
- **Mitigation**: editor placeholder text and a Radio-cards hint advertise `;` as the canonical separator.

### D6. Approval state machine
- **Choice**: Request status is `approval | provisioning | ready | failed`. Submission always sets `approval`. Admin Approve sets `provisioning` and resets `stage` to 1 (Form complete) so the pipeline animation begins. Admin Reject sets `failed` with a reason on the request.
- **Why**: The pipeline animation is the demo's "wow moment" and must only kick off post-approval (Hugo, chat6).
- **Risk**: if seed data is mid-flight (e.g. `REQ0010247` already has `status: "provisioning", stage: 4`), the approval flow should *not* reset it. Mitigation: Approve only mutates requests currently in `approval`.

### D7. Clipboard fallback is mandatory
- **Choice**: A `copyToClipboard(text)` helper that tries `navigator.clipboard.writeText` and falls back to a hidden textarea + `document.execCommand('copy')`.
- **Why**: chat-6 fix — sandboxed iframes (e.g. Vercel preview) reject the native clipboard API. The fallback is unaesthetic but works everywhere the demo will run.

### D8. Theme via `data-theme="light|dark"` on `<html>`
- **Choice**: The Tweaks panel writes `data-theme` to `<html>`; styles.css overrides CSS custom properties under `[data-theme="dark"]`. No CSS-in-JS, no theme provider.
- **Why**: matches prototype exactly; tokens are already declared as `--ink-*`, `--civic-*`, `--paper`, `--canvas` so the dark override is ~10 lines.

### D9. Drag-and-drop via the HTML5 API
- **Choice**: `draggable` + `dragstart/dragover/dragenter/dragleave/drop` handlers in FormEditor and NewFormPage. State holds `dragIndex` and `overIndex`; visual feedback uses `opacity: 0.5` on the dragged row and a 2px civic-blue border on the drop target.
- **Why**: zero-dependency, works in every modern browser, matches prototype implementation. `react-dnd` / `dnd-kit` add a dependency for one feature.

### D10. Tweaks panel persistence
- **Choice**: `useTweaks(defaults)` hook reads from `localStorage["gdfkube.tweaks"]` on mount and writes back on each setter call. Defaults: `{density:"compact", theme:"light", sidebarCollapsed:false, pipelineSpeed:1, showDemoBanner:true}`.
- **Why**: matches prototype `EDITMODE-BEGIN/END` defaults and avoids losing operator preference between page reloads.

### D11. Tests are component-level, not snapshot-heavy
- **Choice**: Vitest + Testing Library for behavior-driven assertions ("submit button disabled until required filled", "Approve transitions request to provisioning", "drag from index 2 to 0 reorders fields"). One golden-DOM snapshot per top-level page guards against gross visual drift.
- **Why**: heavy snapshot suites churn on every CSS tweak and stop catching real regressions; behavior tests survive cosmetic changes.

### D12. Zero direct DOM mutation outside of Tweaks → `<html>` data-theme
- **Choice**: All UI state lives in React; the only escape hatch is `document.documentElement.setAttribute("data-theme", ...)` from the Tweaks effect (mirrors prototype).

## Risks / Trade-offs

- **Risk**: scope creep — the bundle has 6,200+ lines of JSX/CSS; some of it is intricately interlinked (e.g. the FormEditor's `renderEditableValidation` is type-aware, drag-aware, and option-grammar-aware). → **Mitigation**: tasks.md sequences work module-by-module starting from shell+seeds, and the verify phase runs against a pixel-diff of every screen vs. the bundle.
- **Risk**: in-memory `GDF_ADMIN_DATA` mutations don't persist; an operator submitting a request and refreshing loses it. → **Mitigation**: explicitly document this in README; persistence is a follow-up change once a backend exists.
- **Risk**: future backend wiring may require schema renames (e.g. `meta.requesterGroupName` → `meta.organizationId`). → **Mitigation**: System-variables list in TemplateEditor is centralized in `src/data/systemVariables.ts`, so a rename is one file.
- **Risk**: clipboard fallback uses `document.execCommand('copy')` which is deprecated. → **Mitigation**: still works in all evergreen browsers; revisit if the W3C drops it.
- **Risk**: replacing the in-app router with React Router later is non-trivial because deep links don't exist. → **Mitigation**: `navigate(route, params)` is the only entry point; the swap is contained.
- **Risk**: theme dark-mode CSS coverage may be incomplete (the prototype declares dark tokens but not every surface uses them). → **Mitigation**: dark-mode visual review is part of verify.

**Trade-off**: choosing TypeScript adds a build/test layer Hugo's stack values keeping minimal — accepted because the form schema's open polymorphism (`displayAs`, `bucket`, `validation`/`options`/`min`/`max` per type) is precisely what types catch.

**Trade-off**: not introducing a state-management library (Redux / Zustand) — the App holds `route`, `routeParams`, `role`, `toast`, `tweaks`; everything else is local. Adding a global store would be premature.

## Migration Plan

This is a greenfield directory; there is no existing portal to migrate.

**Deploy**:
1. Land all artifacts under `gdfkube-src/gdfkube-itsm/`.
2. Add an npm script `npm --prefix gdfkube-src/gdfkube-itsm run dev` to the devcontainer's startup hint.
3. Document the role-switch shortcut and the Tweaks panel in a short README so reviewers can run the demo end-to-end.
4. CI: a new GitHub Actions job runs `npm ci && npm run typecheck && npm run test && npm run build` for the itsm subtree only on changes under `gdfkube-src/gdfkube-itsm/**`.

**No MongoDB schema changes, no Kafka topic changes, no Helm values changes** — backend is untouched.

**Rollback**: revert the merge commit. The directory is self-contained and has no producers/consumers in v1, so no orphan state remains.

## Open Questions

1. **Production framework confirmation** — are we OK with Vite + React 18 + TypeScript? (Default: yes; no objection in chats.)
2. **Where do unit tests live in CI?** — propose a new GitHub Actions workflow `gdfkube-itsm-ci.yml` triggered on path filter `gdfkube-src/gdfkube-itsm/**`. Alternative: extend the existing trufflehog workflow with a new job.
3. **Asset licensing for the icon set** — all icons in `icons.jsx` are original line-style geometry, but should we copy them as-is (already MIT-equivalent in the bundle context) or re-trace them in this repo? Default: copy as-is; the bundle README authorizes recreation.
4. **Persistence of admin edits in v1** — keep in-memory only? Defer to a follow-up change once a backend `/api/itsm/forms` exists.
5. **Backend integration epic** — should be a separate proposal that defines the REST contract and Camel route changes; this proposal explicitly leaves it out.
