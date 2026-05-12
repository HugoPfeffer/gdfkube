# Gitea Settings Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Commit after each task.

**Goal:** Replace the dead "Preferences" topbar placeholder with a working admin-only Settings page that stores global Gitea configuration (endpoint, owner, PAT) in a MongoDB singleton, with non-destructive seeding.

**Architecture:** New Mongoose model (`GiteaSettings`) with singleton `_id: 'gitea'` in `gitea_settings` collection. Express router at `/api/itsm/settings` with GET (token-redacted) and PATCH (validated upsert). React Settings page in `src/pages/admin/Settings.tsx` with admin gating, three validated fields, and toast feedback. Seed pipeline extended with `$setOnInsert` upsert pattern.

**Tech Stack:** TypeScript, Express, Mongoose/MongoDB, React (custom router — no React Router), existing `validate.ts` helper, existing `demoUser`/`requireAdmin` middleware.

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `gdfkube-src/gdfkube-itsm/server/src/models/GiteaSettings.ts` | Mongoose singleton model for `gitea_settings` collection |
| `gdfkube-src/gdfkube-itsm/server/src/routes/settings.ts` | Express router: `GET /` and `PATCH /` for settings CRUD |
| `gdfkube-src/gdfkube-itsm/src/pages/admin/Settings.tsx` | Admin-gated Settings page with form + toast |
| `gdfkube-src/gdfkube-infra/mongodb/seed-data/settings.json` | Generated seed data (written by export script) |

### Modified files

| Path | Responsibility |
|---|---|
| `gdfkube-src/gdfkube-itsm/server/src/app.ts` | Mount settings router at `/api/itsm/settings` |
| `gdfkube-src/gdfkube-itsm/src/types.ts` | Add `'settings'` to `RouteName` union |
| `gdfkube-src/gdfkube-itsm/src/App.tsx` | Add breadcrumb + render branch for `settings` route |
| `gdfkube-src/gdfkube-itsm/src/shell/Topbar.tsx` | Replace "Preferences" `<div>` with "Settings" `<button>` |
| `gdfkube-src/gdfkube-itsm/src/data/adminSeeds.ts` | Add `GITEA_SETTINGS` seed constant (or new `settingsSeeds.ts`) |
| `gdfkube-src/gdfkube-itsm/scripts/export-seed-data.mjs` | Export `gitea_settings` collection |
| `gdfkube-src/gdfkube-infra/mongodb/seed-collections.js` | Add `$setOnInsert` upsert for `gitea_settings` |

### Untouched (DO NOT MODIFY)

Cluster Request form fields, schema, or seeds. Camel routes. ArgoCD config. `values.yaml` Gitea defaults. Existing route handlers for forms/users/groups/requests.

---

## Task 1: Backend model (GiteaSettings)

**Files:** Create: `gdfkube-src/gdfkube-itsm/server/src/models/GiteaSettings.ts`

- [ ] **Step 1:** Read the existing Mongoose model pattern

Read `gdfkube-src/gdfkube-itsm/server/src/models/FormDef.ts` to understand the project's Mongoose model pattern (schema definition, TypeScript interface, export style, collection naming convention).

- [ ] **Step 2:** Create the GiteaSettings model

Create `gdfkube-src/gdfkube-itsm/server/src/models/GiteaSettings.ts`:

```typescript
import mongoose, { Document } from 'mongoose';

export interface IGiteaSettings extends Document {
  _id: string;
  endpoint: string;
  owner: string;
  token: string;
  updatedAt?: Date;
  updatedBy?: string;
}

const giteaSettingsSchema = new mongoose.Schema<IGiteaSettings>(
  {
    _id: { type: String, default: 'gitea' },
    endpoint: { type: String, required: true, match: /^https?:\/\/.+$/ },
    owner: { type: String, required: true, match: /^[a-zA-Z0-9_-]+$/ },
    token: { type: String, required: true },
    updatedAt: { type: Date },
    updatedBy: { type: String },
  },
  { collection: 'gitea_settings', _id: false }
);

export const GiteaSettings = mongoose.model<IGiteaSettings>('GiteaSettings', giteaSettingsSchema);
```

- [ ] **Step 3:** Verify TypeScript compiles

Run: `npx tsc --noEmit --project gdfkube-src/gdfkube-itsm/server/tsconfig.json` (or the project's equivalent type-check command — read `package.json` scripts first)

Expected: No type errors.

- [ ] **Step 4:** Commit

```bash
git add gdfkube-src/gdfkube-itsm/server/src/models/GiteaSettings.ts
git commit -m "feat: add GiteaSettings Mongoose model for gitea_settings singleton"
```

---

## Task 2: Backend API (settings routes)

**Files:** Create: `gdfkube-src/gdfkube-itsm/server/src/routes/settings.ts`, Modify: `gdfkube-src/gdfkube-itsm/server/src/app.ts`

- [ ] **Step 1:** Read the existing route and middleware patterns

Read these files to understand patterns:
- `gdfkube-src/gdfkube-itsm/server/src/routes/users.ts` (lines 16–22 for admin route pattern)
- `gdfkube-src/gdfkube-itsm/server/src/middleware/requireAdmin.ts` (middleware signature)
- `gdfkube-src/gdfkube-itsm/server/src/app.ts` (lines 41–45 for route mount pattern)

Note the middleware chain: `demoUser` (populates `req.demoUser`) → `requireAdmin` (checks `req.demoUser.role === 'admin'`).

- [ ] **Step 2:** Create the settings router

Create `gdfkube-src/gdfkube-itsm/server/src/routes/settings.ts`:

```typescript
import { Router } from 'express';
import { GiteaSettings } from '../models/GiteaSettings';
import { demoUser } from '../middleware/demoUser';
import { requireAdmin } from '../middleware/requireAdmin';

const router = Router();

router.use(demoUser, requireAdmin);

router.get('/', async (req, res) => {
  const doc = await GiteaSettings.findById('gitea').lean();
  if (!doc) return res.status(404).json({ error: 'settings not found' });
  const reveal = req.query.reveal === '1';
  res.json({ ...doc, token: reveal ? doc.token : '***' });
});

router.patch('/', async (req, res) => {
  const { endpoint, owner, token } = req.body;
  const errors: string[] = [];
  if (!endpoint || !/^https?:\/\/.+$/.test(endpoint)) errors.push('endpoint');
  if (!owner || !/^[a-zA-Z0-9_-]+$/.test(owner)) errors.push('owner');
  if (!token) errors.push('token');
  if (errors.length) return res.status(400).json({ error: 'validation failed', fields: errors });

  const doc = await GiteaSettings.findOneAndUpdate(
    { _id: 'gitea' },
    { $set: { endpoint, owner, token, updatedAt: new Date(), updatedBy: (req as any).demoUser.id } },
    { upsert: true, new: true, lean: true }
  );
  res.json({ ...doc, token: '***' });
});

export default router;
```

Adapt the `demoUser` import path and `req.demoUser` typing to match what `users.ts` uses — the exact import path and typing may differ from the above. Read the existing route file to confirm.

- [ ] **Step 3:** Mount the router in app.ts

Read `gdfkube-src/gdfkube-itsm/server/src/app.ts` and add to the route mount block (around lines 41–45):

```typescript
import settingsRouter from './routes/settings';
// ... existing route mounts ...
app.use('/api/itsm/settings', settingsRouter);
```

- [ ] **Step 4:** Verify TypeScript compiles

Run the type-check command. Expected: No type errors.

- [ ] **Step 5:** Commit

```bash
git add gdfkube-src/gdfkube-itsm/server/src/routes/settings.ts gdfkube-src/gdfkube-itsm/server/src/app.ts
git commit -m "feat: add GET/PATCH /api/itsm/settings routes with admin gating"
```

---

## Task 3: Seeding

**Files:** Modify: `gdfkube-src/gdfkube-itsm/src/data/adminSeeds.ts`, `gdfkube-src/gdfkube-itsm/scripts/export-seed-data.mjs`, `gdfkube-src/gdfkube-infra/mongodb/seed-collections.js`

- [ ] **Step 1:** Read the existing seed files

Read these files to understand patterns:
- `gdfkube-src/gdfkube-itsm/src/data/adminSeeds.ts` — how seeds are structured and exported
- `gdfkube-src/gdfkube-itsm/scripts/export-seed-data.mjs` — how the exporter writes JSON files
- `gdfkube-src/gdfkube-infra/mongodb/seed-collections.js` — how the seeder inserts documents (currently uses `replaceOne`)

Also read `gdfkube-src/gdfkube-infra/charts/cluster-request/values.yaml` lines 14–18 to confirm the Gitea defaults that the seed must match.

- [ ] **Step 2:** Add the seed constant

Add to `adminSeeds.ts` (or create `settingsSeeds.ts` if `adminSeeds.ts` is near 200 lines):

```typescript
export const GITEA_SETTINGS = {
  _id: 'gitea',
  endpoint: 'https://gitea-gitea.apps.gdfkube.gov',
  owner: 'gdfkube',
  token: 'CHANGE_ME', // trufflehog:ignore — seed placeholder
  updatedBy: 'seed',
};
```

Verify `endpoint` matches `giteaExternalUrl` and `owner` matches `giteaOwner` from `values.yaml`.

- [ ] **Step 3:** Extend the export script

In `scripts/export-seed-data.mjs`, add a new export block following the existing pattern. It should:
1. Import or reference the `GITEA_SETTINGS` constant
2. Write it to `gdfkube-infra/mongodb/seed-data/settings.json`

Match the existing write pattern (likely `fs.writeFileSync` with `JSON.stringify(..., null, 2)`).

- [ ] **Step 4:** Extend the seeder with $setOnInsert

In `seed-collections.js`, add a new block for `gitea_settings`. **Use `updateOne` + `$setOnInsert`, NOT `replaceOne`:**

```javascript
// gitea_settings: use $setOnInsert so re-seeds don't overwrite admin-edited values.
// This differs from other seeds (which use replaceOne) because settings are
// runtime admin config, not resettable demo fixtures.
const settingsData = JSON.parse(fs.readFileSync('/seed-data/settings.json', 'utf8'));
db.gitea_settings.updateOne(
  { _id: settingsData._id },
  { $setOnInsert: settingsData },
  { upsert: true }
);
print('gitea_settings: seeded (setOnInsert)');
```

Adapt to the exact script shape — the above is pseudocode. Read the existing script to match its style (`db.getSiblingDB`, `load()`, `print()`, etc.).

- [ ] **Step 5:** Run the export script and verify

Run: `node gdfkube-src/gdfkube-itsm/scripts/export-seed-data.mjs` (or the npm script equivalent)

Expected: `gdfkube-src/gdfkube-infra/mongodb/seed-data/settings.json` exists and contains:
```json
{
  "_id": "gitea",
  "endpoint": "https://gitea-gitea.apps.gdfkube.gov",
  "owner": "gdfkube",
  "token": "CHANGE_ME",
  "updatedBy": "seed"
}
```

- [ ] **Step 6:** Commit

```bash
git add gdfkube-src/gdfkube-itsm/src/data/adminSeeds.ts gdfkube-src/gdfkube-itsm/scripts/export-seed-data.mjs gdfkube-src/gdfkube-infra/mongodb/seed-collections.js gdfkube-src/gdfkube-infra/mongodb/seed-data/settings.json
git commit -m "feat: add Gitea settings seed with non-destructive $setOnInsert upsert"
```

---

## Task 4: Frontend routing

**Files:** Modify: `gdfkube-src/gdfkube-itsm/src/types.ts`, `gdfkube-src/gdfkube-itsm/src/App.tsx`

- [ ] **Step 1:** Read the existing routing pattern

Read these files:
- `gdfkube-src/gdfkube-itsm/src/types.ts` — find the `RouteName` union type
- `gdfkube-src/gdfkube-itsm/src/App.tsx` — lines 103–169 for breadcrumb computation and page rendering
- `gdfkube-src/gdfkube-itsm/src/router.ts` — understand the reducer-based router

- [ ] **Step 2:** Add 'settings' to RouteName

In `src/types.ts`, add `'settings'` to the `RouteName` union type.

- [ ] **Step 3:** Add breadcrumb branch

In `src/App.tsx`, add a breadcrumb case for `'settings'` in the breadcrumb computation block (around lines 103–131):

```typescript
case 'settings':
  return ['Settings'];
```

- [ ] **Step 4:** Add render branch

In `src/App.tsx`, add a render case for `'settings'` in the page rendering block (around lines 134–169):

```typescript
{route === 'settings' && <Settings /* pass required props: role, setToast, etc. */ />}
```

Import the Settings component at the top of the file.

- [ ] **Step 5:** Verify TypeScript compiles

Expected: No type errors (the Settings component doesn't exist yet — create a stub or do this task after Task 6).

- [ ] **Step 6:** Commit

```bash
git add gdfkube-src/gdfkube-itsm/src/types.ts gdfkube-src/gdfkube-itsm/src/App.tsx
git commit -m "feat: add settings route to RouteName union and App routing"
```

---

## Task 5: Frontend topbar

**Files:** Modify: `gdfkube-src/gdfkube-itsm/src/shell/Topbar.tsx`

- [ ] **Step 1:** Read the existing topbar

Read `gdfkube-src/gdfkube-itsm/src/shell/Topbar.tsx` — specifically lines 155–165 to find the "Preferences" placeholder and the surrounding menuitem buttons to understand the pattern.

- [ ] **Step 2:** Replace the Preferences placeholder

Replace the inert `<div>` at lines 159–161 with a `<button role="menuitem">`:

```tsx
<button
  role="menuitem"
  className="menu-item"
  onClick={() => { navigate('settings'); setOpen(false); }}
>
  <Cog className="icon" />
  Settings
</button>
```

Adapt to the exact icon import and className used by other menuitem buttons in the same dropdown. The `navigate` function and `setOpen` state setter should already be available from the component's existing props/state.

- [ ] **Step 3:** Verify the build compiles

Run the type-check and build commands.

- [ ] **Step 4:** Commit

```bash
git add gdfkube-src/gdfkube-itsm/src/shell/Topbar.tsx
git commit -m "feat: replace dead Preferences placeholder with Settings navigation"
```

---

## Task 6: Frontend Settings page

**Files:** Create: `gdfkube-src/gdfkube-itsm/src/pages/admin/Settings.tsx`

- [ ] **Step 1:** Read the existing patterns

Read these files for patterns to follow:
- `gdfkube-src/gdfkube-itsm/src/pages/Dashboard.tsx` — line 51 for the admin gating pattern
- `gdfkube-src/gdfkube-itsm/src/forms/validate.ts` — lines 18–46 for the anchored-regex validation helper
- Any existing page that uses `setToast` — for the toast pattern

- [ ] **Step 2:** Create the Settings page component

Create `gdfkube-src/gdfkube-itsm/src/pages/admin/Settings.tsx`. The component should:

1. Accept props matching the pattern used by other pages (likely `role`, `setToast`, and `navigate` at minimum — read `App.tsx` render branches to confirm)
2. If `role !== 'admin'`, render the same "Admin only" notice pattern from `Dashboard.tsx`
3. On mount, fetch `GET /api/itsm/settings?reveal=1` and populate state
4. Render three form fields:
   - **Gitea Endpoint URL**: `<input type="text">`, validation regex `^https?://.+$`, help text
   - **Owner**: `<input type="text">`, validation regex `^[a-zA-Z0-9_-]+$`, help text
   - **Personal Access Token**: `<input type="password">`, non-empty validation, help text
5. Render a read-only metadata strip with `updatedAt` and `updatedBy`
6. Render a Save button that sends `PATCH /api/itsm/settings` and shows toast on success/error

Use the `validate.ts` helper for field validation. Use `fetch` with the same pattern as other pages (check how forms/users pages make API calls).

- [ ] **Step 3:** Verify TypeScript compiles and build succeeds

Run: `npm run typecheck && npm run build` in `gdfkube-src/gdfkube-itsm/`

Expected: Both pass.

- [ ] **Step 4:** Commit

```bash
git add gdfkube-src/gdfkube-itsm/src/pages/admin/Settings.tsx
git commit -m "feat: add admin-only Settings page with Gitea config form"
```

---

## Task 7: Verification

**Files:** None created; validation only.

- [ ] **Step 1:** Type check and build

Run: `cd gdfkube-src/gdfkube-itsm && npm run typecheck && npm run build`

Expected: Both pass with zero errors.

- [ ] **Step 2:** Verify seed export

Run the export script and confirm `gdfkube-infra/mongodb/seed-data/settings.json` is generated with `_id: 'gitea'`, `endpoint: 'https://gitea-gitea.apps.gdfkube.gov'`, `owner: 'gdfkube'`.

- [ ] **Step 3:** Drift check

Compare `settings.json` endpoint/owner against `gdfkube-infra/charts/cluster-request/values.yaml` lines 14–18. They must match.

- [ ] **Step 4:** Pre-commit hooks

Run: `pre-commit run --all-files`

Expected: Pass (trufflehog should not flag the `CHANGE_ME` placeholder due to `trufflehog:ignore`).

- [ ] **Step 5:** Final commit (if any fixups needed)

```bash
git add -A
git commit -m "fix: address verification findings"
```
