## 1. Seed-export script projection

- [x] 1.1 In `gdfkube-src/gdfkube-itsm/scripts/export-seed-data.mjs`, add `username: user.username` to the users mapper (the field that `App.tsx::pickUser` and `setDemoUserResolver` depend on)
- [x] 1.2 In the same script, revert the groups mapper to a pure projection emitting `{ _id, name, fullName, users, forms, repo, clusters }` from the source — preserve numeric `users`/`forms`/`clusters` (matching `Group` in `src/types.ts`)
- [x] 1.3 Wrap each `writeFile` value in `JSON.stringify(...) + '\n'` so every emitted JSON file ends with a newline
- [x] 1.4 Run `npm run seed:export` from `gdfkube-src/gdfkube-itsm/` and commit the regenerated `gdfkube-src/gdfkube-infra/mongodb/seed-data/users.json`, `groups.json`, `settings.json`
- [x] 1.5 `git diff gdfkube-src/gdfkube-infra/mongodb/seed-data/users.json gdfkube-src/gdfkube-infra/mongodb/seed-data/groups.json` — verify the diff only restores `username` and numeric counts; no other shape mutation

## 2. SPA Settings page audit trail (itsmApi wiring)

- [x] 2.1 In `gdfkube-src/gdfkube-itsm/src/api/itsmApi.ts`, add a `settings` namespace mirroring the existing `groups` block with `get(reveal?, signal?)` and `update(body, signal?)` methods
- [x] 2.2 In `gdfkube-src/gdfkube-itsm/src/pages/admin/Settings.tsx`, replace the two raw `fetch('/api/itsm/settings...', { headers: { 'X-Demo-User': 'maria.costa' } })` calls with `itsmApi.settings.get(true, ctrl.signal)` and `itsmApi.settings.update(form)`
- [x] 2.3 Catch `ApiError` from the helper: treat `err.status === 404` on the load path as the empty-form / first-save path; surface `err.details?.fields` in the PATCH error toast `body` so admins see which field failed
- [x] 2.4 Drop the unused `navigate` from `SettingsProps`, remove the destructure, remove the unused `Navigate` import, and drop the `export default Settings` line (`App.tsx:19` imports the named binding only)
- [x] 2.5 In `gdfkube-src/gdfkube-itsm/src/App.tsx:170`, drop `navigate={navigate}` from `<Settings ... />` to match the trimmed props
- [x] 2.6 Replace the three inline `style={{ ... }}` blocks in `Settings.tsx` with existing class names (`card-body` for padding/flex) — accept that the meta strip uses `field-help` styling, or add a one-off `settings-meta` rule to the global stylesheet if needed

## 3. Backend tests for settings routes

- [x] 3.1 Create `gdfkube-src/gdfkube-itsm/server/__tests__/settings.test.ts` mirroring the layout of `__tests__/groups.test.ts` (vitest + supertest + `buildApp()`)
- [x] 3.2 Add scenario: `GET /api/itsm/settings` admin → 200, `token === '***'`, response includes `endpoint`/`owner`/`updatedAt`/`updatedBy`
- [x] 3.3 Add scenario: `GET /api/itsm/settings?reveal=1` admin → 200, `token === 'real-token-value'`, response `Cache-Control` header equals `no-store`
- [x] 3.4 Add scenario: `GET /api/itsm/settings` non-admin (`joao.silva`) → 403
- [x] 3.5 Add scenario: `GET /api/itsm/settings` with no document seeded → 404
- [x] 3.6 Add scenario: `PATCH /api/itsm/settings` admin valid body → 200, DB has new fields, `updatedBy === 'maria.costa'`, `updatedAt` is recent, response `token === '***'`
- [x] 3.7 Add scenario: `PATCH /api/itsm/settings` admin invalid endpoint (`not-a-url`) → 400, DB unchanged
- [x] 3.8 Add scenario: `PATCH /api/itsm/settings` admin invalid owner (`bad owner!!`) → 400, DB unchanged
- [x] 3.9 Add scenario: `PATCH /api/itsm/settings` admin empty token → 400
- [x] 3.10 Add scenario: `PATCH /api/itsm/settings` admin null body / array body / non-object scalar body → 400, response `{ error: 'invalid body' }`, DB unchanged
- [x] 3.11 Add scenario: `PATCH /api/itsm/settings` non-admin → 403

## 4. Topbar test for the Settings menu item

- [x] 4.1 In `gdfkube-src/gdfkube-itsm/src/shell/__tests__/Topbar.test.tsx`, move `const navigate = vi.fn();` and `const setRole = vi.fn();` inside `describe('Topbar', ...)`; add `beforeEach(() => { navigate.mockClear(); setRole.mockClear(); })`
- [x] 4.2 Factor a `renderTopbar(overrides = {})` helper that supplies the default props (`crumbs`, `role`, `setRole`, `user`, `navigate`) merged with overrides — collapses the existing repeated render blocks
- [x] 4.3 Add test `'shows Settings item with cog icon in the user dropdown'` — open dropdown, assert `Settings` text is present, assert `Preferences` is NOT present
- [x] 4.4 Add test `'clicking Settings calls navigate("settings") and closes the dropdown'` — open dropdown, click Settings button, expect `navigate` called once with `'settings'`, then assert dropdown is closed (existing dropdown-close pattern)
- [x] 4.5 Assert keyboard semantics — the Settings button is `role="menuitem"` (mirror the assertions already present on the role-switch button)

## 5. Backend hardening (routes/settings.ts)

- [x] 5.1 In `gdfkube-src/gdfkube-itsm/server/src/routes/settings.ts`, before the PATCH destructure, guard against malformed bodies: `if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) { res.status(400).json({ error: 'invalid body' }); return; }`
- [x] 5.2 In the GET handler in the same file, when `reveal === true`, call `res.set('Cache-Control', 'no-store')` before `res.json(...)`

## 6. OpenAPI documentation

- [x] 6.1 In `gdfkube-src/gdfkube-itsm/server/src/openapi.yaml`, add a `GET /api/itsm/settings` operation with optional `reveal` query parameter and `200`/`403`/`404` responses (mirror the conventions used by `/api/itsm/users` and `/api/itsm/groups`)
- [x] 6.2 Add a `PATCH /api/itsm/settings` operation with a request body schema (`endpoint` string matching `^https?://.+$`, `owner` string matching `^[a-zA-Z0-9_-]+$`, `token` non-empty string) and `200`/`400`/`403` responses
- [x] 6.3 Run the OpenAPI contract test at `gdfkube-src/gdfkube-itsm/server/__tests__/openapi.test.ts` to confirm no missing-route or schema-mismatch failures

## 7. Spec amendment in the in-flight add-gitea-settings change

- [x] 7.1 In `openspec/changes/add-gitea-settings/tasks.md` task 6.2, replace "Reuse `src/forms/validate.ts` for anchored-regex validation" with "Inline regex constants matching server-side `match` validators in `models/GiteaSettings.ts`"
- [x] 7.2 In `openspec/changes/add-gitea-settings/specs/itsm-admin-settings/spec.md`, under "Settings form SHALL render three validated fields", replace "Field validation MUST reuse the existing anchored-regex helper at `src/forms/validate.ts`" with "Field validation regex constants MUST match the server-side `match` validators in `server/src/models/GiteaSettings.ts`."

## 8. Verification

- [ ] 8.1 `cd gdfkube-src/gdfkube-itsm/server && npm test` — new `settings.test.ts` passes; existing suites still pass
- [x] 8.2 `cd gdfkube-src/gdfkube-itsm && npm test` — Topbar tests (existing + new Settings assertions) pass; no cross-test state bleed
- [x] 8.3 `cd gdfkube-src/gdfkube-itsm && npm run typecheck && npm run build` — clean
- [x] 8.4 `cd gdfkube-src/gdfkube-itsm && npm run seed:export` — `users.json` contains `username` on every doc; `groups.json` has numeric `users`/`forms`/`clusters`; all three regenerated files end with `\n`
- [ ] 8.5 `docker compose up -d` and wait for `mongo-seed` to complete; open the SPA, log in as Maria (admin), open the user dropdown → click **Settings**
- [ ] 8.6 Confirm the dropdown closes; the page renders the form with values matching `gdfkube-infra/charts/cluster-request/values.yaml` (`https://gitea-gitea.apps.gdfkube.gov` / `gdfkube`)
- [ ] 8.7 Edit `owner` to `myorg`, click Save → success toast; refresh → `Last updated by maria.costa` appears in the metadata strip
- [ ] 8.8 Toggle role to Operator → Settings page renders "Admin only" notice
- [ ] 8.9 Toggle back to admin; deliberately enter `not-a-url` in the endpoint field → Save → error toast surfaces the offending field name
- [ ] 8.10 Stop one Mongo node, click Save → error toast surfaces a useful server-error string (no SPA crash)
- [x] 8.11 `pre-commit run --all-files` — passes (trufflehog clean on `CHANGE_ME` placeholder; no new findings)
