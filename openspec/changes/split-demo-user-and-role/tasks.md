## 1. Seed data: drop the Department field from the three forms

- [x] 1.1 Update `gdfkube-src/gdfkube-itsm/src/data/adminSeeds.ts` — remove the `requesterGroupName` field entry (lines ~42–52) from `cluster-request`, and the analogous entries from `namespace-request` (~line 91) and `scale-request` (~line 154).
- [x] 1.2 Decrement `fieldCount` for each of the three forms in the `FORMS` array (lines ~7–37) by one. Confirm the `clusterName` field's `prefix: 'hc-{requesterGroupName}-'` and its help string are preserved.
- [x] 1.3 Update `gdfkube-src/gdfkube-infra/mongodb/seed-data/forms.json` — remove the `requesterGroupName` field block from each of the three forms' `fields[]` arrays. Leave each form's `templates[]` unchanged (they continue to reference `{{ meta.requesterGroupName }}`).
- [x] 1.4 Run `node gdfkube-src/gdfkube-itsm/scripts/export-seed-data.mjs` and confirm any derived copies are regenerated; spot-check that `gdfkube-infra/mongodb/seed-collections.js` will reseed from the JSON on container restart.

## 2. SPA: prefix interpolator falls back to user.group

- [x] 2.1 In `gdfkube-src/gdfkube-itsm/src/forms/GenericRequest.tsx`, locate the prefix/help-text resolver that maps `{siblingKey}` to `values[siblingKey]`. Extend it: when the sibling key is `requesterGroupName` and no `fields[]` entry has `key: 'requesterGroupName'`, return `user.group` (use the existing `user` from the runner's context).
- [x] 2.2 Confirm the post-submit reshape (`requesterGroupName: doc.requesterGroupName || values.requesterGroupName || user.group || ''`) already tolerates the missing form value — no change required at the submit site.
- [x] 2.3 Update `gdfkube-src/gdfkube-itsm/src/forms/__tests__/GenericRequest.test.tsx` (around the "prefix interpolates sibling value" suite at line ~215) to add cases covering: (a) prefix fallback to `user.group` when the `requesterGroupName` field is absent; (b) help-text fallback to `user.group` under the same condition; (c) negative — an unrelated placeholder still renders as empty string.

## 3. Server: inject meta.requesterGroupName from demoUser

- [x] 3.1 In `gdfkube-src/gdfkube-itsm/server/src/services/requestService.ts`, change the `meta` construction (around line 107) from `meta: { ...validation.meta, correlationId: id }` to `meta: { ...validation.meta, requesterGroupName: demoUser.group, correlationId: id }`. Leave the top-level `requesterGroupName: demoUser.group` (line ~101) untouched.
- [x] 3.2 Add a unit test next to `requestService.ts` (Jest/Vitest) covering: (a) submitted body without a `requesterGroupName` field → persisted document has both top-level `requesterGroupName` and `meta.requesterGroupName` equal to `demoUser.group`; (b) all other validator-derived `meta.*` fields remain present.

## 4. Server: honor X-Demo-Role override

- [x] 4.1 In `gdfkube-src/gdfkube-itsm/server/src/middleware/demoUser.ts`, after the `DEMO_USERS[username]` lookup, read `req.headers['x-demo-role']`. When the header is exactly `'operator'` or `'admin'`, attach `req.demoUser = { ...matched, role: header }` (cloned, never mutating `DEMO_USERS[username]`).
- [x] 4.2 When the header is missing, empty, or any other value, leave `req.demoUser` as a shallow clone of the matched entry with the stored role (still cloned to keep the wire-vs-store boundary uniform — and so downstream mutations cannot leak into `DEMO_USERS`).
- [x] 4.3 Confirm `requireAdmin.ts` does not need any change (it already reads `req.demoUser?.role`).
- [x] 4.4 Add a unit test for `demoUser.ts` covering: (a) valid override `admin` for an `operator` user → `req.demoUser.role === 'admin'` and `DEMO_USERS` is unchanged; (b) valid override `operator` for an `admin` user → `req.demoUser.role === 'operator'`; (c) invalid value `bogus` → role falls through to stored; (d) header absent → role falls through; (e) admin-gate interaction — an operator with `X-Demo-Role: admin` passes the gate.

## 5. SPA: setDemoRole + X-Demo-Role header

- [x] 5.1 In `gdfkube-src/gdfkube-itsm/src/api/itsmApi.ts`, add a module-scoped `demoRoleRef = { current: 'admin' as Role }` next to the existing `demoUserRef` (around line 27). Default `'admin'` to keep admin-gated Bootstrap fetches working.
- [x] 5.2 Export `setDemoRole(role: Role)` that updates `demoRoleRef.current`, next to `setDemoUser` (around line 29).
- [x] 5.3 In the `api()` helper (around line 45), add `'X-Demo-Role': demoRoleRef.current` to the headers object alongside `X-Demo-User`.

## 6. SPA: App.tsx — decouple user from role, persist both

- [x] 6.1 In `gdfkube-src/gdfkube-itsm/src/App.tsx`, remove `pickUser()` (lines ~49–55) and the role-driven `useMemo` for `user` (line ~66).
- [x] 6.2 Introduce `[activeUsername, setActiveUsername] = useState<string>(() => localStorage.getItem('gdfkube.demoUser') ?? '')` and `[role, setRole] = useState<Role>(() => (localStorage.getItem('gdfkube.demoRole') as Role) ?? 'operator')`.
- [x] 6.3 Compute `user = useMemo(() => data.users.find(u => u.username === activeUsername) ?? data.users.find(u => u.role === 'operator') ?? data.users[0], [data.users, activeUsername])`.
- [x] 6.4 In the render body — same site as the existing comment at lines 68–73 explaining the synchronous-header invariant — call **both** `setDemoUser(user.username ?? user.name)` and `setDemoRole(role)` synchronously.
- [x] 6.5 Add `useEffect(() => { localStorage.setItem('gdfkube.demoUser', activeUsername); }, [activeUsername])` and `useEffect(() => { localStorage.setItem('gdfkube.demoRole', role); }, [role])`.
- [x] 6.6 Pass `setUser={setActiveUsername}`, `users={data.users}`, and the existing role props to `<Topbar>`. Leave the route-guard `useEffect` (lines ~77–86) untouched.

## 7. SPA: Topbar — Switch user above Switch role

- [x] 7.1 In `gdfkube-src/gdfkube-itsm/src/shell/Topbar.tsx`, extend `TopbarProps` (lines ~14–21) with `users: User[]` and `setUser: (username: string) => void`.
- [x] 7.2 In the dropdown menu (lines ~109–177), insert a new `Switch user` section *above* the existing `Switch role` header. Render menu items derived from `users.filter(u => u.status !== 'disabled' && u.active !== false)`, ordered alphabetically by `fullName` (or by the existing iteration order if simpler). Each item shows the user's `name`/`fullName` and a secondary line `@ {group}`. The active user item carries `<Icons.check className="menu-check" />`.
- [x] 7.3 Selecting a user calls `setUser(u.username)` and `setOpen(false)`. The active role is unchanged.
- [x] 7.4 Replace the existing role buttons (lines ~122–159) with a simplified pair labeled `Operator perspective` and `Admin perspective` that only toggles `role` (no user-pin behavior). Drop the `joao.silva @ saude` / `m.costa @ setic` subtitles.
- [x] 7.5 Leave the trigger button's "who" block (lines ~100–105) — it already shows `user.name` and `{org} · {roleLabel(role)}` and works correctly with the new independent state.

## 8. Verify the full flow

- [x] 8.1 Run `cd gdfkube-src/gdfkube-itsm && npm run typecheck && npm test`. The `GenericRequest` suite must pass with the new fallback cases; all other suites must pass unchanged.
- [ ] 8.2 Boot the dev stack (`npm run dev` with Mongo running locally). Confirm the topbar dropdown shows a `Switch user` section listing every active demo user with their group, and a `Switch role` section with two clean perspective options.
- [ ] 8.3 Pick `ana.pereira` (or another non-`saude` user). File an OpenShift Cluster Request named `foo`. Visible prefix MUST read `hc-{ana.group}-` and no Department field SHALL be visible. On the request detail page, `requesterGroupName` matches the picked user's group and `requester.id` is the picked username.
- [ ] 8.4 Role override: pick `ana.pereira` (stored role `operator`), toggle Admin perspective. The Approvals tab appears; `/api/itsm/approvals` and `/api/itsm/users` return 200. Switch to another user — the role toggle stays on Admin.
- [ ] 8.5 Persistence: reload the SPA. The last-picked user and role survive.
- [ ] 8.6 Admin → topbar live sync: with Admin perspective, create a new user `demo.tester` in group `educ` via the admin Users tab. Without reloading, open the topbar dropdown — `demo.tester @ educ` appears. Disable an existing user via the admin tab — that user disappears from the picker.
- [ ] 8.7 Mongo via MCP: `db.requests.find({_id: 'REQ-XXX'})` shows top-level `requesterGroupName == picked-user.group`, `meta.requesterGroupName == picked-user.group`, `requester.id == picked-username`, `requester.group == picked-user.group`, and `requester.role` reflecting the toggled role at submission time.
- [ ] 8.8 Camel E2E: once the request flips to `provisioning`, confirm `RequestRouterRoute` consumes the Debezium event and `HelmValuesBuilder.java` renders a HostedCluster named `hc-{group}-foo`. Check Camel logs or the manifest in `gdfkube-orgs/orgs/{group}/`.
- [ ] 8.9 Header hygiene (manual curl): `curl -H 'X-Demo-User: joao.silva' -H 'X-Demo-Role: bogus' http://localhost/api/itsm/users` falls back to the stored role (and returns 403). `curl -H 'X-Demo-User: joao.silva' -H 'X-Demo-Role: admin' http://localhost/api/itsm/users` returns 200.
- [ ] 8.10 Run `pre-commit run --all-files` and `openspec validate split-demo-user-and-role` before committing.
