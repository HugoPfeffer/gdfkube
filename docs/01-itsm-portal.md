# ITSM Portal

> **Implementation Status:** Implemented (frontend) / Planned (backend integration)
> **Source:** `gdfkube-src/gdfkube-itsm/` + handoff `app.jsx`
> **Last validated:** 2026-05-05

## Role in the Pipeline

```
[Operator]  ──form submit──▶  [Portal] ──REST──▶ [Express API] ──▶ MongoDB
   ▲                                                                  │
   │ SSE pipeline status                                               │
   └──────────────────────────────────────────────────────────────────┘
```

The portal is the only human entry point. Operators submit requests and watch
their pipeline progress; SETIC platform admins review and approve them.

## Responsibilities

- Render the form catalog and the form runner.
- Render request lists, request detail, and pipeline status.
- Provide an admin-only surface for managing forms, users, and groups (seeded today; backed by API later).
- Stream live pipeline-stage updates to the requester via SSE.
- **Does NOT** persist anything itself, render manifests, or talk to ArgoCD/RHACM. All state lives behind the API.

## Design

### Tech (current)

- React 18 + TypeScript 5 + Vite 5.
- Vitest + Testing Library; Playwright for label-gated e2e.
- CSS only (no CSS-in-JS).
- Custom in-app reducer router (no React Router, no URL sync). Routes are enumerated in `src/types.ts:RouteName`.
- State: a single React context reducer. No Redux, no Zustand. Seed data in `src/data/seeds.ts`.

### Layout

```
src/
├── App.tsx              # composition root
├── router.ts            # route reducer (no URL sync)
├── types.ts             # canonical shared types
├── state/               # data context + reducer
├── shell/               # topbar, sidebar, utility band, toasts
├── pages/               # Dashboard, Catalog, Requests, RequestDetail, Approvals, Admin
├── forms/               # GenericRequest runner, validation helpers
├── admin/               # Form/User/Group/Template editors
├── components/          # Pipeline, StatusPill
├── data/seeds.ts        # demo data (replaces API in v1)
├── tweaks/              # demo affordance: density/theme/speed drawer
└── icons/, utils/
```

### Routes

`RouteName` from `src/types.ts:19-27`:

```
home | catalog | new-request | requests | request-detail
| approvals | admin-forms | admin-users
```

### Demo Personas

Two seeded users today (no auth):

| Persona | ITSM role | Domain meaning |
|---|---|---|
| João Silva (operator) | `operator` | Org user. Submits requests. Cannot approve. |
| Maria Costa (admin) | `admin` | **SETIC platform admin.** Approves requests, manages forms/users. |

`Role` (`src/types.ts:3`) is `'operator' | 'admin'`. Additional roles (a
non-admin approver, machine identities) are out of scope for the demo and
not represented in the enum.

> **Future state — not yet implemented.** When real auth lands, expanded
> roles can be added to the `Role` union and surfaced in the admin Users
> editor; today the UI exposes only operator/admin.

### Pipeline Visualization

`PipelineStage` (`src/types.ts:83-89`) represents one of the 7 stages from
the [overview](./00-architecture-overview.md). The seed pipeline-stage list
in `src/data/seeds.ts` matches the canonical stage ids: `form, mongo,
debezium, kafka, camel, git, argocd`.

The portal listens to SSE from the [Express API](./02-express-api.md) and
advances the pipeline UI as stage events arrive.

## Interfaces

| Direction | Counterpart | Protocol | Purpose |
|---|---|---|---|
| Outbound | Express API | HTTPS / JSON | Form catalog, submit, list, detail, approve |
| Inbound | Express API | HTTPS / SSE | Pipeline stage events for one `requestId` |
| Outbound (admin) | Express API | HTTPS / JSON | Form CRUD, User CRUD, Group CRUD |

API contract details live in [02-express-api.md](./02-express-api.md).

## Operational Concerns

- The portal is stateless. All persistent state belongs to MongoDB, mediated by Express.
- SSE reconnection is the client's problem; the EventSource will auto-reconnect on drop.
- No client-side secrets. The static-user demo binding hardcodes a username at boot; real auth is deferred.

## Decisions Resolved

- **Auth:** Static user list for demo (saude operator + setic admin). Real auth (Keycloak / OIDC / OAuth-proxy) deferred to a future PRD.
- **Status push:** SSE from Express, not WebSocket and not polling.
- **Approver scope:** Single SETIC platform admin. ITSM `admin` user maps to this role; ITSM `operator` users are org users.
- **State:** No URL sync — the in-app reducer router is intentional. No Redux.

## Open Questions

- Should requests support cancel/withdraw before approval? Not in handoff.
- How does the portal surface DLQ failures to the requester? Today only `failed` status is defined; no failure-detail UX.
- Mobile/responsive scope is undefined.

## References

- `gdfkube-src/gdfkube-itsm/src/types.ts` — canonical types.
- `gdfkube-src/gdfkube-itsm/src/data/seeds.ts` — pipeline-stage definitions, demo data.
- `openspec/changes/build-itsm-portal/proposal.md` — original portal proposal.
- [02-express-api](./02-express-api.md) for the contract on the other side.
