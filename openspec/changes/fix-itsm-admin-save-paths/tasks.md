## 1. Server: trim Group PATCH whitelist (M-6, Option A)

- [x] 1.1 Edit `gdfkube-src/gdfkube-itsm/server/src/services/groupAdminService.ts` — drop `users`, `forms`, `clusters` from `PATCH_WHITELIST`. Final set: `{ name, fullName, repo }`.
- [x] 1.2 Run `cd gdfkube-src/gdfkube-itsm/server && npm test` and triage any existing failures from PATCHes that touched the dropped keys.

## 2. Server: tests for Groups whitelist trim

- [x] 2.1 Add `gdfkube-src/gdfkube-itsm/server/__tests__/groups.test.ts` cases:
  - Positive: `PATCH /api/itsm/groups/saude` with `{ name, fullName, repo }` → 200; document reflects values.
  - Negative: `PATCH { users: [] }` → 400; `PATCH { forms: [] }` → 400; `PATCH { clusters: [] }` → 400.
  - Negative: any other unknown key → 400.
- [x] 2.2 Remove or update any existing test case that PATCHes `users`/`forms`/`clusters` and expects success.

## 3. Server: tests for Users whitelist completeness (M-21)

- [x] 3.1 Extend `gdfkube-src/gdfkube-itsm/server/__tests__/users.test.ts:119-126`:
  - Positive: `PATCH /api/itsm/users/<id>` with `{ username: 'new.name' }` → 200; document's `username` updated.
  - Positive: `PATCH { active: false }` → 200; document's `active` is `false`.
  - Negative: PATCH with any unknown key → 400.

## 4. SPA: UserEditor sends fullName and active (M-5)

- [x] 4.1 In `gdfkube-src/gdfkube-itsm/src/admin/UserEditor.tsx`, update `handleSave` to add `fullName: user.fullName ?? user.name` and `active: (user.status ?? 'active') === 'active'` to the `changes` object.
- [x] 4.2 Update the `isDirty` predicate (around lines 83-90) to track changes to `fullName`.

## 5. SPA: editors capture server response (M-8)

- [x] 5.1 In `UserEditor.tsx:107-108`, change `await itsmApi.users.update(user.id, changes); setSaved({ ...user });` to:
  ```ts
  const updated = await itsmApi.users.update(user.id, changes);
  dispatch({ type: 'UPDATE_USER', id: user.id, patch: updated as Partial<User> });
  setSaved({ ...user, ...updated });
  ```
- [x] 5.2 Apply the same change to `GroupEditor.tsx:43-44`, using `UPDATE_GROUP` and `Partial<Group>`.

## 6. SPA: NewUserPage and NewFormPage surface failures (M-7)

- [x] 6.1 Thread `setToast?: (t: Toast) => void` prop through `NewUserPage.tsx` (signature + caller site in `App.tsx`).
- [x] 6.2 Replace the empty `catch { setIsSaving(false); }` in `NewUserPage.tsx:76-78` with the toast pattern used by `NewGroupPage.tsx:69-77`.
- [x] 6.3 Repeat for `NewFormPage.tsx:86-87` — thread `setToast` from `App.tsx` and emit an error toast on rejection.

## 7. SPA: NewGroupPage uses server response as-is (M-19)

- [x] 7.1 In `NewGroupPage.tsx:51-61`, replace the `created.<field> ?? local.<field>` fallback chain with the server response directly. Dispatch the `ADD_GROUP` action with the response verbatim.

## 8. SPA: itsmApi captures non-JSON 5xx bodies (M-20)

- [x] 8.1 In `gdfkube-src/gdfkube-itsm/src/api/itsmApi.ts:64-77`, wrap the `response.json()` call in try/catch. On parse failure, fall back to `await response.text()`, truncate to ~200 chars, and append it to the thrown error message alongside the HTTP statusText.
- [x] 8.2 Verify no call site needs adjustment (signatures unchanged).

## 9. SPA: tests for editor body shape (M-9)

- [x] 9.1 In `gdfkube-src/gdfkube-itsm/src/admin/__tests__/GroupEditor.test.tsx:100`, replace `objectContaining({ name })` with an exact body assertion: `{ name, fullName, repo }`.
- [x] 9.2 In `UserEditor.test.tsx` (extend or add), assert the PATCH body contains `fullName` and `active` when those fields are dirty. Cover both the "only fullName edited" and "status toggled" cases.

## 10. SPA: tests for create-failure toasts (M-7)

- [x] 10.1 Extend or add `NewUserPage.test.tsx` to mock `itsmApi.users.create` rejection and assert `setToast` is invoked with `variant: 'error'`.
- [x] 10.2 Same for `NewFormPage.test.tsx`.

## 11. Verification

- [x] 11.1 `cd gdfkube-src/gdfkube-itsm && npm test` — green.
- [ ] 11.2 `cd gdfkube-src/gdfkube-itsm/server && npm test` — green; new whitelist tests pass.
- [ ] 11.3 Manual smoke: edit a user's Full name → Save → re-bootstrap → name persists.
- [ ] 11.4 Manual smoke: stop the server → `NewUserPage` create → "Create failed" toast appears.
- [ ] 11.5 Manual smoke: `curl -X PATCH http://localhost:8080/api/itsm/groups/saude -H "X-Demo-User: maria.costa" -d '{"users":5}'` → `400 Bad Request`.
- [ ] 11.6 `pre-commit run --all-files` — green.
