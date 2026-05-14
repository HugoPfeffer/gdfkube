## Why

The OpenShift Cluster / Namespace / Scale request forms expose a Department field that is silently ignored — `requestService.ts` overwrites the top-level `requesterGroupName` with `demoUser.group`, so the form's value only survives by accident inside `meta.requesterGroupName`. In parallel, the topbar "Switch Role" menu pins identity to two hard-coded users (`joao.silva`, `m.costa`), so the demo cannot operate as any other user nor view the same user from an admin perspective. Both behaviors block the intended demo narrative: "the active user drives all request metadata downstream into Camel, Mongo, and Kafka."

## What Changes

**Form schema (cluster-request, namespace-request, scale-request)**
- From: each form declares a `requesterGroupName` select field that the server overwrites before persistence.
- To: the field is removed; the active demo user's `group` is the single source of truth.
- Reason: eliminate the half-wired field; align the form contract with what the server actually persists.
- Impact: non-breaking for downstream consumers — the persisted document shape is unchanged (top-level `requesterGroupName` and `meta.requesterGroupName` are still present, now both sourced from `demoUser.group`).

**Server-side meta injection (`requestService.ts`)**
- From: `meta` is built from `validation.meta` plus `correlationId`. `meta.requesterGroupName` happens to be present only because the validator buckets unknown form fields into `meta`.
- To: `meta.requesterGroupName: demoUser.group` is injected explicitly alongside `correlationId`.
- Reason: existing Helm/template renderers (`defaultTemplates.ts`, `seed-data/forms.json`) read `{{ meta.requesterGroupName }}`; keep them working after the form field is removed.
- Impact: non-breaking. Top-level `requesterGroupName` (already from `demoUser.group`) is untouched.

**X-Demo-Role header (new contract, SPA → Express)**
- From: identity and role are conflated — picking a role in the topbar pins one of two hard-coded users.
- To: a new `X-Demo-Role: operator | admin` header travels alongside `X-Demo-User`. The server clones the matched `DemoUser` and overrides `.role` from the header (invalid values fall through to the stored role; `DEMO_USERS` is never mutated).
- Reason: decouple "who" from "what perspective" so the role toggle works for any registered user.
- Impact: additive header; missing/invalid header preserves current behavior.

**Topbar: Switch user above Switch role**
- From: one menu titled "Switch role" with two buttons that change role *and* identity.
- To: two stacked sections — "Switch user" (lists every active demo user from `DataContext`, sourced from `GET /api/itsm/users`, filtered by `status !== 'disabled'`) and "Switch role" (Operator / Admin perspective). Selecting a user keeps the current role.
- Reason: enable demoing as any user and viewing the same user from either perspective.
- Impact: SPA-only. No API contract change beyond the new header.

**App.tsx state + persistence**
- From: `role` drives `user` via `pickUser()`.
- To: `activeUsername` and `role` are independent state, each persisted to `localStorage` (`gdfkube.demoUser`, `gdfkube.demoRole`). `user` is derived from `data.users` keyed on `activeUsername`. Both `setDemoUser` and `setDemoRole` are called synchronously in the render body to preserve the existing "no stale-header fetch" invariant.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `itsm-portal-shell`: Topbar requirements change — a new "Switch user" section is added above "Switch role"; selecting a user updates the active username independently of role; the synchronous-header invariant extends to a new `X-Demo-Role` header; role-menu scenarios that pin to hard-coded users are replaced.
- `itsm-express-api`: the Demo Identity Middleware requirement extends to honor an optional `X-Demo-Role` header that overrides the stored role for the current request only (cloned `DemoUser`, never mutating `DEMO_USERS`); invalid values fall through.
- `itsm-request-submission`: the "Prefix and help-text token interpolation" requirement adds a fallback — when the sibling key is `requesterGroupName` and no form field with that key exists, the interpolator resolves it from `user.group`. A new requirement is added covering server-side injection of `meta.requesterGroupName`.

The seeded `cluster-request`, `namespace-request`, and `scale-request` form documents in `gdfkube-infra/mongodb/seed-data/forms.json` (and the corresponding `adminSeeds.ts` entries) drop their `requesterGroupName` field. This is a data/config change consistent with the existing `itsm-forms-collection` shape requirements (Mongoose sub-schema is permissive) and does not require a delta in that spec.

## Impact

**Affected SPA code** (`gdfkube-src/gdfkube-itsm/`):
- `src/data/adminSeeds.ts` — form schemas (3 forms)
- `src/forms/GenericRequest.tsx` — prefix interpolator fallback
- `src/forms/__tests__/GenericRequest.test.tsx` — new fallback test case
- `src/api/itsmApi.ts` — `setDemoRole`, `X-Demo-Role` header
- `src/App.tsx` — independent user/role state, localStorage persistence
- `src/shell/Topbar.tsx` — Switch user section, simplified Switch role
- `scripts/export-seed-data.mjs` — re-export seeds (no logic change, but execution required)

**Affected server code** (`gdfkube-src/gdfkube-itsm/server/src/`):
- `middleware/demoUser.ts` — honor `X-Demo-Role`, clone user record
- `services/requestService.ts` — inject `meta.requesterGroupName` from `demoUser.group`

**Affected seed/infra**:
- `gdfkube-src/gdfkube-infra/mongodb/seed-data/forms.json` — drop the three `requesterGroupName` field blocks (mirrored from `adminSeeds.ts`)
- `gdfkube-src/gdfkube-infra/mongodb/seed-collections.js` — index on `requesterGroupName` (line 84) is unchanged; the field is still persisted from the server side
- `gdfkube-src/gdfkube-infra/mongodb/seed-data/requests.json` — already deleted in the working tree per `git status`; not required by this change

**Affected APIs / endpoints**:
- All `/api/itsm/*` routes now accept (but do not require) `X-Demo-Role`.
- Admin-gated endpoints (`/api/itsm/users`, `/api/itsm/groups`, `/api/itsm/forms` writes, `/api/itsm/settings`, `POST /requests/:id/approvals`) respect the overridden role.
- No path, payload, or response-shape changes.

**Downstream consumers (read-only impact)**:
- Camel `RequestRouterRoute` (`gdfkube-camel`) continues to consume `RequestEvent` with unchanged shape; `requesterGroupName` is sourced consistently from `demoUser.group`.
- Debezium `gdfkube.gdfkube.requests` topic — no schema change.
- `HelmValuesBuilder.java` — no change. Renders `hc-{group}-{name}` from the same `requesterGroupName` field.
- ArgoCD ApplicationSet templates in `gdfkube-orgs/orgs/{group}/` — no change.

**Dependencies**: none added, none removed, no version bumps. All work uses already-installed React/TypeScript/Express versions pinned in `package.json`. No conflicts with the existing stack.

**Testing strategy**:
- *Unit (SPA, Vitest)*: extend `GenericRequest.test.tsx` to cover the `requesterGroupName` fallback to `user.group`. Existing FieldsTable/TemplateEditor/Sidebar tests unaffected.
- *Unit (Express, Jest/Vitest)*: middleware test covering valid override, invalid override (falls through), and missing header. `requestService` test asserts `meta.requesterGroupName === demoUser.group` regardless of `validation.meta` input.
- *Integration*: SPA happy path — pick a non-`saude` user, file a cluster request, verify `requester.id`, `requester.group`, top-level `requesterGroupName`, and `meta.requesterGroupName` all reflect the picked user. Role override: toggle Admin, verify `/api/itsm/users` returns 200 and the approvals tab appears; switch user, verify role persists.
- *Contract*: `__tests__/openapi.test.ts` — confirm `X-Demo-Role` header is documented as an optional security parameter (additive); no path changes break the contract test.
- *Persistence*: SPA reload preserves last-picked user and role via `localStorage`.
- *Header hygiene (manual curl)*: bogus `X-Demo-Role` falls back to stored role; `X-Demo-Role: admin` with an operator user returns 200 from admin-gated endpoints.
- *End-to-end (Camel)*: confirm a request from a non-`saude` user produces `hc-{their-group}-{name}` in the rendered HelmValues and lands in the right `gdfkube-orgs/orgs/{group}/` repo.
