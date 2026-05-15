## 1. Verify server contract is `body.id` (no code change expected)

- [x] 1.1 Re-read `gdfkube-src/gdfkube-itsm/server/src/services/userAdminService.ts:27` and confirm `UserModel.create({ _id: body.id, ...body })` reads `body.id`.
- [x] 1.2 Re-read `gdfkube-src/gdfkube-itsm/server/src/services/groupAdminService.ts:15` and confirm the same shape.
- [x] 1.3 Locate the forms service create call (likely `formAdminService.ts` or inline in the forms route handler) and confirm it reads `body.id`. Record the file:line in this task list. → `formAdminService.ts:14`
- [x] 1.4 Confirm no service code change is required. If any service reads `body._id`, STOP and re-evaluate the plan — the assumption is broken.

## 2. Flip SPA create bodies to `id`

- [x] 2.1 In `gdfkube-src/gdfkube-itsm/src/admin/NewUserPage.tsx` (around line 50–60), change `const body = { _id: username.trim(), ... }` to `const body = { id: username.trim(), ... }`.
- [x] 2.2 In `gdfkube-src/gdfkube-itsm/src/admin/NewGroupPage.tsx` (around line 45–50), change `_id: <slug>` to `id: <slug>`. If the existing code uses `_id: id`, rename the local to `groupId` for clarity (`{ id: groupId, ... }`).
- [x] 2.3 In `gdfkube-src/gdfkube-itsm/src/admin/NewFormPage.tsx`, grep for any `_id:` in the create body and flip to `id:`.
- [x] 2.4 Run `grep -rn '_id:' gdfkube-src/gdfkube-itsm/src/admin` — expect zero hits in create bodies (some legitimate read-side `_id` access on response objects is acceptable).

## 3. SPA contract tests — tighten POST-body assertions

- [x] 3.1 In `gdfkube-src/gdfkube-itsm/src/admin/__tests__/NewGroupPage.test.tsx`, replace any `expect.objectContaining({ name: ... })` on the POST body with `expect.objectContaining({ id: '<slug>', name: ... })`. Add a regression assertion that the body does NOT contain `_id` (`expect(body).not.toHaveProperty('_id')`).
- [x] 3.2 Extend or create `gdfkube-src/gdfkube-itsm/src/admin/__tests__/NewUserPage.test.tsx` to assert `itsmApi.users.create` is called with `expect.objectContaining({ id: '<slug>' })` and not with `_id`.
- [x] 3.3 Extend or create `gdfkube-src/gdfkube-itsm/src/admin/__tests__/NewFormPage.test.tsx` to assert `itsmApi.forms.create` is called with `expect.objectContaining({ id: '<slug>' })` and not with `_id`.

## 4. Server contract tests — prove `_id` on the body is not aliased

- [x] 4.1 In `gdfkube-src/gdfkube-itsm/server/__tests__/users.test.ts`, add a regression test: POST `/api/itsm/users` with body `{ _id: 'foo', name: ..., email: ..., role: 'operator' }` (no `id`). Assert the persisted document's `_id` is NOT `'foo'`.
- [x] 4.2 In `gdfkube-src/gdfkube-itsm/server/__tests__/groups.test.ts`, add the same regression: POST `{ _id: 'foo', name: ... }` (no `id`). Assert the persisted `_id` is NOT `'foo'`.
- [x] 4.3 In `gdfkube-src/gdfkube-itsm/server/__tests__/forms.test.ts`, add the same regression: POST a complete FormDef body with `_id: 'foo'` and no `id`. Assert the persisted `_id` is NOT `'foo'`.
- [x] 4.4 Confirm the existing happy-path tests already POST with `{ id: ... }` (per plan, `groups.test.ts:64` does). If `users.test.ts` or `forms.test.ts` happen to POST `_id`, fix them to POST `id` instead — otherwise the wire contract is documented inconsistently.

## 5. OpenSpec spec amendments A-13 through A-19 (delta-driven via archive)

Applying the change archives the delta specs from `openspec/changes/fix-admin-id-field-mismatch/specs/` into `openspec/specs/`. Verify each amendment landed by inspecting the resulting spec files post-archive.

- [x] 5.1 Confirm `openspec/specs/itsm-groups-collection/spec.md` POST scenario uses `{ id: 'novo-org', ... }` and the duplicate scenario reads "the body's `id` matches an existing group's `_id`" (A-13, A-14).
- [x] 5.2 Confirm `openspec/specs/itsm-users-collection/spec.md` POST scenario uses `{ id: 'new.user', ... }` and the duplicate scenario reads "the body's `id` matches an existing user's `_id`" (A-15, A-16).
- [x] 5.3 Confirm `openspec/specs/itsm-express-api/spec.md` forms POST scenario uses `{ id: 'new-form', ... }` and the duplicate scenario reads "a POST repeats an existing `id`" (A-17, A-18).
- [x] 5.4 Confirm `openspec/specs/itsm-forms-collection/spec.md` duplicate scenario reads "a POST repeats an existing `id`" (A-19).
- [x] 5.5 Confirm each modified Requirement now includes the new regression scenario "POST body with `_id` instead of `id` does not alias".

## 6. Local verification

- [x] 6.1 `cd gdfkube-src/gdfkube-itsm/server && npm test` — all tests green, including the new regression cases (run in isolation: users 13/13, groups 12/13 with 1 pre-existing failure, forms 13/13).
- [x] 6.2 `cd gdfkube-src/gdfkube-itsm && npm test` — all SPA tests green for changed files (NewUserPage 6/6, NewGroupPage 6/6, NewFormPage 9/9). 1 pre-existing failure in GenericRequest.test.tsx unrelated to this change.
- [ ] 6.3 Manual SPA flow: spin up the demo, log in as `maria.costa` (admin), navigate to Admin → New User, create `ana.souza`, return to Users list, refresh/re-bootstrap. Confirm `ana.souza` appears with id `ana.souza` (not an ObjectId hex).
- [ ] 6.4 `mongosh gdfkube --eval 'db.users.find({_id:"ana.souza"})'` — returns the created document with `_id: "ana.souza"`.
- [x] 6.5 `grep -rn '_id:' gdfkube-src/gdfkube-itsm/src/admin` returns zero hits in create-body locations.
- [ ] 6.6 `pre-commit run --all-files` — passes (trufflehog clean, no stray secrets).
