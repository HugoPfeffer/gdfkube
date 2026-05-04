# gdfkube ITSM Portal

A demo IT service portal for the gdfkube platform — operators submit cluster/namespace/scale requests, admins approve them, and the system simulates a CDC pipeline (Form → MongoDB → Debezium → Kafka → Camel → Git → ArgoCD) reaching HyperShift.

This module was scaffolded from the Claude Design handoff bundle `UM8oI594JuuCpxaNBVoITA` and implements OpenSpec change [`build-itsm-portal`](../../openspec/changes/build-itsm-portal/).

## Tech stack

- React 18.3.1 + TypeScript 5
- Vite 5 + @vitejs/plugin-react 4
- Vitest 1 + Testing Library 14 + jsdom 24
- ESLint 9, Prettier 3
- No router library, no state-management library — by design

## Getting started

From the repo root:

```bash
cd gdfkube-src/gdfkube-itsm
npm install
npm run dev
```

Open http://localhost:5173.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | Type-check without emitting (`tsc --noEmit`) |
| `npm run test` | Run all Vitest tests once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run lint` | ESLint over `src/**` |

## Demo affordances

The portal is a self-contained demo with NO backend wiring:

### Role switcher

The Topbar avatar opens a menu to switch between Operator (`João Silva @ saude`) and Platform Admin (`Maria Costa @ setic`). Operator role hides the Operations and Administration nav sections; switching to operator while on an admin route redirects to Home.

### Tweaks panel

Floating "Tweaks" button opens a drawer that mutates demo state. Persisted via `localStorage["gdfkube.tweaks"]` and applied immediately:

| Key | Type | Default | Effect |
|---|---|---|---|
| `theme` | `"light" \| "dark"` | `"light"` | Sets `data-theme` on `<html>` |
| `density` | `"compact" \| "comfortable"` | `"compact"` | Layout density class |
| `sidebarCollapsed` | boolean | `false` | Hides sidebar labels |
| `pipelineSpeed` | number (0.5–4) | `1` | Scales pipeline animation duration via `--anim-duration` |
| `showDemoBanner` | boolean | `true` | Toggles the demo banner |

The Tweaks drawer also exposes Quick actions: toggle role; jump to the Service Catalog (new request flow).

### Persistence caveat

**All admin edits and operator submissions live in memory only.** Refreshing the page resets `requests`, `forms`, `fields`, `users`, `groups`, and `templates` to the seed values shipped in `src/data/`. Tweaks persist (above), but request and form data does not. Wiring real persistence requires a backend (MongoDB → Debezium → Kafka → Camel) and is out of scope for this change.

## Project layout

```
src/
  data/         # seed exports: GDF_DATA, GDF_ADMIN_DATA, DEFAULT_TEMPLATES
  state/        # data context + reducer
  router.ts     # in-app reducer router
  App.tsx       # composition root
  shell/        # UtilityBand, Sidebar, Topbar, ToastStack
  pages/        # Dashboard, Catalog, RequestsList, RequestDetail, Approvals, admin/*
  forms/        # GenericRequest, RadioCards, PrefixedInput, PayloadPreview, helpers
  admin/        # FormEditor, FieldsTable, TemplateEditor, NewFormPage, NewUserPage, NewGroupPage
  components/   # StatusPill, Pipeline
  icons/        # Icons set
  tweaks/       # useTweaks hook + TweaksPanel
  utils/        # clipboard helper
  types.ts      # shared types
```

## Architecture notes

- **Single dynamic form runner**: every form (cluster-request, namespace-request, scale-request, plus any new form created in the admin UI) renders through `src/forms/GenericRequest.tsx`. There is no per-form bespoke component. Field schemas drive everything.
- **Schema as contract**: `Field` type in `src/types.ts` defines `{ key, label, type, bucket, required, help, prefix, placeholder, validation, min, max, options, displayAs }`. Admin edits to fields propagate to the consumer page via the data context reducer in lockstep.
- **Approval gate**: every submission lands in `status: "approval"`. Only the Approvals page can advance to `provisioning` (and only an admin can reach Approvals).
- **Clipboard fallback**: `src/utils/clipboard.ts` tries `navigator.clipboard.writeText` and falls back to a hidden textarea + `document.execCommand('copy')` for sandboxed iframe environments (e.g. Vercel previews).
- **Routing**: a tiny in-app reducer router in `src/router.ts`. No URL synchronization, no deep links — by design (D3 in design.md).

## Testing

```bash
npm run test         # run once
npm run test:watch   # watch mode
```

Coverage targets ≥80% on `src/**` excluding `src/data/**`. The test suite is comprehensive (270 tests at last count) and covers every requirement scenario in `openspec/changes/build-itsm-portal/specs/**/spec.md`.

## CI

GitHub Actions runs `typecheck`, `test`, and `build` on changes under `gdfkube-src/gdfkube-itsm/**` (workflow at `.github/workflows/gdfkube-itsm-ci.yml`). The workflow follows the project's path-scoped GitHub Actions security rules: `permissions: {}` at workflow level, SHA-pinned actions, `persist-credentials: false` on checkout.

## Provenance

This module reproduces the Claude Design handoff bundle [`UM8oI594JuuCpxaNBVoITA`](https://api.anthropic.com/v1/design/h/UM8oI594JuuCpxaNBVoITA), implementing every screen and behavior captured across the bundle's six iterative chat sessions. See `openspec/changes/build-itsm-portal/brainstorm.md` for the design rationale and pruning decisions.
