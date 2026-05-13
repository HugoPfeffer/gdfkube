## Context

The `add-gitea-settings` change introduced a Gitea settings page (admin-only) with a Mongoose `GiteaSettings` singleton model, `GET`/`PATCH /api/itsm/settings` routes, an exported seed JSON, a SPA route, and a Topbar dropdown item. It was claimed complete (all `tasks.md` checkboxes ticked) but the multi-agent `/review-team` audit surfaced four blocking defects, three smaller defects, and one spec inaccuracy. The defects are causally chained:

1. **Seed export corruption** silently drops `users.username` and coerces `groups.{users,forms,clusters}` to `[]`. Verification step 7.2 ("Verify seed export generates `settings.json`") didn't notice because it only inspected `settings.json`, not `users.json` / `groups.json`.
2. **Auth bypass in Settings.tsx** hard-codes `X-Demo-User: maria.costa` against the API, so the `updatedBy` audit field is always Maria no matter who saved. The bug would have been caught by item 3 if it existed.
3. **Missing backend tests** for `GET`/`PATCH /api/itsm/settings`, admin-gating, and validation matrix.
4. **Missing Topbar test** for the new Settings menu item.

The smaller defects (PATCH crashing on `null` body, plaintext-PAT response cacheable upstream, undocumented endpoints in `openapi.yaml`) are independent of the chain but reside on the same surface.

The spec inaccuracy — "Field validation MUST reuse `src/forms/validate.ts`" — is technically infeasible: that helper expects a dynamic `Field` object built by the form-builder, not three static inputs. The agent that ticked task 6.2 worked around it with inline regexes, which is the right call; the spec is what's wrong.

`add-gitea-settings` has not been archived. The fix lands first; archive happens after.

## Goals / Non-Goals

**Goals:**

- Restore seed-export so `mongo-seed` produces a working demo DB.
- Make Settings.tsx route through the canonical `itsmApi` so the `updatedBy` audit field reflects the acting admin.
- Establish backend + Topbar test coverage for the new surface.
- Tighten the PATCH route against malformed bodies and prevent cache poisoning on `?reveal=1`.
- Document the new routes in `openapi.yaml`.
- Correct the spec to match the implementable reality (regex constants, not `validate.ts` reuse).

**Non-Goals:**

- Replacing `X-Demo-User` with real auth. The demo pattern is repo-wide; the compliance reviewer flagged this as pre-existing, not a regression introduced by this change.
- Encryption-at-rest for the PAT. Accepted risk in the original `design.md`.
- Optimistic-concurrency `If-Match` on PATCH. Low-priority demo-grade gap.
- Vault / K8s Secret integration for token storage. Explicit non-goal in original `design.md`.
- Refactoring `validate.ts` to accept static inputs. Out of scope; the spec correction routes around it.

## Decisions

### D1. One bundled fix change instead of four sequenced PRs

The four blockers form a chain: seed-fix is what makes auth-fix testable; new tests are what prevent regressing the seed-fix; spec-fix is what makes the auth-fix implementable cleanly. Splitting would leave `main` in working-but-wrong states between PRs (e.g., correct seed + still hard-coded `maria.costa`). Reviewers see the full corrective scope in one diff; verification (`docker compose up` smoke) runs once.

**Alternatives considered:**

- *Amend `add-gitea-settings` directly* — Loses the audit trail of "the feature was claimed done; here is what turned out to be wrong." Flipping completed task checkboxes back to unchecked masks the premature-completion signal that itself has signal.
- *Per-blocker PRs* — Six review cycles for four interlocked fixes; intermediate `main` states all partially broken. No reviewability gain.

### D2. Settings page wires through the existing `itsmApi.settings` namespace

Add a `settings` namespace to `src/api/itsmApi.ts` that mirrors the existing `groups` block: a `get(reveal?, signal?)` and an `update(body, signal?)` method. Replace the two raw `fetch` calls in `Settings.tsx` with these. The shared `api` helper already injects `X-Demo-User` from `demoUserResolver()` (wired in `App.tsx:83–85` to the active user) and throws typed `ApiError` instances — Settings.tsx catches `ApiError`, treats `status === 404` on load as the empty-form path, and surfaces `err.details?.fields` in the error toast on PATCH failure.

**Alternatives considered:**

- *Add a one-off helper in Settings.tsx that injects the header from the resolver* — Duplicates `itsmApi` for one page; future routes would repeat the pattern. Reject.
- *Pass the active user as a prop and use it in the fetch* — Mixes auth concerns into a leaf page; `itsmApi` exists precisely to centralize this. Reject.

### D3. Seed-export script becomes a pure projection (no transformation)

Restoring `username` on users, returning `groups.users/forms/clusters` as the source numeric values, and appending `\n` to every emitted JSON file. The script's prior shape was load-bearing for downstream consumers — `App.tsx::pickUser` does `users.find(u => u.username === ...)`, `Users.tsx` renders `{g.clusters ?? '—'}` as a scalar — and the projection logic that was added in `add-gitea-settings` silently broke both.

**Alternatives considered:**

- *Coerce in `seed-collections.js` instead* — Then the JSON-on-disk diverges from what mongo holds, which is the exact drift the project rule "eliminate drift: generated manifests must match their source of truth" forbids. Reject.
- *Make `App.tsx::pickUser` fall back to `name` field-by-field* — Was the silent fallback today; produces "Maria Costa" which is not a key in `DEMO_USERS` and returns 401. The fix is the data, not the lookup. Reject.

### D4. Backend tests mirror `groups.test.ts` layout exactly

New `server/__tests__/settings.test.ts` uses `supertest` + `buildApp()` + the existing global `vitest.setup.ts` for DB cleanup. Ten scenarios: admin GET (redacted + reveal), non-admin GET 403, missing-doc 404, PATCH valid → 200 + DB write + `updatedBy === 'maria.costa'`, PATCH invalid endpoint → 400, PATCH invalid owner → 400, PATCH empty token → 400, PATCH null body → 400, PATCH non-admin → 403. Identical seeding/teardown patterns to `groups.test.ts` keep the suite cognitively cheap to maintain.

**Alternatives considered:**

- *Vitest unit tests against route handlers directly (no supertest)* — Would skip the middleware stack (`demoUser`, `requireAdmin`), missing the 403 path. The audit specifically called out admin-gating regression coverage. Reject.
- *Playwright e2e covering the SPA Settings page* — Different blast radius; useful but doesn't replace API-level tests, and the audit's "missing tests" finding was specifically backend. Defer.

### D5. PATCH null-body guard before destructure

Before the `const { endpoint, owner, token } = req.body` destructure, return 400 if `req.body` is `null`/non-object/array. Today the destructure crashes Express, which the audit's stress test surfaced. The guard returns the same `{ error: 'invalid body' }` shape as the existing validation failure path so the SPA error-toast logic doesn't need a special case.

### D6. `Cache-Control: no-store` on `?reveal=1`

When the GET handler sees `reveal === true`, set `Cache-Control: no-store` before sending the JSON. Defense-in-depth against upstream caches (browser, CDN, reverse proxy) holding plaintext PAT responses. Not strictly required by any spec but free and on-topic for a route that returns secret material.

### D7. Spec amendment edits the in-flight `add-gitea-settings` source, not a delta here

The `validate.ts` reuse requirement lives in `openspec/changes/add-gitea-settings/specs/itsm-admin-settings/spec.md` — the parent change has not archived, so the canonical specs tree (`openspec/specs/`) does not have an `itsm-admin-settings` capability yet. Editing the in-flight change's source is the OpenSpec-correct move when correcting an unarchived change. Task 7 in this change's `tasks.md` performs that edit. No delta in `fix-gitea-settings-review/specs/itsm-admin-settings/` because there is no upstream requirement to override yet.

**Alternatives considered:**

- *Add a Modified Capability delta here for `itsm-admin-settings`* — Would require the OpenSpec engine to merge in a specific order (parent → child) on archive; the simpler path is to fix the parent in place since it hasn't archived.

## Risks / Trade-offs

- **Risk:** Regenerating seed JSON produces a diff against the values committed by `add-gitea-settings`. → **Mitigation:** Verification step 4 explicitly diffs the regenerated files; reviewer should see only restored `username` fields and numeric group counts, no other shape mutation.
- **Risk:** Routing Settings through `itsmApi` changes the toast message for 404 (was silent network error, now an `ApiError`). → **Mitigation:** Settings.tsx treats `err.status === 404` on the GET path as the empty-form / first-save path — UX equivalent to today's "no data" experience.
- **Risk:** Backend tests rely on `mongodb-memory-server` startup, which can be slow on cold CI. → **Mitigation:** The existing `groups.test.ts` already pays this cost; sharing the harness via the global setup means zero additional startup overhead.
- **Risk:** Spec amendment in the in-flight change desyncs anyone reading `add-gitea-settings` after this PR. → **Mitigation:** The amendment edits both `tasks.md` task 6.2 and the spec file; the diff is small and lands before archive, so the archived version is self-consistent.
- **Trade-off:** Larger single PR vs four small ones. Accepted (see D1).
- **Trade-off:** Inline regex constants vs reusing a shared helper. Accepted — the shared helper is the wrong abstraction for static inputs; two `const` regexes that match the server-side `match` validators are clearer.

## Migration Plan

No DB migration. The `gitea_settings` collection's documents are unchanged; only the SPA call site and the seed-export projection change.

**Rollout:**

1. Land this PR.
2. Run `npm run seed:export` to regenerate `users.json` / `groups.json` / `settings.json`. (Step 4 of Verification.)
3. CI runs `pre-commit run --all-files`, `npm test` (backend + SPA), `npm run typecheck`, `npm run build`.
4. Reviewer runs the docker-compose smoke walkthrough (login as Maria → Settings → save → confirm `updatedBy` reflects active user).
5. Archive `add-gitea-settings`.

**Rollback:**

Single-PR revert. The fix is purely corrective; reverting puts `main` back to the broken-but-claimed-done state and re-opens the original findings. No data migration to undo.
