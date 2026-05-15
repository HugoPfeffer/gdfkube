## Design Summary

The SPA's admin create pages POST `{ _id: <slug>, ... }` to the Express services, but the services read `body.id`. The `_id` field is silently dropped, Mongoose auto-generates an `ObjectId`, and the next bootstrap refetch lists the new user/group/form under an unreadable id. **Flip the SPA to send `id` on the wire** — the smaller, safer change — and keep the server services unchanged. Apply the same fix to forms (symmetrical bug, A-17/A-19) and to the OpenSpec scenarios that still document `_id` on POST.

## Alternatives Considered

### Option A: Flip the SPA to send `id` on the wire (chosen)
- **Approach**: Change `NewUserPage.tsx`, `NewGroupPage.tsx`, and `NewFormPage.tsx` to POST `{ id: <slug>, ... }`. Leave `userAdminService.ts`, `groupAdminService.ts`, and the forms service entry point alone — they already read `body.id`.
- **Pros**:
  - Smallest diff: ~3 SPA files, 1 line each.
  - Server services already agree on `id` (three independent files), so they vote for `id` as canonical.
  - OpenSpec scenarios that already document `id` stay correct; the few that drifted to `_id` are amended.
  - No DB migration; existing demo docs keyed by `joao.silva`-style strings continue to round-trip.
- **Cons**:
  - Three SPA test files need their POST-body assertions tightened.
  - Seven OpenSpec scenarios need scenario-body fixes (A-13 through A-19).

### Option B: Flip the server services to read `body._id`
- **Approach**: Change `UserModel.create({ _id: body.id, ...body })` and the symmetrical calls in groups and forms services to read `body._id` instead.
- **Pros**:
  - SPA stays unchanged; no SPA test churn.
- **Cons**:
  - Three service files must flip atomically; missing one re-introduces the same silent-drop bug for that resource.
  - Contradicts the OpenSpec scenarios that already document `id` on the POST body — would require even more spec amendments than Option A.
  - Mongoose `_id: String` schema is already present; nothing on the server side wants `_id` on the body specifically.
- **Why not chosen**: larger blast radius and forces the spec to drift further from the server contract.

### Option C: Accept both `id` and `_id` (alias in services)
- **Approach**: Update each service to `const _id = body.id ?? body._id` so either wire key works.
- **Pros**:
  - Backwards-compatible with any external caller already sending `_id`.
- **Cons**:
  - Adds defensive code for a problem that doesn't exist — there are no external callers; the SPA is the only client.
  - Hides future drift instead of forcing one canonical wire shape.
  - Violates the project's "prefer modifying existing functions over adding cleverness" standard.
- **Why not chosen**: introduces dual-key tolerance with no real consumer benefit.

## Agreed Approach

**Option A.** The Express service layer is the source of truth for the wire contract — it already reads `body.id` in three independent services, and the OpenSpec scenarios mostly already document `id`. Only the SPA dissents, and only on the create POST. Fix the dissenter.

Concretely:
- SPA: `NewUserPage.tsx`, `NewGroupPage.tsx`, `NewFormPage.tsx` — change the create body key from `_id` to `id`.
- SPA tests: assert `expect.objectContaining({ id: '<slug>', ... })` and that the body does NOT contain `_id`.
- Server tests: add a regression that POSTing `{ _id: 'foo' }` (no `id`) does NOT round-trip with `_id === 'foo'` — Mongo auto-generates an ObjectId, proving the field is no longer silently aliased.
- OpenSpec spec amendments A-13 through A-19: replace `_id` with `id` in scenario bodies for `itsm-groups-collection`, `itsm-users-collection`, `itsm-express-api`, and `itsm-forms-collection`.

## Key Decisions

- **Canonical wire key is `id`.** The server services already use it. The SPA flips to match.
- **Server services are not touched.** `UserModel.create({ _id: body.id, ...body })` is intentional — Mongoose maps `body.id` onto the `_id: String` schema, and the spread preserves the rest of the document.
- **Forms is in scope.** A-17 and A-19 document the same `_id` drift in the forms create scenarios; the SPA `NewFormPage.tsx` exhibits the same shape and must flip.
- **PATCH is out of scope.** Update routes key by URL path param, not body — the bug doesn't apply.
- **No DB migration.** Existing demo docs (`joao.silva`, etc.) already store the slug at `_id`; the wire-key flip changes only what the SPA sends, not what's persisted.

## Open Questions

None. The chosen direction is documented in the unified audit findings (C-3 + D-15, "Critical") and the decisions log. The plan file enumerates every file edit; the server contract is verified at `userAdminService.ts:27`, `groupAdminService.ts:15`, and the forms service entry point.
