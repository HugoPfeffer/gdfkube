# fix-itsm-portal-bug-batch Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Land minimum-surface fixes for five gdfkube ITSM portal regressions (pipeline stage drift, invisible env radio dots, ULID request ids, Settings Forbidden + demo-user race, leftover debug-ingest fetch) and consolidate the demo-user identity to one source of truth, with reference docs amended to prevent re-drift.

**Architecture:** Frontend changes touch `src/api/itsmApi.ts`, `src/App.tsx`, `src/shell/Bootstrap.tsx`, `src/forms/RadioCards.tsx`, `src/data/seeds.ts`. Server changes touch `server/src/services/requestService.ts`, `server/src/data/demoUsers.ts`. Camel changes touch three routes (`RequestRouterRoute`, `RepoBootstrapRoute`, `StatusEmitterRoute`) and the shared `updateStageInMongo` helper. Test updates and doc sweeps complete each scope.

**Tech Stack:** Vite + React 18 + TypeScript (frontend), Express + Mongoose (server), Apache Camel + Quarkus (orchestrator), MongoDB + Kafka + Debezium + Gitea (infra), Vitest + Playwright (frontend tests), JUnit + Testcontainers (Camel tests).

---

## Task 1: Camel intermediate stage writes + monotonic stage

- [ ] **Step 1:** Read `gdfkube-camel/src/main/java/gov/gdf/camel/routes/StatusEmitterRoute.java` and identify the `updateStageInMongo(requestId, stage)` helper (or its inline equivalent). Note the exact Mongo collection/field and whether the update uses `$set` or `$max`.
- [ ] **Step 2:** Change the StatusEmitterRoute stage update to `$max: { stage }` (currently `$set`). Add a unit test (Testcontainers Mongo) that pre-populates a doc at stage 5 and verifies a `$max(4)` update is a no-op.
- [ ] **Step 3:** Open `RequestRouterRoute.java`. Identify the entry point where the route consumes the Kafka message. Inject a call to `updateStageInMongo(requestId, 4)` immediately after the message is deserialized (before any business processing).
- [ ] **Step 4:** Open `RepoBootstrapRoute.java`. Identify the success path after `git push` / Gitea API succeeds. Inject `updateStageInMongo(requestId, 5)`. Make sure the call is only made on success (use Camel's success branch, not the catch).
- [ ] **Step 5:** Run `mvn test -pl gdfkube-camel` and confirm existing tests still pass.
- [ ] **Step 6:** Add an integration test: simulate request submission → approval → Camel processing, and assert that `stage` advances monotonically through 4 and 5 in Mongo over time.
- [ ] **Commit:** `pipeline: emit intermediate stage writes from Camel routes; use $max in StatusEmitterRoute`

## Task 2: Radio card dot visible

- [ ] **Step 1:** Open `gdfkube-src/gdfkube-itsm/src/forms/RadioCards.tsx`. Locate lines 46-52 (the dot span).
- [ ] **Step 2:** Replace the `<span className="dot" aria-hidden="true" style={dotStyle(opt.dotColor)}>` block with the inline-style version: `<span aria-hidden="true" style={{display:'inline-block', width:8, height:8, borderRadius:'50%', background: opt.dotColor}} />`. Remove the now-unused `dotStyle` helper.
- [ ] **Step 3:** Run `npm run dev` in `gdfkube-src/gdfkube-itsm/`. Navigate to Catalog → OpenShift Cluster. Visually confirm the three env radio cards show colored dots (green/amber/red).
- [ ] **Step 4:** Add a Vitest+RTL test under `src/forms/__tests__/RadioCards.test.tsx` asserting the rendered span has `style.width === '8px'` and `style.borderRadius === '50%'`.
- [ ] **Step 5:** Run `npm test` and confirm all tests pass.
- [ ] **Commit:** `forms: render radio-card env dots inline-styled so they are visible`

## Task 3: REQ-pattern request id generator

- [ ] **Step 1:** In `gdfkube-src/gdfkube-itsm/server/src/services/requestService.ts`, add module-level constant `const FORM_TYPE_CODE: Record<string, 'C' | 'N' | 'S'> = { 'cluster-request': 'C', 'namespace-request': 'N', 'scale-request': 'S' };`.
- [ ] **Step 2:** Add a helper `async function nextRequestNumber(formId: string): Promise<string>`. Inside: query `RequestModel.findOne({ _id: /^REQ\d{7}[CNSX]$/ }).sort({ _id: -1 }).select('_id').lean()`. Parse `parseInt(doc._id.slice(3, 10), 10)` or default to 10251. Increment, pad to 7. Append `FORM_TYPE_CODE[formId] ?? 'X'`; if 'X', `console.warn` the unknown formId. Return.
- [ ] **Step 3:** Replace `const id = ulid();` at line 62 with `let id = await nextRequestNumber(formId);`.
- [ ] **Step 4:** Wrap the surrounding `RequestModel.create(...)` block in a retry loop: catch Mongo duplicate-key errors (code 11000), re-call `nextRequestNumber(formId)`, retry up to 5 times. Throw after 5 failures.
- [ ] **Step 5:** Run `npm test --workspace=server`. Update `server/__tests__/requests.test.ts:165` regex from `/^[0-9A-Z]{26}$/` to `/^REQ\d{7}[CNSX]$/`. Re-run.
- [ ] **Step 6:** In `gdfkube-camel/src/test/java/gov/gdf/camel/bean/HelmValuesBuilderTest.java`, update the `REQ-HVB-001` fixtures at lines 78 and 112 to `REQ0010252C`. Run `mvn test -pl gdfkube-camel`.
- [ ] **Step 7:** Add a server test that fires two concurrent `submit()` calls and asserts both succeed with sequential REQ ids (use `Promise.all`).
- [ ] **Step 8:** In `gdfkube-src/gdfkube-itsm/src/data/seeds.ts`, append `C` to every `REQ\d{7}` id (lines 101-242) using a find-and-replace. Update activity log entries (lines 357-396) the same way.
- [ ] **Step 9:** Re-seed Mongo (`docker compose exec itsm npm run seed` or equivalent) and verify the dashboard renders the new id format.
- [ ] **Commit:** `requests: generate REQ + 7-digit + form-type-letter ids; update fixtures and tests`

## Task 4: Demo-user identity hardening

- [ ] **Step 1:** In `gdfkube-src/gdfkube-itsm/src/api/itsmApi.ts`, replace the `demoUserResolver`/`setDemoUserResolver` pair with `const demoUserRef = { current: 'joao.silva' }` (module-level) and `export function setDemoUser(username: string) { demoUserRef.current = username; }`. Update the `api()` function to read `demoUserRef.current`.
- [ ] **Step 2:** In `gdfkube-src/gdfkube-itsm/src/api/__tests__/itsmApi.test.ts`, replace all `setDemoUserResolver(() => 'foo')` with `setDemoUser('foo')`. Run `npm test` until green.
- [ ] **Step 3:** In `gdfkube-src/gdfkube-itsm/src/App.tsx`, delete the `useEffect(() => { setDemoUserResolver(...) }, [user])` block at lines 83-85. Just above the JSX return, add `setDemoUser(user.username ?? user.name)`.
- [ ] **Step 4:** In the same file, delete `FALLBACK_OPERATOR` and `FALLBACK_ADMIN` constants (lines 38-54). Update `pickUser` to drop the final `?? FALLBACK_*` fallbacks; if `users.find(...)` returns undefined, throw (it shouldn't, given Bootstrap guarantees the data).
- [ ] **Step 5:** In `gdfkube-src/gdfkube-itsm/src/shell/Bootstrap.tsx`, delete `FALLBACK_USERS` (lines 6-29) and `FALLBACK_GROUPS` (lines 31-34). Remove the `try { … } catch { rawUsers = FALLBACK_USERS as …; rawGroups = FALLBACK_GROUPS as …; }` block — let errors propagate to the existing `setPhase('error')` branch.
- [ ] **Step 6:** In `gdfkube-src/gdfkube-itsm/src/data/seeds.ts`, change `buildRequester` to consult a `KNOWN_ROLES` map. Above the function: `const KNOWN_ROLES: Record<string, 'operator' | 'admin'> = { 'maria.costa': 'admin' };`. Inside: `role: KNOWN_ROLES[username] ?? 'operator'`.
- [ ] **Step 7:** In `gdfkube-src/gdfkube-itsm/server/src/data/demoUsers.ts`, remove the `lucia.fernandes` and `platform.bot` entries. Narrow `DemoUser['role']` to `'operator' | 'admin'`.
- [ ] **Step 8:** In `gdfkube-src/gdfkube-itsm/server/__tests__/demoUser.test.ts`, drop tests that exercise approver or service roles. Add a new test: `expect(DEMO_USERS['lucia.fernandes']).toBeUndefined()`.
- [ ] **Step 9:** Add a Vitest integration test asserting that flipping role from operator to admin via Topbar causes the next `itsmApi.settings.get` call to send `X-Demo-User: maria.costa` (no stale header).
- [ ] **Step 10:** Run `npm test` in both `gdfkube-itsm/` and `gdfkube-itsm/server/`; all green.
- [ ] **Step 11:** Manual smoke: `npm run dev` → load app → switch to Platform Admin → navigate to Settings → form loads (no Forbidden).
- [ ] **Commit:** `identity: synchronous X-Demo-User setter; trim DEMO_USERS to operator/admin; drop Bootstrap fallbacks`

## Task 5: Remove leftover debug-ingest

- [ ] **Step 1:** Open `gdfkube-src/gdfkube-itsm/server/src/services/requestService.ts`. Locate the `// #region agent log` … `// #endregion` block at lines 53-55. Delete the entire region (3 lines including comments and the `fetch(...)` call).
- [ ] **Step 2:** Run `git grep -n "7430/ingest\|60f88a58-2925-43f9-b28f-bcec8ca13914\|X-Debug-Session-Id\|hypothesisId\|sessionId:'df73a6'"`. Inspect every hit; delete each one that's the same debug-ingest pattern.
- [ ] **Step 3:** Delete `.cursor/debug-df73a6.log` and `.cursor/rules/test-verification-logs.mdc` (untracked).
- [ ] **Step 4:** Run server tests; ensure no test depended on the ingest endpoint.
- [ ] **Commit:** `requestService: remove leftover debug-ingest fetch and supporting artefacts`

## Task 6: Reference docs amendment

- [ ] **Step 1:** Sweep `docs/00-architecture-overview.md` and `docs/01-itsm-portal.md` through `docs/13-observability.md` for stale references:
  - `git grep -n "FALLBACK_USERS\|setDemoUserResolver\|approver\|platform.bot\|lucia.fernandes" docs/`
  - `git grep -En "01[0-9A-HJ-NP-TV-Z]{25}" docs/` (ULID examples)
  - `git grep -En "ArgoCD.*(ready|live|operational)" docs/`
  Fix each in place. Where docs describe future state, prepend `> **Future state — not yet implemented.**`.
- [ ] **Step 2:** Update `/workspace/CLAUDE.md` with a "Demo identity" section: `DEMO_USERS` is the single source of truth; role enum is `operator | admin`; `X-Demo-User` is the only identity wire; no FALLBACK arrays.
- [ ] **Step 3:** Add a header note to `/workspace/.tmp/REPORT-ISSUES.md` clarifying it predates the Express API and that any frontend-only state guidance is superseded.
- [ ] **Step 4:** In `/workspace/openspec/changes/archive/2026-05-11-add-itsm-express-api/{design.md,retrospective.md}`, append a single-line "Superseded by fix-itsm-portal-bug-batch (2026-05-13)" annotation near any section that prescribed the now-removed patterns. Do not rewrite history.
- [ ] **Step 5:** Run `git grep -n "FALLBACK_USERS\|setDemoUserResolver\|approver\|platform.bot\|lucia.fernandes" openspec/ docs/ CLAUDE.md gdfkube-src/gdfkube-itsm/`. Verify zero hits except in entries marked as historical/superseded.
- [ ] **Commit:** `docs: amend high-level docs, CLAUDE.md, and archived OpenSpec entries to remove drift sources`

## Task 7: Final verify

- [ ] **Step 1:** `openspec validate fix-itsm-portal-bug-batch --strict` → valid.
- [ ] **Step 2:** `pre-commit run --all-files` → clean (trufflehog secret scan passes).
- [ ] **Step 3:** Full test runs:
  - `npm test` in `gdfkube-src/gdfkube-itsm/`
  - `npm test` in `gdfkube-src/gdfkube-itsm/server/`
  - `mvn test` in `gdfkube-src/gdfkube-camel/`
  - `npm run e2e` (Playwright) in `gdfkube-src/gdfkube-itsm/`
- [ ] **Step 4:** Manual end-to-end smoke per `verify.md`.
