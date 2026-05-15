## Why

The ITSM admin Save flows leak data and errors in eight specific ways
(M-5 / M-6 / M-7 / M-8 / M-9 / M-19 / M-20 / M-21): UserEditor drops
`fullName` and `active` on Save; the Group PATCH whitelist accepts three
fields the UI never sends; NewUserPage and NewFormPage silently swallow
create failures; both editors discard the server's normalized response;
NewGroupPage's post-create reducer falls back to local guesses; and
`itsmApi.ts` loses non-JSON 5xx error bodies. Tests don't catch any of it
because they only check loose body shape. Fixing now closes a coherent
cluster of admin-write defects before the next demo pass.

## What Changes

**UserEditor Save body**
- From: `{ name, username, email, group, role, status, mfa }` only.
- To: also includes `fullName` and `active` when those fields are dirty.
- Reason: M-5 — Full name input cannot currently be persisted.
- Impact: non-breaking; server already accepts both keys.

**Group PATCH whitelist (server)**
- From: `{ name, fullName, users, forms, repo, clusters }`.
- To: `{ name, fullName, repo }`.
- Reason: M-6 — `users / forms / clusters` are unreachable from the UI; dead
  write surface. (Option A from brainstorm.md.)
- Impact: PATCHes targeting `users`, `forms`, or `clusters` now return 400.
  Storage of those fields is unchanged.

**Save response round-trip (UserEditor, GroupEditor)**
- From: editors discard the response and re-use the local pre-save object.
- To: editors capture the server response, dispatch it into the reducer,
  and use it to derive `setSaved(...)`.
- Reason: M-8 — server-side normalization (trim/case) currently never
  reaches the UI.
- Impact: non-breaking.

**Create-failure error surfacing (NewUserPage, NewFormPage)**
- From: `catch { setIsSaving(false); }` — silent.
- To: emit a toast via the existing `setToast` prop, matching
  NewGroupPage's pattern.
- Reason: M-7 — inconsistent error UX across the three create pages.
- Impact: requires threading `setToast` from `App.tsx` into both pages.

**NewGroupPage post-create reducer merge**
- From: `created.<field> ?? local.<field>` fallback chain.
- To: use the server response directly; if a field is omitted, let the
  next refetch reconcile.
- Reason: M-19 — local guesses can silently mask missing server fields.
- Impact: non-breaking under correct server behavior.

**itsmApi.ts error body capture**
- From: non-JSON 5xx bodies are swallowed; only `statusText` reaches UI.
- To: on `.json()` parse failure, fall through to `statusText` and append
  the raw `await response.text()` to the thrown error message.
- Reason: M-20 — 5xx debugging is currently blind in the SPA.
- Impact: non-breaking; call signatures unchanged.

**Tests**
- Add `UserEditor.test.tsx` PATCH-body assertions for `fullName` and
  `active` (covers M-5).
- Tighten `GroupEditor.test.tsx:100` from `objectContaining({ name })` to
  an exact `{ name, fullName, repo }` body (covers M-9).
- Add `NewUserPage.test.tsx` and `NewFormPage.test.tsx` toast assertions
  on create failure (covers M-7).
- Extend `server/__tests__/users.test.ts:119-126` to PATCH `username` and
  `active` (covers M-21).
- Add `server/__tests__/groups.test.ts` cases: positive PATCH on
  `{ name, fullName, repo }`; negative PATCH on `{ users: 5 }` returns 400.

## Capabilities

### New Capabilities
<!-- None — this change is entirely modifications to existing capabilities. -->

### Modified Capabilities
- `itsm-admin-users`: UserEditor MUST include `fullName` and `active` in the
  Save body when dirty; both editors MUST capture the server response and
  dispatch it into the reducer; NewUserPage MUST surface create failures via
  toast; NewGroupPage MUST use the server response directly post-create
  (no `created.* ?? local` fallback).
- `itsm-groups-collection`: PATCH whitelist trims from
  `{ name, fullName, users, forms, repo, clusters }` to
  `{ name, fullName, repo }`. PATCH of any other key MUST return 400.
- `itsm-users-collection`: PATCH whitelist documented as
  `{ name, fullName, email, role, group, status, username, active, mfa,
  last }` — closes the drift between spec and server code (commit 19c7371).
- `itsm-admin-forms`: NewFormPage MUST surface create failures via toast.
- `itsm-portal-shell`: `App.tsx` MUST thread `setToast` to both NewUserPage
  and NewFormPage; frontend API client (`itsmApi.ts`) MUST include
  non-JSON 5xx response bodies in thrown errors.

## Impact

**Affected code (blast radius — 7 source + 5 test files):**
- SPA: `gdfkube-itsm/src/admin/UserEditor.tsx`,
  `gdfkube-itsm/src/admin/GroupEditor.tsx`,
  `gdfkube-itsm/src/admin/NewUserPage.tsx`,
  `gdfkube-itsm/src/admin/NewFormPage.tsx`,
  `gdfkube-itsm/src/admin/NewGroupPage.tsx`,
  `gdfkube-itsm/src/App.tsx`,
  `gdfkube-itsm/src/api/itsmApi.ts`.
- Server: `gdfkube-itsm/server/src/services/groupAdminService.ts`.
- Tests: `UserEditor.test.tsx`, `GroupEditor.test.tsx`,
  `NewUserPage.test.tsx`, `NewFormPage.test.tsx`,
  `server/__tests__/users.test.ts`, `server/__tests__/groups.test.ts`.

**APIs:** `PATCH /api/itsm/groups/:id` — three previously-accepted keys now
return 400. Documented in `docs/api.md` if applicable.

**Kafka topics:** none affected.
**Downstream consumers:** none.
**Dependencies:** no version changes; no new packages.
**DB / Mongoose schema:** unchanged — `Group.users / forms / clusters`
storage remains; only the write path is closed.

**Sequencing:** Blocked by `fix-admin-id-field-mismatch` (touches the same
`NewUserPage` / `NewGroupPage` create bodies). Apply that change first to
avoid a rebase.

**Testing strategy:**
- Unit (Vitest, SPA): editor PATCH-body shape, toast-on-failure paths.
- Integration (Vitest + supertest, server): whitelist 400 cases, positive
  PATCH round-trip.
- Contract: API doc updated to reflect trimmed whitelist.

**Explicitly out of scope:** L-12 / L-13 (App.tsx bootstrap robustness);
M-22 (`env=production` default) and M-23 (`saude` group fallback) — both
open investigations; derived-read endpoint for `users / forms`.
