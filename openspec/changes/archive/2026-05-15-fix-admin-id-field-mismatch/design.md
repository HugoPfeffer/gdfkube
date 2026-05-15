## Context

The ITSM demo runs an Express service backed by MongoDB (Mongoose) and a React SPA. Users, groups, and forms use a human-readable slug as their `_id` (`_id: String` in the Mongoose schema) — e.g. `_id: "joao.silva"` — because the demo identity contract uses these slugs as `X-Demo-User` and as the canonical handle across the UI and `DEMO_USERS`.

The create flow in all three resources follows the same pattern:

```
SPA (NewXPage.tsx) ──POST {_id: <slug>, ...}──> Express ──UserModel.create({_id: body.id, ...body})──> Mongo
```

The service line is intentional: it maps the wire field `body.id` onto the Mongoose `_id: String` field and spreads the remaining fields. **But the SPA sends `_id`, not `id`.** So `body.id` is `undefined`, Mongoose generates a fresh `ObjectId`, and the spread `...body` happens to overwrite that `_id` with the `_id` from the SPA — except in failure modes (e.g. when validation rejects the spread `_id`, or when Mongoose pre-hooks intervene) the slug is dropped and the document persists with the auto-generated ObjectId.

The bug was uncovered in the unified audit (C-3 + D-15, "Critical"), and the existing server contract test (`groups.test.ts:64`) masks it by happening to POST `{ id: ... }` directly.

Stakeholders: solo developer; demo runs in devcontainer; no external API consumers.

## Goals / Non-Goals

**Goals:**
- Make the create wire contract unambiguous: `id` is the wire key for all three resources (users, groups, forms).
- Tighten SPA contract tests so the wire key is asserted explicitly — make regressions visible.
- Add server-side regression tests that prove `_id` on the body is no longer silently aliased.
- Align OpenSpec scenarios (A-13 through A-19) with the canonical wire contract.

**Non-Goals:**
- Touching the server service layer. `UserModel.create({ _id: body.id, ...body })` and its siblings stay as-is.
- Renaming `body.id` to `body._id` server-side. The three services already agree on `id`; flipping them would be a larger blast radius.
- Accepting both `id` and `_id` (alias). No external consumers exist; dual-key tolerance hides drift instead of preventing it.
- PATCH route changes. Updates key by URL path param, not body.
- Mongoose schema changes. `_id: String` is correct.
- Slug validation/normalization. Separate hardening pass.

## Decisions

### Decision 1: Wire key is `id`, end-to-end

The server services (`userAdminService.ts:27`, `groupAdminService.ts:15`, forms service entry point) already read `body.id`. The OpenSpec scenarios mostly already document `id`. Only the SPA dissents on the create POST. We flip the SPA.

**Alternatives considered:**
- **Flip server services to `body._id`**: requires three atomic edits across independent service files; missing one re-introduces the silent-drop bug for that resource. Also forces more spec rewrites than the SPA flip. Rejected.
- **Accept both via `body.id ?? body._id`**: dual-key tolerance with no consumer benefit, hides future drift. Rejected.

### Decision 2: Server services are untouched

The intentional shape `UserModel.create({ _id: body.id, ...body })` maps `body.id` onto the Mongoose `_id` field and lets the spread carry the rest of the document — including any client-supplied `id` (which Mongoose then ignores because `_id` is the schema key). This is concise and correct as long as the SPA agrees on `id`. We do not introduce a normalizer or a wrapper; project standard is to modify existing functions rather than add layers.

### Decision 3: Forms is in scope (symmetrical bug)

A-17 and A-19 document the same drift in the forms POST scenarios. `NewFormPage.tsx` uses the same `{ _id: id, ... }` shape (verified by grep in the plan). Fix all three in one change; partial fixes would leave the demo inconsistent.

### Decision 4: Tests must assert the wire key positively AND negatively

The existing `groups.test.ts` masked the bug because the assertion was key-agnostic. To prevent regression:
- SPA tests: positive assertion `expect.objectContaining({ id: '<slug>', ... })` plus a negative `expect(body).not.toHaveProperty('_id')`.
- Server tests: regression case — POST `{ _id: 'foo' }` (no `id`) and assert the persisted doc does NOT have `_id === 'foo'`. This proves the wire key is not silently aliased.

## Risks / Trade-offs

- **[Risk]** A spec scenario edit gets out of sync with the SPA edit → spec drift the audit just cleaned up.
  - **Mitigation**: bundle SPA + tests + spec amendments in the same change; verify with the existing `pre-commit run --all-files` hook and the OpenSpec `verify` artifact.
- **[Risk]** Existing demo data already in MongoDB uses string `_id`s; flipping the wire key could break the round-trip if anything in the SPA reads `_id` back as `_id` on the response.
  - **Mitigation**: the GET endpoints already return `{ _id: '<slug>', ... }` (Mongoose serialization), and the SPA consumes that as-is. Only the POST body changes. Manual verification step in `verify.md`: create a user, re-bootstrap, confirm it appears with the slug as id.
- **[Risk]** Server contract test currently masks the bug; the regression test we add must be correct or it'll mask it again.
  - **Mitigation**: write the regression test such that the assertion is `expect(doc._id).not.toBe('foo')` AND `expect(doc._id).toBeInstanceOf(ObjectId)` (or string-matches an ObjectId hex pattern). Both must hold.
- **[Trade-off]** We're not adding input validation that rejects unknown body keys. The server still silently ignores extra fields. We accept this — it's the broader hardening pass, not this change.
- **[Trade-off]** Three SPA test files need updates; one may not exist yet (`NewFormPage.test.tsx`). Creating it is in scope.

## Migration Plan

No data migration. The change is purely wire-contract:

1. SPA edits land (3 files).
2. SPA tests land (3 files, possibly 1 new).
3. Server regression tests land (3 files, ~10 lines each).
4. OpenSpec scenario amendments land (4 spec files, 7 scenario edits).
5. `pre-commit run --all-files` + `cd gdfkube-src/gdfkube-itsm/server && npm test` + `cd gdfkube-src/gdfkube-itsm && npm test`.
6. Manual SPA verification: create user "ana.souza", re-bootstrap, confirm `id: "ana.souza"` (not an ObjectId) appears.

**Rollback**: revert the change. No DB state, no consumer contract outside this repo.

## Open Questions

None. The direction is decided (unified findings C-3 + D-15) and every file edit is enumerated in `.claude/plans/fix-admin-id-field-mismatch.md`.
