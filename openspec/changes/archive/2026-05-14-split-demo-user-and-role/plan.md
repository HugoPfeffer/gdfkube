# Split Demo User from Role — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development
> to implement this plan task-by-task.

**Goal:** Make the active demo user the single source of truth for `requesterGroupName` end-to-end, split user identity from the role toggle in the topbar, and honor an additive `X-Demo-Role` header on the server — without mutating `DEMO_USERS` and without changing any downstream consumer's wire shape.

**Architecture:** SPA holds two independent pieces of state (`activeUsername`, `role`), each persisted to `localStorage` and pushed into the API client's outbound headers synchronously inside `App.tsx`'s render body (preserving the existing no-stale-header invariant). The Express demo-user middleware reads an optional `X-Demo-Role` header and clones the matched `DemoUser` with `.role` overridden when the value is valid. The `requestService` injects `meta.requesterGroupName: demoUser.group` so existing templates continue to render after the form field is dropped.

**Tech Stack:** TypeScript / React (SPA), Node.js / Express (server), Vitest (SPA tests), Jest or Vitest (server tests), MongoDB (seed JSON + Mongoose). No new dependencies.

References within this change:
- `proposal.md` — what & why
- `design.md` — decisions, sequence, migration
- `specs/itsm-portal-shell/spec.md` — topbar deltas
- `specs/itsm-express-api/spec.md` — middleware delta
- `specs/itsm-request-submission/spec.md` — prefix fallback + server injection
- `tasks.md` — task-level checklist (this plan is the micro-step decomposition)

---

## Task 1: Drop the Department field from form schemas (seed source of truth)

- [ ] **1.1** Open `gdfkube-src/gdfkube-itsm/src/data/adminSeeds.ts`. Locate the `cluster-request` field array; delete the entire `requesterGroupName` field object (block around lines 42–52). Keep the rest of the array intact.
- [ ] **1.2** In the same file, repeat for `namespace-request` (around line 91) and `scale-request` (around line 154).
- [ ] **1.3** In the `FORMS` array (lines 7–37), decrement each of the three forms' `fieldCount` by one. Re-read each form entry once after editing to confirm the count matches the new field count.
- [ ] **1.4** Confirm the `clusterName` field in each affected form still carries `prefix: 'hc-{requesterGroupName}-'` and its `help` string mentioning `{requesterGroupName}`. Do not modify them — the resolver fallback added in Task 2 handles the missing sibling.
- [ ] **1.5** Run `cd gdfkube-src/gdfkube-itsm && npm run typecheck` to confirm no consumer of the removed field broke. Expect a green run.
- [ ] **Commit point:** `chore(seeds): drop requesterGroupName field from cluster/namespace/scale forms`.

## Task 2: Mongo seed JSON parity + re-export

- [ ] **2.1** Open `gdfkube-src/gdfkube-infra/mongodb/seed-data/forms.json`. For each of `cluster-request`, `namespace-request`, `scale-request`, delete the `requesterGroupName` field block from `fields[]`. Leave `templates[]` unchanged.
- [ ] **2.2** Run `node gdfkube-src/gdfkube-itsm/scripts/export-seed-data.mjs`. Verify no exit error and that any derived copies it writes reflect the new field counts. If the script regenerates `forms.json` from `adminSeeds.ts`, diff the result against the edit in 2.1 to confirm parity.
- [ ] **2.3** Open `gdfkube-src/gdfkube-infra/mongodb/seed-collections.js` and confirm: (a) it still seeds `forms` from `seed-data/forms.json`; (b) the `requesterGroupName` index (line ~84) is on `requests`, not `forms` — so no index change is needed.
- [ ] **2.4** `git diff` the three seed files; sanity-check there are no stray references to the removed field.
- [ ] **Commit point:** `chore(seeds): mirror form-field drop to mongo seed JSON and re-export`.

## Task 3: Prefix/help-text fallback to user.group (TDD)

- [ ] **3.1** Open `gdfkube-src/gdfkube-itsm/src/forms/__tests__/GenericRequest.test.tsx`. Find the "prefix interpolates sibling value" suite around line 215.
- [ ] **3.2** Add a new test: render `GenericRequest` with a FormDef whose `fields[]` does NOT include `requesterGroupName` and where a `clusterName` field declares `prefix: "hc-{requesterGroupName}-"`. Inject a mock `user` with `group: 'educ'`. Assert the rendered prefix text equals `hc-educ-`.
- [ ] **3.3** Add a second new test: same FormDef, but assert the `help` text containing `{requesterGroupName}` renders with `educ` substituted.
- [ ] **3.4** Add a third (negative) test: an unrelated placeholder `{clusterName}` with no current value renders as empty string and the `user.group` fallback is NOT triggered.
- [ ] **3.5** Run `npx vitest run src/forms/__tests__/GenericRequest.test.tsx`. Expect the three new tests to FAIL (red phase).
- [ ] **3.6** Open `gdfkube-src/gdfkube-itsm/src/forms/GenericRequest.tsx`. Locate the resolver that maps `{siblingKey}` placeholders to `values[siblingKey]` for both `prefix` and `help` strings (used by the existing passing tests at line 215).
- [ ] **3.7** Modify the resolver: when the sibling key is `requesterGroupName` AND `fields.every(f => f.key !== 'requesterGroupName')`, return `user.group` (use the existing `user` available in the runner's render scope). Otherwise preserve current behavior.
- [ ] **3.8** Re-run the vitest command from 3.5. Expect all three new tests to pass (green) and the existing prefix/help tests to remain green.
- [ ] **3.9** Re-run `npm run typecheck`. Expect green.
- [ ] **Commit point:** `feat(forms): fall back prefix/help {requesterGroupName} to user.group when sibling field absent`.

## Task 4: Server — inject `meta.requesterGroupName` (TDD)

- [ ] **4.1** Add or extend a unit test for `requestService` (under `gdfkube-src/gdfkube-itsm/server/src/services/__tests__/` if it exists, otherwise create it). Test case: invoke the request-submission code path with a FormDef-validated body that contains NO `requesterGroupName` field, a `demoUser` of `{ username: 'ana.pereira', group: 'educ', role: 'operator' }`, and assert the persisted document contains `meta.requesterGroupName === 'educ'`, top-level `requesterGroupName === 'educ'`, and all other `meta.*` fields (`requestId`, `correlationId`, `requesterName`, `requesterFullName`, `requesterEmail`, `requesterRole`, `submittedAt`, `formId`) are still present.
- [ ] **4.2** Run the new test. Expect it to FAIL on the `meta.requesterGroupName` assertion (red).
- [ ] **4.3** Open `gdfkube-src/gdfkube-itsm/server/src/services/requestService.ts` at the `meta` construction (around line 107). Change `meta: { ...validation.meta, correlationId: id }` to `meta: { ...validation.meta, requesterGroupName: demoUser.group, correlationId: id }`. Leave the surrounding `requesterGroupName: demoUser.group` top-level assignment (line ~101) untouched.
- [ ] **4.4** Re-run the new test. Expect it to pass.
- [ ] **4.5** Run the full server test suite (`npm test --workspace server` or the project's standard command). Expect no regressions.
- [ ] **Commit point:** `feat(server): inject meta.requesterGroupName from demoUser.group in requestService`.

## Task 5: Server — honor `X-Demo-Role` override (TDD)

- [ ] **5.1** Open the existing tests for `gdfkube-src/gdfkube-itsm/server/src/middleware/demoUser.ts` (find them under `__tests__/`). Add five new test cases:
  - (a) `X-Demo-User: ana.pereira` (stored `operator`) + `X-Demo-Role: admin` → `req.demoUser.role === 'admin'`, `req.demoUser` is NOT the same object reference as `DEMO_USERS['ana.pereira']`, and `DEMO_USERS['ana.pereira'].role` remains `'operator'`.
  - (b) `X-Demo-User: maria.costa` (stored `admin`) + `X-Demo-Role: operator` → `req.demoUser.role === 'operator'`.
  - (c) `X-Demo-User: ana.pereira` + `X-Demo-Role: bogus` → `req.demoUser.role === 'operator'`, request forwarded (not rejected).
  - (d) `X-Demo-User: ana.pereira`, no `X-Demo-Role` header → `req.demoUser.role === 'operator'` (stored), still cloned.
  - (e) Admin-gate interaction: a supertest request to `GET /api/itsm/users` with `X-Demo-User: ana.pereira` + `X-Demo-Role: admin` returns `200`.
- [ ] **5.2** Run the tests. Expect (a), (b), (e) to FAIL (red).
- [ ] **5.3** Open `gdfkube-src/gdfkube-itsm/server/src/middleware/demoUser.ts`. After `const matched = DEMO_USERS[username]`, add: read `req.headers['x-demo-role']` (string, lower-case). If the trimmed value is `'operator'` or `'admin'`, set `req.demoUser = { ...matched, role: <header> }`. Otherwise `req.demoUser = { ...matched }`. Always clone — never assign `req.demoUser = matched`.
- [ ] **5.4** Re-run the middleware tests. Expect all five to pass.
- [ ] **5.5** Open `gdfkube-src/gdfkube-itsm/server/src/middleware/requireAdmin.ts` — confirm no change is needed (it reads `req.demoUser?.role` and gates on `=== 'admin'`).
- [ ] **5.6** Run the full server test suite. Expect green.
- [ ] **Commit point:** `feat(server): honor optional X-Demo-Role header in demoUser middleware (cloned override)`.

## Task 6: SPA — `setDemoRole` and `X-Demo-Role` header

- [ ] **6.1** Open `gdfkube-src/gdfkube-itsm/src/api/itsmApi.ts`. Just after the existing `demoUserRef` declaration (line ~27), add `let demoRoleRef: { current: Role } = { current: 'admin' };` (default `'admin'` matches the Bootstrap reasoning documented for `demoUserRef`).
- [ ] **6.2** Add `export function setDemoRole(role: Role) { demoRoleRef.current = role; }` next to `setDemoUser` (line ~29).
- [ ] **6.3** In `api()` (around line 45), inside the headers literal that already contains `'X-Demo-User': demoUserRef.current`, add `'X-Demo-Role': demoRoleRef.current`.
- [ ] **6.4** Run `npm run typecheck`. If the `Role` type isn't imported in `itsmApi.ts`, add the import from `../types`. Re-run until green.
- [ ] **Commit point:** `feat(spa): add setDemoRole + X-Demo-Role header to itsmApi`.

## Task 7: SPA — `App.tsx` independent state and synchronous header sync

- [ ] **7.1** Open `gdfkube-src/gdfkube-itsm/src/App.tsx`. Delete the `pickUser()` helper (lines ~49–55) and the `useMemo` that derives `user` from `role` (line ~66).
- [ ] **7.2** Replace with `const [activeUsername, setActiveUsername] = useState<string>(() => localStorage.getItem('gdfkube.demoUser') ?? '');`
- [ ] **7.3** Replace the role state with `const [role, setRole] = useState<Role>(() => { const v = localStorage.getItem('gdfkube.demoRole'); return v === 'operator' || v === 'admin' ? v : 'operator'; });` (validate the localStorage value to avoid type-narrowing surprises).
- [ ] **7.4** Compute `const user = useMemo(() => data.users.find(u => u.username === activeUsername) ?? data.users.find(u => u.role === 'operator') ?? data.users[0], [data.users, activeUsername]);`
- [ ] **7.5** In the render body — at the same code site as the existing comment block at lines 68–73 — call `setDemoUser(user.username ?? user.name);` and `setDemoRole(role);` synchronously (no `useEffect`).
- [ ] **7.6** Add `useEffect(() => { localStorage.setItem('gdfkube.demoUser', activeUsername); }, [activeUsername]);` and `useEffect(() => { localStorage.setItem('gdfkube.demoRole', role); }, [role]);`
- [ ] **7.7** Pass `users={data.users}` and `setUser={setActiveUsername}` (in addition to the existing role/setRole props) to `<Topbar />`.
- [ ] **7.8** Leave the route-guard `useEffect` (lines ~77–86) untouched. Confirm it still keys on `role`.
- [ ] **7.9** Run `npm run typecheck`. Fix any prop typing on `Topbar` (Task 8 will refine `TopbarProps`).
- [ ] **Commit point:** `feat(spa): decouple activeUsername from role in App.tsx + persist to localStorage`.

## Task 8: SPA — Topbar Switch user above Switch role

- [ ] **8.1** Open `gdfkube-src/gdfkube-itsm/src/shell/Topbar.tsx`. Extend `TopbarProps` (lines ~14–21) with `users: User[]` and `setUser: (username: string) => void;`. Import `User` type if not already imported.
- [ ] **8.2** Inside the dropdown menu JSX (lines ~109–177), find the existing `Switch role` header (lines ~110–121). Insert a new section *above* it:
  - A header element styled the same as the existing role-section header, with text `Switch user`.
  - A list of menu-item buttons, one per `users.filter(u => u.status !== 'disabled' && u.active !== false)`. Sort alphabetically by `fullName` for stable ordering (use existing order if the project already imposes one — fine for demo).
  - Each item: avatar/initials placeholder (or omit), a name line (`u.fullName ?? u.name`), and a secondary line `@ {u.group}`. If `u.username === user.username` (the active user), render `<Icons.check className="menu-check" />` on the right.
  - `onClick`: call `setUser(u.username)` and `setOpen(false)`. Do NOT touch role.
- [ ] **8.3** Replace the two existing role buttons (lines ~122–159) with a simplified pair:
  - Button `Operator perspective` → `onClick={() => { setRole('operator'); setOpen(false); }}`. Carries the active check when `role === 'operator'`.
  - Button `Admin perspective` → `onClick={() => { setRole('admin'); setOpen(false); }}`. Carries the active check when `role === 'admin'`.
  - Drop the previous subtitle text (`joao.silva @ saude`, `m.costa @ setic`).
- [ ] **8.4** Verify the trigger button's "who" block (lines ~100–105) still shows `user.name` and `{org} · {roleLabel(role)}` — should work unchanged because both `user` and `role` are now independent props.
- [ ] **8.5** Run `npm run typecheck`. Fix any missing prop types.
- [ ] **8.6** Run `npm test` for the topbar-adjacent test suites. Expect green; if existing tests pinned `joao.silva` ↔ `operator` via role click, update them to: select user via Switch user; toggle role via Switch role.
- [ ] **Commit point:** `feat(spa): topbar Switch user section above simplified Switch role`.

## Task 9: Verification + cleanup

- [ ] **9.1** Run `cd gdfkube-src/gdfkube-itsm && npm run typecheck && npm test`. Fix any regression.
- [ ] **9.2** Boot the dev stack (`npm run dev` with Mongo running locally). Open the SPA. Confirm the topbar dropdown shows: `Switch user` section listing every active demo user with `@ {group}` lines; `Switch role` section with `Operator perspective` / `Admin perspective`.
- [ ] **9.3** Pick a non-`saude` user (e.g. `ana.pereira`). Open `New Request → OpenShift Cluster`. Confirm there is no Department field. Type `foo` into the cluster-name input. The visible prefix reads `hc-{ana.group}-`.
- [ ] **9.4** Submit. On the request detail page, confirm `requesterGroupName` matches `ana.group` and `requester.id === 'ana.pereira'`.
- [ ] **9.5** Toggle `Admin perspective`. Confirm the Approvals tab appears in the sidebar. Open it; approvals load with 200. Approve the request from 9.4.
- [ ] **9.6** Switch the active user back to `joao.silva` from the Switch user section. Confirm the role remains `Admin perspective`.
- [ ] **9.7** Reload the SPA. Confirm `joao.silva` + `Admin perspective` persist.
- [ ] **9.8** Admin → topbar live-sync: open the admin Users tab, create user `demo.tester` in group `educ`. Without reloading, open the topbar dropdown; `demo.tester @ educ` appears. Disable an existing user; it disappears from the picker.
- [ ] **9.9** MCP MongoDB check: connect to the local Mongo, run `db.requests.findOne({_id: '<REQ-id-from-9.4>'})`. Confirm top-level `requesterGroupName === ana.group`, `meta.requesterGroupName === ana.group`, `requester.id === 'ana.pereira'`, `requester.group === ana.group`, and `requester.role === 'admin'` (because Admin perspective was active at submit time of 9.5's approval). For an earlier request submitted while role was operator, `requester.role === 'operator'`.
- [ ] **9.10** Camel E2E: confirm the `provisioning` stage event flows; `RequestRouterRoute` produces a HostedCluster named `hc-{ana.group}-foo` and the manifest lands in `gdfkube-orgs/orgs/{ana.group}/`.
- [ ] **9.11** Header hygiene curl: `curl -H 'X-Demo-User: joao.silva' -H 'X-Demo-Role: bogus' http://localhost/api/itsm/users` returns 403 (stored role `operator` after fall-through); `-H 'X-Demo-Role: admin'` returns 200.
- [ ] **9.12** Run `pre-commit run --all-files` (trufflehog secret scan) and `openspec validate split-demo-user-and-role`. Both must pass before pushing.
- [ ] **Commit point:** at most a `test(*)` commit if 9.x surfaced test-only fixups. Otherwise, nothing to commit at this stage.
