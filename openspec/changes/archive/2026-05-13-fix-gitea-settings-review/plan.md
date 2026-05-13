# fix-gitea-settings-review Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development
> to implement this plan task-by-task.

**Goal:** Land the corrective scope for the `add-gitea-settings` review findings as one bundled change so the parent change can be archived from a verified state.

**Architecture:** Bundle four interlocked fixes — seed-export shape preservation, Settings.tsx routing through `itsmApi` for audit-trail correctness, backend + Topbar test coverage, and PATCH/cache hardening — into a single PR. Spec correction (validate.ts reuse → inline regex constants) edits the in-flight `add-gitea-settings` change source rather than emitting a delta here, because the parent capability has not been merged to `openspec/specs/` yet.

**Tech Stack:** Node.js, TypeScript, Express, Mongoose, React, Vitest, supertest, mongodb-memory-server, OpenAPI 3.1, MongoDB.

The source for this plan is `.claude/plans/polished-jumping-corbato.md` (the user-authored fix-up plan). The micro-steps below mirror the numbered tasks in `tasks.md` and trace back to the requirements in `specs/itsm-express-api/spec.md` plus the spec amendment described in `design.md` decision D7.

---

## Task 1: Seed-export script projection

Maps to `tasks.md` §1.

- [ ] **Step 1.1:** Open `gdfkube-src/gdfkube-itsm/scripts/export-seed-data.mjs`. In the users mapper (lines 37–47), add `username: user.username` to the projected object alongside the existing fields.
- [ ] **Step 1.2:** In the groups mapper (lines 49–57), revert to a pure projection of the source values from `src/data/adminSeeds.ts:292`:
  ```js
  const groups = GROUPS.map((group) => ({
    _id: group.id,
    name: group.name,
    fullName: group.fullName,
    users: group.users,
    forms: group.forms,
    repo: group.repo,
    clusters: group.clusters,
  }));
  ```
  Verify the emitted shape matches `Group` in `gdfkube-src/gdfkube-itsm/src/types.ts:128–136` (`users: number`, `forms: number`, `clusters: number | null`). The only SPA consumer, `src/pages/admin/Users.tsx`, renders `{g.clusters ?? '—'}` as a scalar — do not return arrays.
- [ ] **Step 1.3:** In the `writeFile` block (lines 60–64), wrap each value in `JSON.stringify(<value>, null, 2) + '\n'` so every emitted JSON file ends with a newline.
- [ ] **Step 1.4:** `cd gdfkube-src/gdfkube-itsm && npm run seed:export` — regenerates `gdfkube-src/gdfkube-infra/mongodb/seed-data/users.json`, `groups.json`, `settings.json`.
- [ ] **Step 1.5:** `git diff gdfkube-src/gdfkube-infra/mongodb/seed-data/` — verify only `username` restoration and numeric group counts; abort and investigate if any other shape mutation appears.
- [ ] **Commit:** `fix(seed-export): restore username and numeric group counts; append trailing newline`.

---

## Task 2: SPA Settings page audit trail (itsmApi wiring)

Maps to `tasks.md` §2. See `design.md` decision D2.

- [ ] **Step 2.1:** In `gdfkube-src/gdfkube-itsm/src/api/itsmApi.ts`, add a `settings` namespace after the `groups` block (around lines 147–172):
  ```ts
  settings: {
    get(reveal?: boolean, signal?: AbortSignal) {
      const q = reveal ? '?reveal=1' : '';
      return api<Record<string, unknown>>(`/api/itsm/settings${q}`, { signal });
    },
    update(
      body: { endpoint: string; owner: string; token: string },
      signal?: AbortSignal,
    ) {
      return api<Record<string, unknown>>('/api/itsm/settings', {
        method: 'PATCH',
        body: JSON.stringify(body),
        signal,
      });
    },
  },
  ```
- [ ] **Step 2.2:** In `gdfkube-src/gdfkube-itsm/src/pages/admin/Settings.tsx`, replace the load `fetch('/api/itsm/settings?reveal=1', { headers: { 'X-Demo-User': 'maria.costa' } })` with `itsmApi.settings.get(true, ctrl.signal)`. Replace the save `fetch(...)` with `itsmApi.settings.update(form)`. The shared `api` helper (line 31 of `itsmApi.ts`) already injects `X-Demo-User` from `demoUserResolver()` — wired in `App.tsx:83–85` to the active user.
- [ ] **Step 2.3:** Catch `ApiError`:
  - On load: if `err.status === 404`, leave the form blank (first-save path; upsert will materialize the doc).
  - On PATCH: surface `err.details?.fields` (server returns `{ error: 'validation failed', fields: ['endpoint'] }`) in the toast `body`.
- [ ] **Step 2.4:** Drop `navigate` from `SettingsProps`, remove its destructure, remove `Navigate` from the imports, and remove the trailing `export default Settings` line. `App.tsx:19` only consumes the named binding.
- [ ] **Step 2.5:** In `gdfkube-src/gdfkube-itsm/src/App.tsx:170`, drop `navigate={navigate}` from the `<Settings ... />` render.
- [ ] **Step 2.6:** Replace the three `style={{ ... }}` blocks in `Settings.tsx` with existing class names. Use `card-body` for the form wrapper. The metadata strip MAY reuse `field-help`; if you need a one-off class, add `settings-meta` to the global stylesheet rather than a new component CSS module.
- [ ] **Commit:** `fix(itsm-spa): route Settings page through itsmApi for accurate audit trail`.

---

## Task 3: Backend tests for settings routes

Maps to `tasks.md` §3. Mirrors `__tests__/groups.test.ts` layout.

- [ ] **Step 3.1:** Create `gdfkube-src/gdfkube-itsm/server/__tests__/settings.test.ts` with the imports and seed scaffold:
  ```ts
  import { describe, it, expect, beforeEach } from 'vitest';
  import request from 'supertest';
  import { buildApp } from '../src/app.js';
  import { GiteaSettings } from '../src/models/GiteaSettings.js';

  const app = buildApp();
  const ADMIN = 'maria.costa';
  const OPERATOR = 'joao.silva';
  const SEED = {
    _id: 'gitea',
    endpoint: 'https://gitea.example.com',
    owner: 'myorg',
    token: 'real-token-value',
  };
  ```
  DB cleanup is handled by the existing global `vitest.setup.ts` (clears all collections before each test) — no extra `beforeEach` teardown needed.
- [ ] **Step 3.2:** Add `it('GET admin → 200 with redacted token', ...)` — seed `SEED`, call `request(app).get('/api/itsm/settings').set('X-Demo-User', ADMIN)`, assert `status === 200`, `body.token === '***'`, body contains `endpoint`/`owner`/`updatedAt`/`updatedBy`.
- [ ] **Step 3.3:** Add `it('GET admin reveal=1 → 200 with cleartext token and Cache-Control: no-store', ...)` — seed `SEED`, GET with `?reveal=1`, assert `body.token === 'real-token-value'` and `headers['cache-control'] === 'no-store'`.
- [ ] **Step 3.4:** Add `it('GET non-admin → 403', ...)` — seed `SEED`, GET with `X-Demo-User: OPERATOR`, assert `status === 403`.
- [ ] **Step 3.5:** Add `it('GET no doc → 404', ...)` — no seed, GET as admin, assert `status === 404`.
- [ ] **Step 3.6:** Add `it('PATCH admin valid → 200, DB updated, audit stamped', ...)` — PATCH `{ endpoint: 'https://new.example.com', owner: 'neworg', token: 'new-pat' }`, assert `body.token === '***'`, then read DB and assert `updatedBy === ADMIN`, `updatedAt` within ±2s, fields updated.
- [ ] **Step 3.7:** Add `it('PATCH invalid endpoint → 400, DB unchanged', ...)` — seed, PATCH `{ endpoint: 'not-a-url', owner: 'ok', token: 'ok' }`, assert `400`, then read DB and assert no mutation.
- [ ] **Step 3.8:** Add `it('PATCH invalid owner → 400, DB unchanged', ...)` — same shape with `owner: 'bad owner!!'`.
- [ ] **Step 3.9:** Add `it('PATCH empty token → 400', ...)` — `token: ''`.
- [ ] **Step 3.10:** Add three cases under `it.each([null, [], 'string'])` for malformed body → 400 with `body.error === 'invalid body'`, DB unchanged.
- [ ] **Step 3.11:** Add `it('PATCH non-admin → 403', ...)` — PATCH with operator header, assert `403`.
- [ ] **Step 3.12:** `npm test --workspace gdfkube-src/gdfkube-itsm/server -- __tests__/settings.test.ts` — all green.
- [ ] **Commit:** `test(itsm-api): add settings route coverage (10 scenarios)`.

---

## Task 4: Topbar test for the Settings menu item

Maps to `tasks.md` §4.

- [ ] **Step 4.1:** In `gdfkube-src/gdfkube-itsm/src/shell/__tests__/Topbar.test.tsx`, move `const navigate = vi.fn();` and `const setRole = vi.fn();` from module scope into the `describe('Topbar', ...)` block; add `beforeEach(() => { navigate.mockClear(); setRole.mockClear(); })`.
- [ ] **Step 4.2:** Factor a `function renderTopbar(overrides: Partial<TopbarProps> = {})` helper that returns `render(<Topbar {...defaultProps} {...overrides} />)`. Replace the 11 repeated render blocks with calls to it.
- [ ] **Step 4.3:** Add `it('shows Settings item with cog icon in the user dropdown', ...)` — `renderTopbar()`, click the user avatar to open the dropdown, assert `screen.getByText('Settings')` is present, `screen.queryByText('Preferences')` is null.
- [ ] **Step 4.4:** Add `it('clicking Settings calls navigate("settings") and closes the dropdown', ...)` — open dropdown, `fireEvent.click(screen.getByRole('menuitem', { name: /settings/i }))`, assert `navigate` called once with `'settings'`, then assert the dropdown is closed (existing pattern: `queryByText('Settings')` is null).
- [ ] **Step 4.5:** Assert the Settings button has `role="menuitem"` — mirror the existing role-switch button assertion already in the file.
- [ ] **Step 4.6:** `npm test --workspace gdfkube-src/gdfkube-itsm -- src/shell/__tests__/Topbar.test.tsx` — all green; no cross-test bleed.
- [ ] **Commit:** `test(itsm-spa): cover Topbar Settings menu item and dropdown close`.

---

## Task 5: Backend hardening (routes/settings.ts)

Maps to `tasks.md` §5. Maps to spec requirements "Settings PATCH SHALL reject malformed bodies before destructuring" and "Settings GET with reveal=1 SHALL emit Cache-Control no-store".

- [ ] **Step 5.1:** In `gdfkube-src/gdfkube-itsm/server/src/routes/settings.ts`, before the PATCH destructure (current line 24), insert:
  ```ts
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    res.status(400).json({ error: 'invalid body' });
    return;
  }
  ```
- [ ] **Step 5.2:** In the GET handler in the same file, when `reveal === true`, call `res.set('Cache-Control', 'no-store')` immediately before `res.json(...)`.
- [ ] **Step 5.3:** `npm test --workspace gdfkube-src/gdfkube-itsm/server -- __tests__/settings.test.ts` — confirms the new cases from Task 3 now pass.
- [ ] **Commit:** `fix(itsm-api): guard PATCH /settings against malformed bodies; no-store on reveal`.

---

## Task 6: OpenAPI documentation

Maps to `tasks.md` §6. Maps to spec requirement "OpenAPI spec SHALL document the Settings endpoints".

- [ ] **Step 6.1:** In `gdfkube-src/gdfkube-itsm/server/src/openapi.yaml`, add `paths['/api/itsm/settings'].get` mirroring the conventions used by `/api/itsm/users` and `/api/itsm/groups`. Declare an optional `reveal` query parameter (boolean) and `200`/`403`/`404` responses. Reference an inline or component schema for the response body.
- [ ] **Step 6.2:** Add `paths['/api/itsm/settings'].patch` with a `requestBody` schema declaring `endpoint` (string, `pattern: ^https?://.+$`), `owner` (string, `pattern: ^[a-zA-Z0-9_-]+$`), and `token` (string, `minLength: 1`), and `200`/`400`/`403` responses.
- [ ] **Step 6.3:** `npm test --workspace gdfkube-src/gdfkube-itsm/server -- __tests__/openapi.test.ts` — the existing contract test must pass with no missing-route or schema-mismatch failures.
- [ ] **Commit:** `docs(itsm-api): document /api/itsm/settings in openapi.yaml`.

---

## Task 7: Spec amendment in the in-flight add-gitea-settings change

Maps to `tasks.md` §7. See `design.md` decision D7.

- [ ] **Step 7.1:** In `openspec/changes/add-gitea-settings/tasks.md` task 6.2, replace "Reuse `src/forms/validate.ts` for anchored-regex validation" with "Inline regex constants matching server-side `match` validators in `models/GiteaSettings.ts`".
- [ ] **Step 7.2:** In `openspec/changes/add-gitea-settings/specs/itsm-admin-settings/spec.md`, under the "Settings form SHALL render three validated fields" requirement, replace the sentence "Field validation MUST reuse the existing anchored-regex helper at `src/forms/validate.ts`." with "Field validation regex constants MUST match the server-side `match` validators in `server/src/models/GiteaSettings.ts`."
- [ ] **Commit:** `docs(openspec): correct validate.ts reuse requirement in add-gitea-settings`.

---

## Task 8: Verification

Maps to `tasks.md` §8.

- [ ] **Step 8.1:** `cd gdfkube-src/gdfkube-itsm/server && npm test` — new `settings.test.ts` (10 cases) passes; existing suites still pass.
- [ ] **Step 8.2:** `cd gdfkube-src/gdfkube-itsm && npm test` — Topbar tests (existing + new) pass; no cross-test state bleed.
- [ ] **Step 8.3:** `cd gdfkube-src/gdfkube-itsm && npm run typecheck && npm run build` — both clean.
- [ ] **Step 8.4:** `cd gdfkube-src/gdfkube-itsm && npm run seed:export` (already executed in Task 1.4; re-run if any later step regenerated unrelated state) — confirm `users.json` includes `username` on every doc, `groups.json` has numeric `users`/`forms`/`clusters` matching `Group`, all three regenerated files end with `\n`.
- [ ] **Step 8.5:** `docker compose up -d` — wait for `mongo-seed` to complete. Open the SPA, log in as Maria (admin), open the user dropdown → click **Settings**.
- [ ] **Step 8.6:** Confirm the dropdown closes. The page renders the form with values matching `gdfkube-src/gdfkube-infra/charts/cluster-request/values.yaml` (`https://gitea-gitea.apps.gdfkube.gov` / `gdfkube`).
- [ ] **Step 8.7:** Edit `owner` to `myorg`, click **Save** → success toast. Refresh → metadata strip reads `Last updated by maria.costa`.
- [ ] **Step 8.8:** Toggle role to Operator → Settings page renders the "Admin only" notice and does not render the form.
- [ ] **Step 8.9:** Toggle back to admin. Deliberately enter `not-a-url` in the endpoint field → **Save** → error toast surfaces the offending field name.
- [ ] **Step 8.10:** Stop one Mongo node, click **Save** → error toast surfaces a useful server-error string; no SPA crash.
- [ ] **Step 8.11:** `pre-commit run --all-files` — passes (trufflehog clean on `CHANGE_ME` placeholder; no new findings).
- [ ] **Commit (if any verification follow-ups landed):** `chore: address verification follow-ups`.

---

## Out of scope

Tracked in `design.md` "Non-Goals":

- Replacing the `X-Demo-User` header model with real auth.
- Encryption-at-rest for the PAT.
- Optimistic-concurrency / `If-Match` on PATCH.
- Vault / K8s Secret integration for token storage.
