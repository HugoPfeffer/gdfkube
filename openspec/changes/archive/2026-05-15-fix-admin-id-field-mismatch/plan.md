# fix-admin-id-field-mismatch Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Make `id` the canonical wire key on admin create POSTs for users, groups, and forms — fixing the silent-drop bug where SPA-sent `_id` is ignored and Mongo auto-generates an ObjectId.

**Architecture:** SPA-only change. The Express services already read `body.id` via `UserModel.create({ _id: body.id, ...body })` (and the symmetrical group/form services). The SPA is flipped to match; the server is untouched. Spec amendments A-13 through A-19 realign the OpenSpec scenarios with the canonical contract.

**Tech Stack:** React + TypeScript SPA, Express server, Mongoose, MongoDB. Jest for both server and SPA tests. OpenSpec for spec deltas.

---

## Task 1: Verify the server contract assumption (no edits)

- [ ] **Step 1:** Open `gdfkube-src/gdfkube-itsm/server/src/services/userAdminService.ts` and confirm line ~27 reads `UserModel.create({ _id: body.id, ...body })`. If it reads `body._id`, STOP — the entire approach is invalidated.
- [ ] **Step 2:** Open `gdfkube-src/gdfkube-itsm/server/src/services/groupAdminService.ts` and confirm line ~15 has the same shape with `body.id`.
- [ ] **Step 3:** Find the forms create call: `grep -n 'FormModel.create\|FormDef.create\|forms.create\b' gdfkube-src/gdfkube-itsm/server/src/`. Open the matching file and confirm it reads `body.id`. Record the file:line in tasks.md task 1.3.
- [ ] **Step 4:** No commit — verification only.

## Task 2: Write the failing server regression tests first (TDD red)

- [ ] **Step 1:** Open `gdfkube-src/gdfkube-itsm/server/__tests__/users.test.ts`. Add a test inside the existing POST `/api/itsm/users` describe block:
      ```ts
      it('does NOT alias body._id when id is absent', async () => {
        const res = await request(app)
          .post('/api/itsm/users')
          .set('X-Demo-User', 'maria.costa')
          .send({ _id: 'should.not.persist', name: 'X', email: 'x@x.gov', role: 'operator' });
        expect(res.status).toBe(201);
        const doc = await UserModel.findById(res.body._id).lean();
        expect(doc?._id).not.toBe('should.not.persist');
      });
      ```
- [ ] **Step 2:** Add the same shape regression to `gdfkube-src/gdfkube-itsm/server/__tests__/groups.test.ts` (body `{ _id: 'should.not.persist', name: 'X' }`).
- [ ] **Step 3:** Add the same shape regression to `gdfkube-src/gdfkube-itsm/server/__tests__/forms.test.ts` with a complete FormDef body using `_id: 'should.not.persist'` and no `id`.
- [ ] **Step 4:** Run `cd gdfkube-src/gdfkube-itsm/server && npm test`. These tests SHOULD PASS already — proving the server already ignores `_id` on the wire (which is the bug from the SPA side, the contract from the server side). If any of the three FAIL with `doc._id === 'should.not.persist'`, the server is silently aliasing `_id` and the plan's assumption is wrong — STOP.
- [ ] **Step 5:** Commit: `test(itsm-server): add regression — _id on POST body is not aliased to Mongoose _id`.

## Task 3: Write the failing SPA contract tests (TDD red)

- [ ] **Step 1:** Open `gdfkube-src/gdfkube-itsm/src/admin/__tests__/NewGroupPage.test.tsx`. Locate the POST-body assertion and tighten it:
      ```ts
      expect(itsmApi.groups.create).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'my-group', name: 'My Group' })
      );
      const body = (itsmApi.groups.create as jest.Mock).mock.calls[0][0];
      expect(body).not.toHaveProperty('_id');
      ```
- [ ] **Step 2:** Create or extend `gdfkube-src/gdfkube-itsm/src/admin/__tests__/NewUserPage.test.tsx` with the same shape (asserting `itsmApi.users.create` is called with `id: '<username>'` and no `_id`).
- [ ] **Step 3:** Create or extend `gdfkube-src/gdfkube-itsm/src/admin/__tests__/NewFormPage.test.tsx` with the same shape for `itsmApi.forms.create`.
- [ ] **Step 4:** Run `cd gdfkube-src/gdfkube-itsm && npm test`. Expect FAILURE — the SPA is still sending `_id`.
- [ ] **Step 5:** Commit: `test(itsm-spa): assert admin create POSTs use id wire key (failing)`.

## Task 4: Flip the SPA create bodies (TDD green)

- [ ] **Step 1:** Open `gdfkube-src/gdfkube-itsm/src/admin/NewUserPage.tsx`. Around line 50–60, change:
      ```ts
      const body: Record<string, unknown> = {
        _id: username.trim(),
        ...
      };
      ```
      to:
      ```ts
      const body: Record<string, unknown> = {
        id: username.trim(),
        ...
      };
      ```
- [ ] **Step 2:** Open `gdfkube-src/gdfkube-itsm/src/admin/NewGroupPage.tsx`. Around line 45–50, change `_id: id` (or `_id: <slug>`) to `id: <slug>`. If the existing local is named `id` (shadowing the new key), rename it to `groupId` so the body literal reads `{ id: groupId, ... }`.
- [ ] **Step 3:** Open `gdfkube-src/gdfkube-itsm/src/admin/NewFormPage.tsx`. Grep for `_id:` inside the create body block (around the `itsmApi.forms.create` call). Flip to `id:`.
- [ ] **Step 4:** Run `grep -rn '_id:' gdfkube-src/gdfkube-itsm/src/admin`. Expect zero hits in create-body literals. Read-side `_id` access on response objects (e.g., `user._id` when rendering) is acceptable.
- [ ] **Step 5:** Run `cd gdfkube-src/gdfkube-itsm && npm test`. Expect all SPA tests green, including the assertions from Task 3.
- [ ] **Step 6:** Commit: `fix(itsm-spa): send id (not _id) in admin create POSTs for users, groups, forms`.

## Task 5: Land the OpenSpec spec deltas

The delta spec files already live under `openspec/changes/fix-admin-id-field-mismatch/specs/` (created during proposal). They apply on archive — not earlier — so this task verifies they parse and match the existing requirement headers.

- [ ] **Step 1:** Run `openspec validate fix-admin-id-field-mismatch` (or equivalent CLI check). Expect zero errors. If a MODIFIED Requirement header doesn't match the existing spec, the archive will fail — fix the header now.
- [ ] **Step 2:** Inspect `openspec/changes/fix-admin-id-field-mismatch/specs/itsm-groups-collection/spec.md` and confirm the `### Requirement: Groups Admin CRUD` header matches `openspec/specs/itsm-groups-collection/spec.md` exactly.
- [ ] **Step 3:** Repeat the header match for `itsm-users-collection`, `itsm-express-api`, and `itsm-forms-collection`.
- [ ] **Step 4:** No commit yet — these were committed when the proposal artifacts were written.

## Task 6: Full local verification

- [ ] **Step 1:** `cd gdfkube-src/gdfkube-itsm/server && npm test` — all green.
- [ ] **Step 2:** `cd gdfkube-src/gdfkube-itsm && npm test` — all green.
- [ ] **Step 3:** Start the demo (per devcontainer setup), log in as `maria.costa` (admin), navigate Admin → New User, create `ana.souza`. Return to Users list and re-bootstrap (refresh).
- [ ] **Step 4:** Confirm `ana.souza` appears with id `ana.souza` (a slug, not an ObjectId hex like `65...`).
- [ ] **Step 5:** Run `mongosh gdfkube --eval 'db.users.find({_id:"ana.souza"})'` — expect one document returned.
- [ ] **Step 6:** Run `pre-commit run --all-files` — clean (trufflehog passes).
- [ ] **Step 7:** Commit: `chore(verify): manual SPA verification of admin create wire-key fix` (only if any test fixtures or seed data changed in passing).

## Task 7: Hand off to verify + retrospective

- [ ] **Step 1:** Re-run `openspec status --change "fix-admin-id-field-mismatch" --json`. Confirm `applyRequires` is satisfied.
- [ ] **Step 2:** Run `/opsx:apply` (or invoke the apply skill) to mark the change as implemented.
- [ ] **Step 3:** Generate `verify.md` and `retrospective.md` artifacts. Verify covers: regression test results, manual SPA flow, mongosh query, grep audit. Retrospective covers: what surprised us (the masked contract test in groups.test.ts), what to do next time (assert wire keys explicitly in contract tests by default).
