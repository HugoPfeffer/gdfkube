## Context

The ITSM demo identifies the active operator via a synchronous `X-Demo-User` header (single source of truth: `server/src/data/demoUsers.ts`, per CLAUDE.md). Today the topbar's role toggle conflates role with identity: picking "Operator" pins `joao.silva@saude` and picking "Platform Admin" pins `m.costa@setic`. Simultaneously, the three request forms (`cluster-request`, `namespace-request`, `scale-request`) carry a Department/Organization select field that suggests the requester can pick their group — but `requestService.ts:101` overwrites the top-level `requesterGroupName` with `demoUser.group`. The form's value only reaches downstream templates because the validator buckets unknown form fields into `meta.requesterGroupName`, which happens to be what `defaultTemplates.ts` and `seed-data/forms.json` read.

The user wants the demo to (a) operate as any registered user, (b) view the same user from an admin perspective, and (c) carry that user's identity into every downstream consumer (MongoDB, Debezium, Kafka, Camel, ArgoCD) without ambiguity. The constraints from CLAUDE.md are firm: `DEMO_USERS` is the single source of truth for identity; the role enum is exactly `operator | admin`; `X-Demo-User` is the only identity wire; `setDemoUser` must be synchronous; no SPA fallback arrays.

## Goals / Non-Goals

**Goals:**
- Make the active demo user the single source of truth for `requesterGroupName` end-to-end.
- Split user identity from role in the topbar so any registered user can be demoed at any perspective.
- Introduce an additive `X-Demo-Role` header that the server honors as a per-request override, without mutating `DEMO_USERS`.
- Preserve the synchronous-header invariant — no API call may carry stale identity or role.
- Live-sync the topbar user picker with admin-tab edits (no page reload required).
- Persist last-picked user and role across reloads via `localStorage`.

**Non-Goals:**
- Real authentication or RBAC. The role toggle is demo-only by design.
- Changing the `RequestEvent` shape consumed by Camel.
- Touching the `env` vs `vars.environment` duplication — after investigation, both are intentional (canonical top-level + template-render copy carrying the same value).
- Changing the Mongo index on `requesterGroupName` (`seed-collections.js:84`) — the field is still persisted from the server side.
- Removing the `gdfkube-infra/mongodb/seed-data/requests.json` file (already deleted in the working tree per `git status`).

## Decisions

### D1. Form schema: drop the Department field; server injects `meta.requesterGroupName`

The field is removed from `adminSeeds.ts` and `gdfkube-infra/mongodb/seed-data/forms.json` for all three forms. `requestService.ts` injects `meta.requesterGroupName: demoUser.group` next to `correlationId`. Existing templates continue to render correctly.

**Alternatives considered:**
- *Keep the field, stop the server overwrite*: lets one operator file on behalf of any group, but breaks the "demo as the active user" model and decouples `requester.group` from `requesterGroupName`. Rejected.
- *Drop the field, derive `requesterGroupName` purely on the client at submit time*: the SPA already does this for the top-level field via the post-submit reshape (`GenericRequest.tsx:170-174`); however, `meta.requesterGroupName` is only set today because the validator buckets unknown fields into `meta`. Once the form field is gone, that accidental path disappears too. Explicit server injection is more legible and survives any future form-validator changes.

**Trade-off**: a small server diff in exchange for an explicit contract.

### D2. `X-Demo-Role` as an additive override header

Header is read in `middleware/demoUser.ts` after `DEMO_USERS[username]` is matched. If the value is `'operator' | 'admin'`, a *cloned* `DemoUser` is attached to `req.demoUser` with `.role` overridden. `DEMO_USERS` itself is never mutated. Invalid or missing values fall through to the stored role.

**Alternatives considered:**
- *Encode role in `X-Demo-User`* (e.g. `joao.silva:admin`): violates CLAUDE.md's "`X-Demo-User` is the only identity wire" by changing its grammar. Rejected.
- *Store the override in MongoDB on the user record*: turns a view-toggle into a destructive admin write, breaks the "demo as the same user from a different perspective" goal, and mutates the source of truth. Rejected.
- *Server-only: derive role from a query parameter on individual endpoints*: leaks demo concerns into route handlers and breaks the `requireAdmin` middleware uniformity. Rejected.

**Trade-off**: one additional header to remember. Acceptable — it's symmetric with `X-Demo-User` and only honored when valid.

### D3. SPA state: independent `activeUsername` and `role`, both persisted to `localStorage`

`App.tsx` holds two pieces of state. `user` is derived from `data.users.find(u => u.username === activeUsername)`. Both `setDemoUser(user.username)` and `setDemoRole(role)` are called in the render body — *synchronously* — to preserve the existing invariant (documented in App.tsx:68-73) that no API call may carry stale headers.

**Alternatives considered:**
- *Single combined state object `{ username, role }`*: works, but two independent `useState` calls are clearer and the persistence keys map 1:1 to localStorage.
- *Persist via `useEffect` that runs once on mount*: violates the synchronous-header invariant. Rejected.
- *Route the role change through a server endpoint*: turns a UI toggle into network chatter; the override header already handles per-request semantics. Rejected.

**Trade-off**: the synchronous render-body side effect is unusual but matches the existing pattern in App.tsx; the comment block at lines 68-73 already documents the reasoning.

### D4. Topbar `users` sourced from `DataContext` (= admin Users tab)

`Topbar.tsx` accepts `users: User[]` from `App.tsx`, which passes `data.users` from `useGdfData()`. This is the same context the admin Users tab writes via `useGdfDispatch()`. Result: creating, editing, or disabling a user in the admin tab live-syncs to the topbar dropdown without a page reload.

Filter: users with `status === 'disabled'` (or `active === false`) are hidden from the picker. They remain in `DEMO_USERS` and continue to be rejected at the middleware layer.

**Alternatives considered:**
- *Fetch the user list separately in Topbar*: duplicates fetch logic and creates a refresh window where admin edits don't appear. Rejected.
- *Show disabled users with a "disabled" label*: clutters the demo UI; "demo as a disabled user" isn't a useful state. Rejected.

### D5. Bootstrap default role: `'admin'`

`demoRoleRef.current` defaults to `'admin'` (mirroring the existing `demoUserRef` default to a known admin). Admin-gated bootstrap fetches (`/api/itsm/users`, `/api/itsm/groups`) must succeed before App mounts; if the default were `'operator'`, an admin-stored user would hit a 403 on `/api/itsm/users` during Bootstrap.

The localStorage-seeded value overrides this default during the same render via the synchronous `setDemoRole(role)` call in App.tsx's render body.

### D6. Prefix interpolator fallback to `user.group`

`GenericRequest.tsx`'s sibling resolver gains one branch: when the placeholder is `{requesterGroupName}` and no form field with that key exists in `fields`, return `user.group`. Other placeholder behavior is unchanged. The existing post-submit reshape (`requesterGroupName: doc.requesterGroupName || values.requesterGroupName || user.group || ''`) already tolerates a missing form value.

**Why this is a fallback, not a replacement**: existing tests (`GenericRequest.test.tsx:215`) feed a mock form definition with a `requesterGroupName` field; they continue to pass because the sibling field is present. New test path: same suite, sibling field absent → resolves to `user.group`.

## Sequence: filing a request as a non-saude user with role override

```
operator           SPA (App.tsx)        SPA (api/itsmApi.ts)    Express (demoUser.ts)    Express (requestService.ts)    MongoDB
  |                    |                       |                         |                            |                      |
  |-- pick ana.pereira-->|                     |                         |                            |                      |
  |                    |--setDemoUser('ana')   |                         |                            |                      |
  |                    |--setDemoRole('admin')-|                         |                            |                      |
  |                    |  (synchronous, in render body)                  |                            |                      |
  |-- click submit ----->|                     |                         |                            |                      |
  |                    |--POST /requests------>|                         |                            |                      |
  |                    |    body: {..., no requesterGroupName field}     |                            |                      |
  |                    |    headers: X-Demo-User: ana.pereira            |                            |                      |
  |                    |             X-Demo-Role: admin                  |                            |                      |
  |                    |                       |---attach req.demoUser-->|                            |                      |
  |                    |                       |     DEMO_USERS[ana.pereira] cloned                   |                      |
  |                    |                       |     .role overridden to 'admin' from header         |                      |
  |                    |                       |                         |---persist request--------->|                      |
  |                    |                       |                         |     top-level requesterGroupName: 'educ'         |
  |                    |                       |                         |     meta.requesterGroupName: 'educ' (injected)    |
  |                    |                       |                         |     requester.id: 'ana.pereira', .group: 'educ',  |
  |                    |                       |                         |     .role: 'admin' (from override)               |
  |                    |                       |                         |                            |---insertOne--------->|
  |                    |                       |                         |                            |                      |
  |<-- toast + nav -----|<-- 201 created ------|<------------------------|<---------------------------|<---------------------|
```

Downstream: Debezium publishes `gdfkube.gdfkube.requests` with the same shape; Camel `RequestRouterRoute` reads `requesterGroupName: 'educ'`; `HelmValuesBuilder.java` renders `hc-educ-{clusterName}`; ArgoCD ApplicationSet pushes to `gdfkube-orgs/orgs/educ/`.

## Risks / Trade-offs

- **[Risk]** A future spec author may declare a `requesterGroupName` form field thinking it controls the value, only to be silently overridden by the server. → **Mitigation**: the proposed new requirement in `itsm-request-submission` ("Server injects meta.requesterGroupName from demo user") makes the contract explicit; reviewers can catch a redundant form field. Adding an admin-side warning is out of scope.
- **[Risk]** `X-Demo-Role` is forgeable in a real environment. → **Mitigation**: this is demo-only and explicitly out of scope for real auth. The README / docs should call out that *both* `X-Demo-User` and `X-Demo-Role` are dev-only headers.
- **[Risk]** Synchronous side effects (`setDemoUser`, `setDemoRole`) inside a render body can re-run on every render, masking accidental state churn. → **Mitigation**: the existing comment block in App.tsx:68-73 already documents the invariant; the new code follows the same pattern. We rely on `useGdfData`'s memoization to keep `user.username` stable.
- **[Risk]** Live-syncing the topbar `users` list with the admin Users tab could show a half-created user mid-edit. → **Mitigation**: the admin tab commits via PATCH/POST; `DataContext` updates only after the response, so partial state is not observable to the topbar.
- **[Risk]** Disabled users hidden from the picker still exist in `DEMO_USERS`; if the active user is disabled mid-session, the picker can't be used to pick them again. → **Mitigation**: middleware still rejects disabled users at the wire; this is consistent with current behavior and the demo doesn't disable the currently-active user.
- **[Trade-off]** The persisted `requester.role` on past requests was always `'operator'` or `'admin'` based on the stored role. After this change it reflects the *toggled* role at submission time. This is intentional (user-directed) and matches the new "what perspective am I filing as" semantics. Historical data is unaffected.

## Migration Plan

This is a SPA + Express change with no destructive DB or topic migrations. Rollout order:

1. **Seed data first**: update `adminSeeds.ts` and `gdfkube-infra/mongodb/seed-data/forms.json` to drop the `requesterGroupName` field; run `scripts/export-seed-data.mjs` to regenerate any derived copies. Existing Mongo `forms` documents still containing the field are tolerated by Mongoose (sub-schema is permissive) — but for cleanliness, the next container restart with `seed-collections.js` will overwrite from the new JSON.
2. **Server**: ship `middleware/demoUser.ts` (X-Demo-Role honoring) and `requestService.ts` (meta injection) together. Missing `X-Demo-Role` header preserves current behavior, so deploying server before SPA is safe.
3. **SPA**: ship `itsmApi.ts` (header), `App.tsx` (state split), `Topbar.tsx` (user picker), `GenericRequest.tsx` (prefix fallback) together.
4. **Verify**: run the verification steps from the plan — SPA happy path, role override, Mongo via MCP, Camel E2E, persistence, admin → topbar live sync, header hygiene curl.

**Rollback**: revert the SPA + server commits. No DB migration to undo. `localStorage` entries `gdfkube.demoUser` / `gdfkube.demoRole` become orphaned but harmless on rollback (the old App.tsx ignores them).

**Mongo schema**: no schema migration. The index on `requesterGroupName` (`seed-collections.js:84`) stays. Existing documents are forward-compatible.

**Kafka**: no topic, partition, or consumer-group changes. `RequestEvent` shape is unchanged. No rebalancing concerns.

**Helm**: no values change. `HelmValuesBuilder` reads `requesterGroupName` from the same field name.

## Open Questions

None. The plan and brainstorming converged on a single approach and the user requested non-interactive execution.
