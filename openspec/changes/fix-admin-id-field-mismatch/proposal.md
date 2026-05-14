## Why

The SPA admin create pages POST `{ _id: <slug>, ... }`, but the Express services read `body.id` — so the slug is silently dropped and Mongoose auto-generates an `ObjectId`. The user/group/form lands in the UI under an unreadable id after the next bootstrap refetch, breaking the demo identity contract that `DEMO_USERS` and the spec scenarios assume. Fix it now: the unified audit flagged it Critical (C-3 + D-15), it currently masks a contract test (the test happens to POST `id`, not `_id`), and the same bug exists symmetrically in forms (A-17/A-19).

## What Changes

**SPA create body wire key**
- From: `POST /api/itsm/{users,groups,forms}` with body `{ _id: <slug>, ...rest }` (`NewUserPage.tsx`, `NewGroupPage.tsx`, `NewFormPage.tsx`)
- To: `POST /api/itsm/{users,groups,forms}` with body `{ id: <slug>, ...rest }`
- Reason: server services already read `body.id`; the SPA is the only dissenter.
- Impact: non-breaking on the server (services unchanged); SPA tests must assert the new key explicitly.

**SPA contract tests**
- From: `expect.objectContaining({ name: ... })` on the POST body (key-agnostic)
- To: `expect.objectContaining({ id: '<slug>', ... })` AND a negative assertion that the body does not contain `_id`
- Reason: the existing assertions masked the bug; tighten so a regression fails loudly.

**Server contract tests**
- Add a regression in `server/__tests__/{users,groups,forms}.test.ts` that POSTing `{ _id: 'foo' }` (no `id`) does NOT round-trip with `_id === 'foo'`. Proves the field is no longer silently aliased on the wire.

**OpenSpec scenario amendments (A-13 through A-19)**
- `itsm-groups-collection/spec.md` — replace `_id` with `id` in POST scenario body and scenario title (A-13, A-14).
- `itsm-users-collection/spec.md` — replace `_id` with `id` in POST scenario body and duplicate scenario (A-15, A-16).
- `itsm-express-api/spec.md` — replace `_id` with `id` in forms POST scenario body and duplicate (A-17, A-18).
- `itsm-forms-collection/spec.md` — replace `_id` with `id` in forms POST scenario body (A-19).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `itsm-groups-collection`: POST scenario body wire key changes from `_id` to `id` (A-13, A-14).
- `itsm-users-collection`: POST scenario body wire key changes from `_id` to `id` (A-15, A-16).
- `itsm-express-api`: forms POST scenario body wire key changes from `_id` to `id` (A-17, A-18).
- `itsm-forms-collection`: forms POST scenario body wire key changes from `_id` to `id` (A-19).

## Impact

**Code**
- 3 SPA files (1 line each): `gdfkube-itsm/src/admin/NewUserPage.tsx`, `NewGroupPage.tsx`, `NewFormPage.tsx`.
- 0 server service files: `userAdminService.ts`, `groupAdminService.ts`, and the forms service entry point already read `body.id` and stay as-is.

**APIs**
- `POST /api/itsm/users`, `POST /api/itsm/groups`, `POST /api/itsm/forms` — wire body key changes from `_id` to `id`. The server already accepts `id`; this aligns the SPA.
- PATCH routes unaffected (URL path param keyed).

**Dependencies / Systems**
- No dependency version changes.
- No Mongoose schema change — `_id: String` stays correct for User, Group, Form.
- No Kafka topic, no Debezium connector, no Helm chart impact.
- No DB migration. Existing demo docs (`joao.silva`, etc.) already store the slug at `_id` and continue to round-trip.

**Tests**
- SPA tests: tighten assertions in `NewGroupPage.test.tsx`; extend `NewUserPage.test.tsx`, `NewFormPage.test.tsx` to assert the wire key.
- Server tests: regression in `users.test.ts`, `groups.test.ts`, `forms.test.ts` proving `_id` on the body is no longer aliased.

**Specs**
- 4 capabilities amended (`itsm-groups-collection`, `itsm-users-collection`, `itsm-express-api`, `itsm-forms-collection`); 7 scenario edits total per amendments A-13 through A-19.

**Blast radius**: small. 3 SPA lines, ~30 lines of test additions, 7 spec scenario edits. No production DB or runtime impact.
