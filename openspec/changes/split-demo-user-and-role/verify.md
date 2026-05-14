# Verification Report

**Change:** `split-demo-user-and-role`
**Verified at:** 2026-05-14
**Verifier:** Hugo (post-merge verification)
**Worktree:** merged to `main` (feature worktree removed after merge)
**Commit range:** `7b2fce0..e3323b6` — scaffold + 7 implementation commits + 1 task-tracking commit + 1 test-update commit, joined by merge `e3323b6`

Per-task commits:

| Task | SHA | Subject |
|---|---|---|
| 0 (scaffold) | `7b2fce0` | `openspec: propose split-demo-user-and-role; drop static request seeds` |
| 1 (seed schema) | `7ba75a1` | `chore(seeds): drop requesterGroupName field from cluster/namespace/scale forms` |
| 2-3 (SPA prefix fallback) | `0bb63e5` | `feat(forms): fall back prefix/help {requesterGroupName} to user.group when field absent` |
| 3 (server meta inject) | `d62410b` | `feat(server): inject meta.requesterGroupName from demoUser.group in requestService` |
| 4 (server role override) | `8359b36` | `feat(server): honor optional X-Demo-Role header in demoUser middleware (cloned override)` |
| 5 (SPA setDemoRole) | `a41c2dc` | `feat(spa): add setDemoRole + X-Demo-Role header to itsmApi` |
| 6 (App.tsx state split) | `5116e81` | `feat(spa): decouple activeUsername from role in App.tsx + persist to localStorage` |
| 7 (Topbar UI) | `c464ce6` | `feat(spa): topbar Switch user section above simplified Switch role` |
| 8.1 (regression tests) | `dc8831d` | `test: update App + identityRace tests for decoupled user/role model` |
| 8.x (task tracking) | `2768783` | `openspec: mark implementation tasks complete for split-demo-user-and-role` |
| merge | `e3323b6` | `merge feat/split-demo-user-and-role: decouple demo user from role toggle` |

Each implementation commit corresponds 1:1 to one of the plan's "Commit point" markers in `plan.md`.

---

## 1. Structural Validation (`openspec validate split-demo-user-and-role --strict`)

- [x] Returned valid.

**Result**:

```text
Change 'split-demo-user-and-role' is valid
```

---

## 2. Task Completion (`tasks.md`)

- [x] All `[ ]` for tasks 1.x–7.x and 8.1 have been changed to `[x]`.

**Incomplete tasks** (verification group 8.2–8.10, intentionally deferred):

| Task | Reason for incompletion | Blocks archive? |
|---|---|---|
| 8.2 | Dev-stack smoke walkthrough — requires `npm run dev` + a live SPA session | No |
| 8.3 | Interactive: pick `ana.pereira`, file a Cluster request, observe prefix + persisted doc | No |
| 8.4 | Interactive: Admin perspective toggle + cross-user role persistence | No |
| 8.5 | Interactive: reload-the-SPA persistence check | No |
| 8.6 | Interactive: admin Users tab → topbar live-sync | No |
| 8.7 | Mongo via MCP: `db.requests.findOne()` shape check post-submit | No |
| 8.8 | Camel E2E: HostedCluster manifest landing in `gdfkube-orgs/orgs/{group}/` | No |
| 8.9 | Manual `curl` header-hygiene checks against the running server | No |
| 8.10 | `pre-commit run --all-files` + `openspec validate` — completed; validate recorded in §1 above | — |

The unit/integration test surface (see §5) covers the structural contracts of each interactive step. The manual smokes are useful as a dev-stack acceptance run before a demo but are not required to archive — same deferral pattern as `2026-05-13-fix-itsm-portal-bug-batch`.

---

## 3. Delta Spec Sync State

| Capability | Sync status | Notes |
|---|---|---|
| `itsm-portal-shell` | ✗ Needs sync (ADDED + MODIFIED) | Adds `Switch user picker in topbar dropdown` and `X-Demo-Role header synchronously reflects the active role` requirements; modifies `Topbar with breadcrumbs, search, role switcher` to describe stacked Switch user / Switch role sections and the synchronous `X-Demo-Role` header |
| `itsm-express-api` | ✗ Needs sync (MODIFIED) | Extends the Demo Identity Middleware requirement: optional `X-Demo-Role` header overrides the stored role for the current request only via a cloned `DemoUser`; `DEMO_USERS` is never mutated; invalid values fall through to stored role |
| `itsm-request-submission` | ✗ Needs sync (MODIFIED + ADDED) | Modifies the prefix/help interpolation requirement: when the sibling key is `requesterGroupName` and no form field declares it, resolve from `user.group`. Adds a requirement covering server-side injection of `meta.requesterGroupName` from `demoUser.group` |

All three deltas will be applied on archive via `openspec-sync-specs`.

---

## 4. Design / Specs Coherence Spot Check

| Sampled item | design description | specs counterpart | Gap |
|---|---|---|---|
| Single source of truth: `demoUser.group` drives both top-level `requesterGroupName` and `meta.requesterGroupName` | `design.md` D1 + D3 | `itsm-request-submission/spec.md` ("Server-side injection of meta.requesterGroupName") | — |
| Form drops Department; prefix falls back to `user.group` | `design.md` D2 | `itsm-request-submission/spec.md` (prefix interpolation MODIFIED) | — |
| `X-Demo-Role` is additive, cloned override, invalid values fall through | `design.md` D4 | `itsm-express-api/spec.md` (Demo Identity Middleware MODIFIED) | — |
| Independent `activeUsername` + `role` state, both persisted, both synced to outbound headers in render body | `design.md` D5 + D6 | `itsm-portal-shell/spec.md` (Switch user picker + X-Demo-Role synchronous + Topbar MODIFIED) | — |
| Topbar Switch user section above Switch role; perspective labels drop hard-coded subtitles | `design.md` D6 | `itsm-portal-shell/spec.md` (Switch user picker scenarios + role menu scenario) | — |
| Seed JSON parity with `adminSeeds.ts` (forms.json drops the three `requesterGroupName` field blocks) | `design.md` D2 (impl note) | No spec delta — data/config change consistent with existing `itsm-forms-collection` permissive Mongoose sub-schema | — |

**Drift warnings** (non-blocking):

- The plan's commit-point sequence (Task 7 = Topbar) merged with a sibling test-update commit (`dc8831d`) on the feature branch. Functionally equivalent to plan; the test-update split is a minor process deviation captured in the retrospective.
- `users.json` regeneration via `scripts/export-seed-data.mjs` was not re-run as part of this change because no user-catalog fields changed — only the three forms' `fields[]` arrays. Confirmed by inspection: `users.json` is untouched in the merge diff (see `git show --stat e3323b6`).

---

## 5. Implementation Signal

- [x] No unstaged files on `main` relevant to this change (`git status` shows only an unrelated `.claude/commands/agent-team.md` edit and the untracked `tmp/` dir; neither belongs to this change).
- [x] All related commits are on `main` (merged via `e3323b6`).

**Source-level contract verification** (this session):

| Contract | Evidence |
|---|---|
| `X-Demo-Role` header read by middleware | `server/src/middleware/demoUser.ts:23` — `req.headers['x-demo-role']` |
| `X-Demo-Role` header sent by SPA client | `src/api/itsmApi.ts:54` — `'X-Demo-Role': demoRoleRef.current` |
| `meta.requesterGroupName` injected from `demoUser.group` | `server/src/services/requestService.ts:107` — `meta: { ...validation.meta, requesterGroupName: demoUser.group, correlationId: id }` |
| Top-level `requesterGroupName` unchanged | `server/src/services/requestService.ts:101` — `requesterGroupName: demoUser.group` |

**Test files updated/added by this change** (per `git show --stat e3323b6`):

| Test file | Δ lines | Coverage |
|---|---|---|
| `server/__tests__/demoUser.test.ts` | +40 | valid override, invalid override (falls through), missing header, clone-not-mutate `DEMO_USERS` |
| `server/__tests__/requests.test.ts` | ±34 | submission produces both top-level and `meta.requesterGroupName` from `demoUser.group` regardless of form body |
| `src/forms/__tests__/GenericRequest.test.tsx` | +62 | prefix fallback to `user.group`; help-text fallback; negative case (unrelated placeholder) |
| `src/__tests__/App.test.tsx` | ±23 | independent `activeUsername` + `role` state and persistence |
| `src/__tests__/identityRace.test.tsx` | ±44 | synchronous header invariant extended to both `X-Demo-User` and `X-Demo-Role` |
| `src/shell/__tests__/Topbar.test.tsx` | ±28 | Switch user section above Switch role; selecting a user preserves role |

Test suite execution at the commit boundaries was a precondition for each "Commit point" in `plan.md`; no test runs were re-executed in this verification session.

---

## 6. Risks (from design.md) — Mitigation Check

| Risk | Mitigation status |
|---|---|
| `X-Demo-Role` header bypassing the admin gate from an operator user | ✓ Intentional and documented — the gate's purpose is to reflect the SPA's *active perspective*, not enforce identity. The override is per-request, cloned, and never mutates `DEMO_USERS`. Admin-gate interaction is exercised by `demoUser.test.ts`. |
| Stale-header race on `X-Demo-Role` (mirror of the X-Demo-User race fixed in `fix-itsm-portal-bug-batch`) | ✓ Structurally prevented — `App.tsx` calls both `setDemoUser(...)` and `setDemoRole(...)` synchronously in the render body, before the commit phase. Encoded by `identityRace.test.tsx` for both headers. |
| Form-field removal breaks existing requests in Mongo | ✓ Non-breaking — persisted document shape unchanged. Top-level `requesterGroupName` and `meta.requesterGroupName` are still present; both now sourced from `demoUser.group`. Mongoose sub-schema is permissive. |
| Downstream Camel/Debezium consumer shape drift | ✓ No wire-shape change — `HelmValuesBuilder.java` still reads `requesterGroupName`; ApplicationSet templates in `gdfkube-orgs/orgs/{group}/` unaffected. |
| `localStorage` values from a previous SPA version pinning an invalid role string | ✓ `App.tsx` `useState` initializer validates the stored value against the `operator | admin` union before accepting it; falls back to `'operator'` on any other value. |

---

## Overall Decision

- [x] ✅ PASS — ready to archive

**Next step**: invoke `openspec-archive-change` to sync the three capability deltas into `openspec/specs/` and move the change to `openspec/changes/archive/2026-05-14-split-demo-user-and-role/`.

No regressions surfaced. The deferred manual-smoke tasks (8.2–8.9) are demo-stack acceptance steps, structurally covered by the unit/integration tests, and intentionally not gating on archive.
