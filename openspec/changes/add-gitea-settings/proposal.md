## Why

The ITSM portal has a dead "Preferences" placeholder in the topbar dropdown that does nothing when clicked — a visible loose end in every demo walkthrough. Separately, the platform has no runtime knob for the Gitea endpoint or token: re-pointing the demo at a different Gitea instance requires a Helm value edit and redeploy. The Camel routes and ArgoCD both need a single agreed-upon Gitea URL/owner/token, which today lives only in Helm values (URL and owner only — no token at all). A singleton settings document is the lightest possible primitive to close both gaps: one new collection, one new route pair, one new page.

## What Changes

**Topbar / navigation**
- From: A dead `<div>` labeled "Preferences" that does nothing.
- To: A `<button role="menuitem">` labeled "Settings" that navigates to the `settings` route and closes the dropdown.
- Reason: Replace dead UI with a working navigation target.
- Impact: Non-breaking; visual change only. All signed-in users see the item.

**Routing**
- From: No `settings` entry in the `RouteName` union, no breadcrumb or render branch.
- To: `'settings'` added to `RouteName`, breadcrumb returns `['Settings']`, render branch shows the `<Settings />` page.
- Reason: Wire the new page into the existing union-based router.
- Impact: Non-breaking; new route only.

**Settings page** (new `src/pages/admin/Settings.tsx`)
- Admin-gated form with three fields: Gitea Endpoint URL, Owner, Personal Access Token (masked).
- Read-only metadata strip showing `updatedAt` and `updatedBy`.
- Save via `PATCH /api/itsm/settings` with toast feedback.

**Backend model** (new `server/src/models/GiteaSettings.ts`)
- Mongoose singleton: `_id: 'gitea'`, fields `endpoint`, `owner`, `token`, `updatedAt`, `updatedBy`.
- Collection: `gitea_settings`.

**Backend API** (new `server/src/routes/settings.ts`)
- `GET /api/itsm/settings` — admin-only, token redacted to `"***"` unless `?reveal=1`.
- `PATCH /api/itsm/settings` — admin-only, validates body, upserts singleton, stamps audit fields.

**Seeding**
- New seed data with project-default values matching `values.yaml` (endpoint, owner, placeholder token).
- Seed exporter extended to emit `settings.json`.
- Seeder extended with `$setOnInsert` upsert (non-destructive re-seed).

## Capabilities

### New Capabilities

- `itsm-admin-settings`: Admin-only Settings page rendering a three-field form (endpoint, owner, token) for the global Gitea configuration, with masked token input, anchored-regex validation, and save/toast feedback.
- `itsm-settings-collection`: MongoDB singleton document (`_id: 'gitea'`) in a new `gitea_settings` collection, seeded with the project-default Gitea endpoint and owner. Re-seed is non-destructive (`$setOnInsert`).

### Modified Capabilities

- `itsm-portal-shell`: Topbar user dropdown gains a "Settings" menu item (replacing the inert "Preferences" placeholder) that routes to `/settings`. The `RouteName` union and `App.tsx` route handling gain a `settings` entry.
- `itsm-express-api`: Express app mounts a new `/api/itsm/settings` router exposing `GET` and `PATCH` operations, both gated by the `requireAdmin` middleware.

## Impact

- **Files modified**: `src/shell/Topbar.tsx`, `src/types.ts`, `src/App.tsx`, `server/src/app.ts`, `src/data/adminSeeds.ts` (or new `settingsSeeds.ts`), `scripts/export-seed-data.mjs`, `gdfkube-infra/mongodb/seed-collections.js`.
- **Files created**: `src/pages/admin/Settings.tsx`, `server/src/models/GiteaSettings.ts`, `server/src/routes/settings.ts`, `gdfkube-infra/mongodb/seed-data/settings.json` (generated).
- **Dependencies added**: None (pure TS/Mongoose work using existing stack).
- **Blast radius**: One new MongoDB collection (`gitea_settings`), two new API routes (`GET`/`PATCH /api/itsm/settings`), one new page, modified topbar/router/seed pipeline. No changes to existing form fields, schemas, Kafka topics, or Camel routes.
- **Testing strategy**: Backend integration tests (admin GET/PATCH, non-admin 403, validation 400). Seed export verification. Seed idempotence verification. UI walkthrough (manual). Type/build check (`npm run typecheck && npm run build`).
