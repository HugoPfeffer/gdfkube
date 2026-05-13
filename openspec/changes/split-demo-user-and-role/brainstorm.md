## Design Summary

The OpenShift Cluster / Namespace / Scale request forms expose a **Department / Organization** field that suggests the operator can choose which group a request is filed against. In reality `requestService.ts` overwrites the top-level `requesterGroupName` with `demoUser.group` from the `X-Demo-User` header — only the `meta.requesterGroupName` copy survives, and that path exists by accident (the validator buckets unknown form fields into `meta`). The form is half-wired and the contract is fragile.

In parallel, the topbar **Switch Role** menu conflates *role* with *user identity*: picking "Operator" pins `joao.silva@saude`, picking "Platform Admin" pins `m.costa@setic`. The demo can therefore neither (a) operate as any other user, (b) view the same user from an admin perspective, nor (c) drive requests carrying arbitrary user metadata into Camel / Kafka.

The agreed direction: make the active demo user the single source of truth for `requesterGroupName`, split user-identity from role in the topbar, and introduce an `X-Demo-Role` override so the toggle can apply to any user.

## Alternatives Considered

### Option A: Keep the form field, fix the server overwrite (rejected)
- **Approach**: Leave the Department/Organization select on every form, but stop `requestService.ts` from overwriting `requesterGroupName`. Trust the operator to pick the right group.
- **Pros**: Smallest UI diff. Lets one operator file on behalf of any group without changing identity.
- **Cons**: Breaks the existing demo narrative ("file as the user you are"). Splits identity from the request: `requester.group` would no longer match `requesterGroupName`. Downstream (`HostedCluster` naming, `gdfkube-orgs/orgs/{group}` repo selection) drifts from the user's actual group.
- **Why not chosen**: Violates the "demo as the active user" model and removes the implicit org isolation the demo relies on.

### Option B: Drop the form field, derive group from the active user (chosen)
- **Approach**: Remove the field from all three forms; have the prefix interpolator fall back to `user.group`; have the server inject `meta.requesterGroupName: demoUser.group`. Couple this with a topbar **Switch user** picker (above) and a clean **Switch role** toggle (below) wired through a new `X-Demo-Role` header.
- **Pros**: Form schema matches reality (one canonical source). Identity flows cleanly into the request: `requester.id`, `requester.group`, `requesterGroupName`, `meta.requesterGroupName`, and the Helm-rendered `hc-{group}-{name}` are all derived from one place. Role becomes a pure view-switch and works for any registered user.
- **Cons**: Slightly larger diff (touches forms seed data, server middleware, App.tsx, Topbar.tsx). New `X-Demo-Role` header is one more demo-only contract to remember.
- **Why not chosen**: This *is* the chosen option.

### Option C: Real auth (rejected as out of scope)
- **Approach**: Replace the demo-user header with a real session, real RBAC, real org-scoped permissions.
- **Pros**: Honest authorization story; eliminates the X-Demo-User / X-Demo-Role contract entirely.
- **Cons**: Massive scope; not required for the demo; not requested.
- **Why not chosen**: The role toggle is demo-only by design (per the plan's "Out of scope").

## Agreed Approach

Option B. The user already directed this approach in the plan. Concrete decisions baked in:

1. **Form schema**: drop the `requesterGroupName` field from `cluster-request`, `namespace-request`, `scale-request` in `adminSeeds.ts` and `gdfkube-infra/mongodb/seed-data/forms.json`. Decrement `fieldCount` accordingly. Keep the `clusterName` field's `prefix: 'hc-{requesterGroupName}-'`.
2. **Prefix interpolator**: extend `GenericRequest.tsx`'s sibling resolver so that when `{requesterGroupName}` has no corresponding form field, it falls back to `user.group`.
3. **Server injection**: `requestService.ts` adds `meta.requesterGroupName: demoUser.group` next to `correlationId`. Top-level `requesterGroupName: demoUser.group` (already there) is untouched.
4. **`X-Demo-Role` header**: SPA `itsmApi.ts` adds a module-scoped `demoRoleRef` + `setDemoRole(role)` and includes the header on every request. Default `'admin'` (same Bootstrap reasoning as `setDemoUser`'s pre-mount admin fetches).
5. **Server honor**: `middleware/demoUser.ts` reads `x-demo-role`; if it is `'operator' | 'admin'`, attach a **cloned** `DemoUser` with `.role` overridden — never mutate `DEMO_USERS`. Invalid values fall through to the stored role.
6. **App.tsx**: split state — `[activeUsername, setActiveUsername]` and `[role, setRole]`, each seeded from and persisted to `localStorage` (`gdfkube.demoUser`, `gdfkube.demoRole`). Compute `user` from `data.users` keyed on `activeUsername`. Synchronously call `setDemoUser(user.username)` and `setDemoRole(role)` in the render body (the synchronous-header invariant from CLAUDE.md). Route-guard `useEffect` stays untouched.
7. **Topbar.tsx**: new **Switch user** section above **Switch role**. Sources `users` from `data.users` (= `DataContext`, same source the admin Users tab writes), so admin edits live-sync to the picker. Filter out `status === 'disabled'` / `active === false` entries. Selecting a user calls `setUser(u.username)`. Role buttons become "Operator perspective" / "Admin perspective" with no user-pin subtitles.
8. **Tests**: extend the existing `GenericRequest.test.tsx` prefix-interpolation suite to cover the new fallback path (sibling field absent → `user.group`).

## Key Decisions

- **Single source of truth for group**: `demoUser.group` from `DEMO_USERS` (server) → `data.users` (SPA). The form no longer carries it.
- **Role override semantics**: `X-Demo-Role` is treated as an authoritative override for the *request*, not a persistent change to the user record. Cloned `DemoUser`, never mutate `DEMO_USERS`.
- **Default role for Bootstrap**: `'admin'` (mirrors the existing `setDemoUser` Bootstrap reasoning — admin-gated endpoints must succeed before App mounts).
- **Persisted `requester.role`**: `requestService.ts:98` already writes `req.demoUser.role` into the doc; with the cloned override, the persisted role reflects the toggled value at submission time. This is the intended behavior.
- **Disabled users hidden from picker**: the admin Users tab can `status: 'disabled'` a user; the topbar picker filters those out (we don't demo "as" a disabled user) but does not delete them from `DEMO_USERS`.
- **Topbar `users` source**: `DataContext` (= same source as admin Users tab) — guarantees admin → topbar live sync without a page reload.
- **Header hygiene**: invalid `X-Demo-Role` values fall back to the stored role, so a bogus header cannot crash the server or silently elevate.
- **Out of scope**: `env` vs `vars.environment` duplication is intentional (canonical top-level + template-render copy). Real RBAC is out. Camel `RequestEvent` shape is unchanged.

## Open Questions

- None. The plan is sufficiently specific and the user directed proceeding without clarifying questions.
