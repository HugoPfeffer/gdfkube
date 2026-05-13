## Why

The `/review-team` audit of the unarchived `add-gitea-settings` change found four blocking defects shipped together: the seed-export script drops `users.username` and coerces `groups.users/forms/clusters` to arrays (breaking demo login → all SPA requests return 401), the Settings page hard-codes `X-Demo-User: maria.costa` (defeating the audit trail the feature exists to provide), and the promised backend + Topbar tests were never written despite tasks 7.x being checked off. Land the corrective scope as one bundled fix before archiving `add-gitea-settings` so the archived history reflects the verified state.

## What Changes

**Seed-export shape preservation**
- From: `scripts/export-seed-data.mjs` drops `users.username` and coerces numeric `groups.users/forms/clusters` to `[]`.
- To: pure projection — `username` retained, numeric group counts emitted as numbers matching `Group` in `src/types.ts`, all three JSON outputs end with `\n`.
- Reason: `App.tsx::pickUser` and `setDemoUserResolver` look up by `username`; `Users.tsx` renders `{g.clusters ?? '—'}` as a scalar.
- Impact: SPA auth works after `npm run seed:export && mongosh seed-collections.js`; resolves the 401 storm.

**Settings page audit trail**
- From: `pages/admin/Settings.tsx` calls `fetch('/api/itsm/settings...', { headers: { 'X-Demo-User': 'maria.costa' } })` directly.
- To: routes through `itsmApi.settings.get(...)` / `itsmApi.settings.update(...)`; the `api` helper injects `X-Demo-User` from `demoUserResolver()` (wired in `App.tsx:83–85` to the active user).
- Reason: hard-coded header makes `updatedBy` always read `maria.costa` regardless of who saved.
- Impact: audit trail now reflects the acting admin; matches the pattern of every other SPA call.

**Backend test coverage**
- From: no tests for `GET /api/itsm/settings`, `PATCH /api/itsm/settings`, or admin-gating.
- To: new `server/__tests__/settings.test.ts` with 10 scenarios — admin GET (redacted + reveal), non-admin 403, missing-doc 404, PATCH validation matrix (valid, bad URL, bad owner, empty token, null body), non-admin PATCH 403.
- Impact: regression coverage for the API surface added by `add-gitea-settings`.

**Topbar test coverage**
- From: `Topbar.test.tsx` asserts role-switch flow but not the Settings menu item.
- To: tests asserting Settings dropdown item is present (Preferences is not), clicking calls `navigate('settings')` and closes the dropdown.
- Impact: regression coverage for the menu rename + handler.

**Smaller hardening**
- PATCH endpoint rejects null/non-object/array bodies with 400 (currently crashes on destructure).
- `GET /api/itsm/settings?reveal=1` emits `Cache-Control: no-store` so plaintext PAT responses are not cached upstream.
- OpenAPI documents the new `/api/itsm/settings` paths.

**Spec correction (in-flight, not a delta)**
- Edit `openspec/changes/add-gitea-settings/specs/itsm-admin-settings/spec.md` and `tasks.md` to replace the `src/forms/validate.ts` reuse requirement with "regex constants MUST match the server-side `match` validators in `server/src/models/GiteaSettings.ts`". The challenger confirmed the original helper expects dynamic form-builder `Field` objects, not three static inputs.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `itsm-express-api`: PATCH MUST reject non-object/array/null bodies with 400 before destructuring; GET with `?reveal=1` MUST set `Cache-Control: no-store`. OpenAPI MUST document `GET /api/itsm/settings` (with `reveal` query param) and `PATCH /api/itsm/settings` (with body schema mirroring the regex validators) including `200`/`400`/`403`/`404` responses.

## Impact

**Affected code**
- `gdfkube-src/gdfkube-itsm/scripts/export-seed-data.mjs` (projection logic)
- `gdfkube-src/gdfkube-itsm/src/api/itsmApi.ts` (new `settings` namespace)
- `gdfkube-src/gdfkube-itsm/src/pages/admin/Settings.tsx` (replace raw fetch, drop unused `navigate` prop, drop default export)
- `gdfkube-src/gdfkube-itsm/src/App.tsx` (drop `navigate={navigate}` from `<Settings />`)
- `gdfkube-src/gdfkube-itsm/server/src/routes/settings.ts` (null-body guard, Cache-Control)
- `gdfkube-src/gdfkube-itsm/server/src/openapi.yaml` (document settings routes)
- Regenerated: `gdfkube-src/gdfkube-infra/mongodb/seed-data/users.json`, `groups.json`, `settings.json`

**New files**
- `gdfkube-src/gdfkube-itsm/server/__tests__/settings.test.ts`

**Tests**
- Unit/integration: new vitest backend suite (`settings.test.ts`, 10 cases) using `supertest` + the same in-memory Mongo harness as `groups.test.ts`. New Topbar assertions in `src/shell/__tests__/Topbar.test.tsx`. DB cleanup via existing global `vitest.setup.ts`.
- Smoke: `docker compose up` walkthrough (login as Maria, open user menu → Settings, edit owner, save, verify `updatedBy` reflects active user, toggle role to Operator, confirm "Admin only" notice).

**Dependencies**
- No new dependencies. `supertest`, `vitest`, `mongodb-memory-server`, and `@testing-library/react` are already pinned in the existing `package.json` and used by sibling tests.

**Sibling change coordination**
- Lands before `add-gitea-settings` is archived. The spec amendment (item 8) edits the in-flight change's source files in place; no delta against `openspec/specs/itsm-admin-settings` because that capability has not been merged to the canonical specs tree yet.

**Out of scope**
- Replacing `X-Demo-User` with real auth (pre-existing demo pattern).
- Encryption-at-rest for the PAT (accepted risk in original `design.md`).
- Optimistic-concurrency / `If-Match` on PATCH.
- Vault / K8s Secret integration for token storage.
