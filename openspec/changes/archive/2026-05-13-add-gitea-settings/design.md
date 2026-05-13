## Context

The ITSM portal (`gdfkube-src/gdfkube-itsm/`) has a dead "Preferences" placeholder in the topbar user dropdown (`src/shell/Topbar.tsx:159-161`) — a non-interactive `<div>` with no route. The demo's Gitea instance is configured only via Helm values (`giteaExternalUrl`, `giteaOwner` in `gdfkube-infra/charts/cluster-request/values.yaml`), which means it cannot be re-targeted at runtime and no per-instance credentials (PAT) exist in the app.

The Camel routes are the real consumers of this config: when a cluster request is approved, Camel creates the target repo on Gitea and pushes rendered manifests. ArgoCD watches the same repo. Both need a single, agreed-upon Gitea URL/owner/token.

Sources of truth: existing Mongoose model pattern (`server/src/models/FormDef.ts`), admin route pattern (`server/src/routes/users.ts`), field validation helper (`src/forms/validate.ts`), admin gating pattern (`src/pages/Dashboard.tsx:51`).

## Goals / Non-Goals

**Goals:**

- Replace the dead "Preferences" placeholder with a working "Settings" route.
- Provide a runtime-configurable Gitea endpoint/owner/token surface (UI + API + MongoDB singleton).
- Seed the singleton with project-default values matching `values.yaml`.
- Ensure re-seed never overwrites admin-edited config (`$setOnInsert` pattern).

**Non-Goals:**

- Standing up the actual Gitea container (future change).
- Wiring Camel routes or ArgoCD to consume the new settings from MongoDB.
- Multiple Gitea instances / per-org configuration.
- Auth methods other than PAT.
- Encryption at rest, vault integration, or K8s Secret references.
- Changes to the Cluster Request form fields, schema, or seeds.
- Per-user preferences.

## Decisions

### 1. Singleton document with fixed `_id`

The `gitea_settings` collection holds exactly one document with `_id: 'gitea'`. This avoids multi-document queries, pagination, or any ambiguity about which document is "the" config. The fixed `_id` makes upsert trivial (`findOneAndUpdate({ _id: 'gitea' }, ...)` with `upsert: true`).

Alternative: a generic `settings` collection with `type` field — rejected because it adds query complexity for zero benefit at this scope. If future settings types emerge (e.g., SMTP), they can use the same pattern with a different `_id` (e.g., `_id: 'smtp'`) in the same collection.

### 2. Token redaction with `?reveal=1` opt-in

`GET /api/itsm/settings` always returns `token: "***"` unless the query includes `reveal=1`, in which case the real token is returned. Only admin users can call this endpoint. The Settings page uses `reveal=1` to populate the edit form; dashboard widgets or read-only displays use the default redacted response.

Alternative: separate `/api/itsm/settings/token` endpoint — rejected for adding a route without benefit. The single-endpoint approach keeps the API surface minimal.

### 3. Seed idempotence via `$setOnInsert`

The seeder uses `updateOne({ _id: 'gitea' }, { $setOnInsert: { ... } }, { upsert: true })` instead of the existing `replaceOne` + `upsert` pattern used by `seed-collections.js` for other collections. This deliberately deviates from the existing pattern: `replaceOne` would overwrite an admin's edited config on every re-seed, which is destructive. `$setOnInsert` only writes if the document doesn't exist.

This deviation is called out because the existing `seed-collections.js` uses `replaceOne` for forms, users, groups, and requests — those are demo fixtures that should always reset. Settings are different: they represent runtime admin config that must survive re-seeds.

### 4. Topbar: `<button role="menuitem">` replacing inert `<div>`

The current "Preferences" item is a `<div>` with no interactivity. The replacement "Settings" item uses `<button role="menuitem">` to match the existing menuitem buttons in the same dropdown (e.g., role switcher). The button calls `navigate('settings')` and closes the dropdown via the same `setOpen(false)` pattern.

### 5. Admin-only page with inline role check

The Settings page checks `role !== 'admin'` and renders an "Admin only" notice (matching the pattern in `Dashboard.tsx:51`). The API routes use the `demoUser` + `requireAdmin` middleware chain from `users.ts`. This dual gating ensures both the UI and API are protected.

### 6. Validation reuses anchored-regex pattern

The form fields use the same anchored-regex validation pattern as the existing `validate.ts` helper. `endpoint` uses `^https?://.+$` and `owner` uses `^[a-zA-Z0-9_-]+$`. The backend Mongoose schema enforces the same patterns via `match` validators.

## Risks / Trade-offs

**[Token stored in plaintext in MongoDB]** → The PAT is stored inline without encryption. This is consistent with how the rest of the demo handles values (no vault, no K8s secrets). **Mitigation:** the token is redacted in API responses by default; `reveal=1` requires admin auth. For production use, vault integration is a future enhancement.

**[Seed values hardcode demo-specific URL/owner]** → The seeded `endpoint` and `owner` must match `values.yaml`. If `values.yaml` changes without updating the seed, there's drift. **Mitigation:** the acceptance criteria include a drift check comparing seed JSON against `values.yaml`. The export script regenerates `settings.json` from the TS seed source, keeping one source of truth.

**[$setOnInsert deviates from existing seed pattern]** → Other seeds use `replaceOne` which is destructive. A developer unfamiliar with the deviation might switch to `replaceOne` for consistency. **Mitigation:** inline comment in `seed-collections.js` explaining the rationale. Called out in this design doc.

**[No migration needed]** → This is purely additive: new collection, new routes, new page. No existing data or behavior is altered. The `gitea_settings` collection is created fresh by the seeder. Rollback: remove the new files, revert the modified files.
