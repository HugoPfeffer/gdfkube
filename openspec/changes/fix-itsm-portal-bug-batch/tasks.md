## 1. Pipeline stage drift (Bug #1)

- [x] 1.1 In `gdfkube-camel/src/main/java/gov/gdf/camel/routes/RequestRouterRoute.java`, call `updateStageInMongo(requestId, 4)` immediately after the route receives the Kafka message (before any business work).
- [x] 1.2 In `gdfkube-camel/src/main/java/gov/gdf/camel/routes/RepoBootstrapRoute.java`, call `updateStageInMongo(requestId, 5)` after the Gitea repo is successfully created/pushed.
- [x] 1.3 In `gdfkube-camel/src/main/java/gov/gdf/camel/routes/StatusEmitterRoute.java`, change the Mongo update from `$set: { stage }` to `$max: { stage }` so out-of-order events cannot decrement stage.
- [x] 1.4 Confirm `updateStageInMongo` itself uses `$max` (not `$set`) on the stage field; update the helper if needed.
- [x] 1.5 Add a Camel route test (Testcontainers Mongo) asserting that two events arriving for stages 4 then 3 leave the document at stage 4.

## 2. Radio dot rendering (Bug #2)

- [x] 2.1 In `gdfkube-src/gdfkube-itsm/src/forms/RadioCards.tsx`, replace the `<span className="dot" …>` with the inline-style approach: `display: inline-block`, `width: 8`, `height: 8`, `borderRadius: '50%'`, `background: opt.dotColor`.
- [x] 2.2 Run `npm run dev` and visually confirm dots render on the OpenShift Cluster Request → Environment radio cards.
- [x] 2.3 Add a unit test (Vitest + RTL) asserting the rendered span has computed `width: 8px` and `border-radius: 50%`.

## 3. Request number format (Bug #3)

- [ ] 3.1 In `gdfkube-src/gdfkube-itsm/server/src/services/requestService.ts`, add a `FORM_TYPE_CODE: Record<string, 'C'|'N'|'S'>` map keyed by `formId` and a `nextRequestNumber(formId)` helper that queries the highest existing `REQ\d{7}[CNSX]` id, increments, pads, and appends the form-type letter (`X` + warning log for unknown form ids).
- [ ] 3.2 Replace `const id = ulid()` at `requestService.ts:62` with `const id = await nextRequestNumber(formId)`. Keep `meta.correlationId = id`.
- [ ] 3.3 Wrap `RequestModel.create(...)` in a retry-on-duplicate-key loop (up to 5 attempts) so concurrent submissions don't collide.
- [ ] 3.4 In `gdfkube-src/gdfkube-itsm/src/data/seeds.ts`, append `C` to every `REQ\d{7}` id (lines 101-242) and update all matching references in `ACTIVITY_LOG.objectId`/`detail` (lines 357-396).
- [ ] 3.5 Update `gdfkube-src/gdfkube-itsm/server/__tests__/requests.test.ts:165` regex from `/^[0-9A-Z]{26}$/` to `/^REQ\d{7}[CNSX]$/`.
- [ ] 3.6 Update `gdfkube-src/gdfkube-camel/src/test/java/gov/gdf/camel/bean/HelmValuesBuilderTest.java:78,112` fixture from `REQ-HVB-001` to `REQ0010252C` (or extract into a shared constant).
- [ ] 3.7 Add a server test that races two concurrent `POST /api/itsm/requests` calls and asserts both return distinct sequential REQ ids.

## 4. Demo-user identity hardening (Bug #4)

- [ ] 4.1 In `gdfkube-src/gdfkube-itsm/src/api/itsmApi.ts`, replace the `demoUserResolver` getter pattern with a module-level ref `demoUserRef = { current: 'joao.silva' }` and export `setDemoUser(username: string)` that mutates `current`. The `api()` function reads `demoUserRef.current` directly.
- [ ] 4.2 In `gdfkube-src/gdfkube-itsm/src/App.tsx`, remove the `useEffect([user])` resolver-update. Call `setDemoUser(user.username ?? user.name)` synchronously in render (above the JSX return).
- [ ] 4.3 In `gdfkube-src/gdfkube-itsm/src/App.tsx`, remove `FALLBACK_OPERATOR` and `FALLBACK_ADMIN` constants and the corresponding fallback paths in `pickUser` — assert non-null.
- [ ] 4.4 In `gdfkube-src/gdfkube-itsm/src/shell/Bootstrap.tsx`, remove `FALLBACK_USERS` and `FALLBACK_GROUPS` and the `try/catch` that uses them. Let the existing `phase === 'error'` branch handle user/group fetch failures.
- [ ] 4.5 In `gdfkube-src/gdfkube-itsm/src/data/seeds.ts:59-68`, update `buildRequester` to derive `role` from a `KNOWN_ROLES: Record<string, 'operator'|'admin'>` map (e.g., `{ 'maria.costa': 'admin' }`), defaulting to `'operator'`.
- [ ] 4.6 In `gdfkube-src/gdfkube-itsm/server/src/data/demoUsers.ts`, remove the `lucia.fernandes` (approver) and `platform.bot` (service) entries. Narrow the `DemoUser['role']` union to `'operator' | 'admin'`.
- [ ] 4.7 In `gdfkube-src/gdfkube-itsm/server/__tests__/demoUser.test.ts`, drop tests that exercise approver/service roles. Add a test for the role enum narrowing.
- [ ] 4.8 Update `gdfkube-src/gdfkube-itsm/src/api/__tests__/itsmApi.test.ts` for the renamed `setDemoUser` API.
- [ ] 4.9 Add an integration test asserting that flipping role from operator to admin in the React tree results in the next `itsmApi.settings.get()` call carrying `X-Demo-User: maria.costa` (regression test for the original race).

## 5. Remove leftover debug-ingest code (Bug #5)

- [ ] 5.1 Delete the `#region agent log` / `#endregion` block in `gdfkube-src/gdfkube-itsm/server/src/services/requestService.ts:53-55` (the entire `fetch('http://localhost:7430/ingest/…')` call and its bracketing comments).
- [ ] 5.2 Run `git grep -n "7430/ingest\|60f88a58-2925-43f9-b28f-bcec8ca13914\|X-Debug-Session-Id\|sessionId:'df73a6'"` and remove any other hits.
- [ ] 5.3 Delete `.cursor/debug-df73a6.log` and `.cursor/rules/test-verification-logs.mdc` (untracked debug artefacts).

## 6. Reference docs amendment

- [ ] 6.1 Sweep `/workspace/docs/00-architecture-overview.md` through `13-observability.md` for stale references: `FALLBACK_USERS`, `setDemoUserResolver`, `approver`/`service`/`lucia.fernandes`/`platform.bot`, ULID-shaped request id examples (`01[HJ-NP-TV-Z]{25}`), and over-stated ArgoCD readiness. Fix in place; mark sections "Future state" where appropriate.
- [ ] 6.2 Update `/workspace/CLAUDE.md` to add a short "Demo identity" section: `DEMO_USERS` is the single source of truth, role enum is `operator | admin`, `X-Demo-User` is the only identity wire.
- [ ] 6.3 Update `/workspace/openspec/specs/itsm-portal-shell/spec.md`, `itsm-express-api/spec.md`, `itsm-users-collection/spec.md`, `itsm-admin-users/spec.md` per the deltas in this change (this happens automatically on archive, but verify the deltas apply cleanly via `openspec validate fix-itsm-portal-bug-batch --strict`).
- [ ] 6.4 In `/workspace/.tmp/REPORT-ISSUES.md`, add a header note that the audit predates the Express API migration and guidance assuming frontend-only state is superseded.
- [ ] 6.5 In archived OpenSpec change docs that prescribed the now-removed patterns (e.g., `/workspace/openspec/changes/archive/2026-05-11-add-itsm-express-api/{design.md,retrospective.md}`), append a one-line "Superseded by fix-itsm-portal-bug-batch (2026-05-13)" annotation. Do not rewrite history.
- [ ] 6.6 Verify: `git grep -n "FALLBACK_USERS\|setDemoUserResolver\|approver\|platform.bot\|lucia.fernandes" openspec/ docs/ CLAUDE.md gdfkube-src/gdfkube-itsm/` returns no hits except in superseded/historical-annotated entries.

## 7. End-to-end verification

- [ ] 7.1 `docker compose up -d` (Mongo + Kafka + Debezium + Camel + Gitea).
- [ ] 7.2 `cd gdfkube-src/gdfkube-itsm && npm install && npm run dev`. Open the app.
- [ ] 7.3 As operator, submit a cluster-request → id matches `REQ\d{7}C`; env radio dots are visible.
- [ ] 7.4 As Platform Admin, open Settings → page loads with no Forbidden toast. Approve the new request.
- [ ] 7.5 Observe the Provisioning Pipeline in the Request Detail view advance through Kafka → Camel → Git as the Camel pipeline runs. Cross-check the Gitea web UI for the new repo.
- [ ] 7.6 Switch to operator and back; confirm no stale `X-Demo-User` calls appear in DevTools network.
- [ ] 7.7 Stop the server → reload → Bootstrap shows the hard-error UI with Retry (no silent fallback).
- [ ] 7.8 `npm test` in both `gdfkube-itsm/` and `gdfkube-itsm/server/`. `mvn test` in `gdfkube-camel/`. All green.
- [ ] 7.9 `openspec validate fix-itsm-portal-bug-batch --strict` returns valid.
