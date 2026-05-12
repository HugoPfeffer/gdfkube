## 1. Backend model (GiteaSettings)

- [x] 1.1 Create `gdfkube-src/gdfkube-itsm/server/src/models/GiteaSettings.ts` with Mongoose schema: `_id` (String, default `'gitea'`), `endpoint` (String, required, match `/^https?:\/\/.+$/`), `owner` (String, required, match `/^[a-zA-Z0-9_-]+$/`), `token` (String, required), `updatedAt` (Date), `updatedBy` (String). Collection name `gitea_settings`. Follow the pattern in `FormDef.ts`.

## 2. Backend API (settings routes)

- [x] 2.1 Create `gdfkube-src/gdfkube-itsm/server/src/routes/settings.ts` with an Express router exposing `GET /` and `PATCH /`, both gated by `demoUser` and `requireAdmin` middleware (mirror `routes/users.ts` pattern)
- [x] 2.2 `GET /` handler: fetch the singleton (`_id: 'gitea'`), return 404 if not found, redact `token` to `"***"` unless `req.query.reveal === '1'`, return the document
- [x] 2.3 `PATCH /` handler: validate body (`endpoint` matches `/^https?:\/\/.+$/`, `owner` matches `/^[a-zA-Z0-9_-]+$/`, `token` is non-empty), return 400 on failure. On success, upsert the singleton with `findOneAndUpdate({ _id: 'gitea' }, { $set: { endpoint, owner, token, updatedAt: new Date(), updatedBy: req.demoUser.id } }, { upsert: true, new: true })`, redact `token` in the response
- [x] 2.4 Register the router in `server/src/app.ts`: `app.use('/api/itsm/settings', settingsRouter)` (add to the route mount block at lines 41–45)

## 3. Seeding

- [x] 3.1 Add `GITEA_SETTINGS` seed constant in `gdfkube-src/gdfkube-itsm/src/data/adminSeeds.ts` (or a new `settingsSeeds.ts` if `adminSeeds.ts` would exceed ~200 lines): `{ _id: 'gitea', endpoint: 'https://gitea-gitea.apps.gdfkube.gov', owner: 'gdfkube', token: 'CHANGE_ME', updatedBy: 'seed' }` with `// trufflehog:ignore` comment on the token
- [x] 3.2 Extend `gdfkube-src/gdfkube-itsm/scripts/export-seed-data.mjs` to export the `gitea_settings` collection to `gdfkube-infra/mongodb/seed-data/settings.json`
- [x] 3.3 Extend `gdfkube-src/gdfkube-infra/mongodb/seed-collections.js` to upsert into `gitea_settings` using `updateOne({ _id: 'gitea' }, { $setOnInsert: { ... } }, { upsert: true })` — NOT `replaceOne`. Add an inline comment explaining the `$setOnInsert` rationale (non-destructive re-seed)
- [x] 3.4 Run `npm run seed:export` (or the export script) and verify `gdfkube-infra/mongodb/seed-data/settings.json` is generated with the expected shape

## 4. Frontend routing

- [x] 4.1 Add `'settings'` to the `RouteName` union in `gdfkube-src/gdfkube-itsm/src/types.ts`
- [x] 4.2 Add a `case 'settings':` breadcrumb branch in `gdfkube-src/gdfkube-itsm/src/App.tsx` (around lines 103–131) returning `['Settings']`
- [x] 4.3 Add a `route === 'settings'` render branch in `gdfkube-src/gdfkube-itsm/src/App.tsx` (around lines 134–169) rendering `<Settings />` with the appropriate props

## 5. Frontend topbar

- [x] 5.1 In `gdfkube-src/gdfkube-itsm/src/shell/Topbar.tsx`, rename "Preferences" to "Settings" (lines 159–161)
- [x] 5.2 Convert the placeholder `<div>` into a `<button role="menuitem">` that calls `navigate('settings')` and closes the dropdown (mirror existing menuitem buttons in the same file)

## 6. Frontend Settings page

- [x] 6.1 Create `gdfkube-src/gdfkube-itsm/src/pages/admin/Settings.tsx` with admin-gating check (if `role !== 'admin'`, render "Admin only" notice, mirror `Dashboard.tsx:51` pattern)
- [x] 6.2 Add three form fields: Gitea Endpoint URL (text, regex validation), Owner (text, regex validation), Personal Access Token (type="password", non-empty validation). Reuse `src/forms/validate.ts` for anchored-regex validation
- [x] 6.3 Add read-only metadata strip showing `updatedAt` and `updatedBy`
- [x] 6.4 Add Save button → `PATCH /api/itsm/settings`. Toast on success/error using the existing `setToast` prop pattern
- [x] 6.5 On mount, fetch `GET /api/itsm/settings?reveal=1` and populate the form fields

## 7. Verification

- [x] 7.1 Run `npm run typecheck` and `npm run build` in `gdfkube-src/gdfkube-itsm/` — both must pass
- [x] 7.2 Verify seed export generates `settings.json` matching the seeded shape
- [x] 7.3 Confirm seed JSON `endpoint`/`owner` still match `gdfkube-infra/charts/cluster-request/values.yaml`
- [x] 7.4 Run `pre-commit run --all-files` — must pass
