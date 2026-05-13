## Why

Five regressions in the gdfkube ITSM portal degrade the end-to-end demo: the Provisioning Pipeline UI stalls at stage 1 even when Gitea repos are actually being created, environment radio dots render invisibly on the OpenShift Cluster Request form, new requests get raw ULIDs instead of the human-readable `REQ`-pattern, the Settings page returns Forbidden for Platform Admin due to a render-order race in the `X-Demo-User` header, and `requestService.ts` still POSTs to a hardcoded debug-ingest endpoint on validation failure. Bug #4 also exposes three inconsistent sources of truth for user identity (server `DEMO_USERS`, frontend `FALLBACK_USERS`, `seeds.ts:buildRequester`) — leftover from the design-reference mock — that need consolidating before the same drift reappears.

## What Changes

**Provisioning pipeline stage progression**
- From: Stage is written only on submission (0), approval (1), and after git-push completes (5). Intermediate Camel work is invisible to the UI.
- To: Camel routes emit intermediate stage writes — stage 4 when `RequestRouterRoute` begins, stage 5 when `RepoBootstrapRoute` finishes. `StatusEmitterRoute` uses `$max` instead of `$set` to prevent regression. ArgoCD stage (6) is intentionally left unwritten until that capability exists.
- Reason: Restore visual fidelity between UI and pipeline state.
- Impact: Non-breaking; only adds writes.

**Environment radio dot rendering**
- From: `RadioCards.tsx` renders the colored dot via `<span className="dot" …>` but `.radio-card .dot` has no CSS rule, so dots collapse to 0×0.
- To: Inline-style the dot (8×8 circle, `borderRadius: 50%`) matching the reference design.
- Reason: Visible env color coding on cluster requests.
- Impact: Non-breaking; CSS-only behavior change.

**Request number format**
- From: `const id = ulid()` produces `01KRGTK49HDQSFZ2ZSPCQB44S3`; seeded data uses `REQ0010249`.
- To: Generator produces `REQ` + 7-digit sequential counter + 1-letter form-type code (`C`/`N`/`S`); fallback `X` with a server warning for unknown form ids. Retry on duplicate-key. Existing ULID rows remain. Seed fixtures get the `C` suffix appended.
- Reason: Match the user-confirmed seeded pattern; readable for human operators.
- Impact: Non-breaking for downstream (verified: k8s label length, file paths, Kafka keys all safe). Two test assertions update; e2e regex already compatible.

**Demo-user identity (single source of truth + race fix)**
- From: `setDemoUserResolver` getter updated in a `useEffect` runs after children's effects, producing a stale `X-Demo-User` header on role flip → 403 Forbidden on Settings. Three sources of truth: server `DEMO_USERS` (8 users, 4 roles), frontend `FALLBACK_USERS` (2 users), `seeds.ts:buildRequester` (hardcodes `role: 'operator'` even for `maria.costa`).
- To: Synchronous `setDemoUser(username)` ref-based setter called in render. `DEMO_USERS` is the single source of truth and is trimmed to `operator | admin` (drop `lucia.fernandes` approver and `platform.bot` service — unreachable from the UI). `FALLBACK_USERS` removed; Bootstrap fails hard via existing error UI if `/api/itsm/users` fails. `seeds.ts:buildRequester` honors real roles via a small `KNOWN_ROLES` map.
- Reason: Eliminate the race; remove dead code; prevent re-drift.
- Impact: Non-breaking for the demo flow. Tests for `demoUser` middleware narrowed.

**Removal of leftover debug-ingest block**
- From: `requestService.ts:53-55` POSTs to `http://localhost:7430/ingest/<uuid>` on validation failure, leaking request data.
- To: Block deleted; `.cursor/debug-df73a6.log` and any other ingest leftovers cleaned up.
- Reason: Security/hygiene.
- Impact: Non-breaking.

**Reference docs amendment**
- `docs/00`–`13-*.md`, `CLAUDE.md`, archived OpenSpec specs/changes, and `.tmp/REPORT-ISSUES.md` swept for stale references to `FALLBACK_USERS`, `setDemoUserResolver`, `approver`/`service` roles, ULID-shaped request id examples, and over-stated ArgoCD readiness. Fixed in place where they are authoritative; annotated "Superseded" where they are historical.

## Capabilities

### New Capabilities

- _(none — all changes affect existing capabilities)_

### Modified Capabilities

- `itsm-request-detail`: Pipeline stage requirements clarified — stage advances through intermediate Camel writes; stage updates are monotonic (`$max`); ArgoCD stage explicitly out of scope until that spec lands.
- `itsm-service-catalog`: Environment radio cards must render a visible colored dot per option (8×8, inline-styled), matching the reference design.
- `itsm-request-submission`: New requests get id format `REQ\d{7}[CNSX]` (form-type letter derived from `formId`); generator is collision-retry-safe.
- `itsm-requests-collection`: Stored `_id` may be either legacy ULID (existing rows) or `REQ`-pattern (new rows); schema accepts both as plain strings.
- `itsm-express-api`: `X-Demo-User` is the canonical identity header; valid usernames are exactly the keys of `DEMO_USERS`; role union is `operator | admin`. `requireAdmin` middleware unchanged. Settings GET/PATCH gating unchanged.
- `itsm-admin-users` & `itsm-users-collection`: Role enum narrowed to `operator | admin`; `approver`/`service` removed.
- `itsm-portal-shell`: Demo-user identity is held in a synchronously-updated module-level ref, not a `useEffect`-driven resolver. `Bootstrap.tsx` surfaces a hard error if user/group fetch fails (no silent fallback).

## Impact

**Affected code paths**
- Server: `server/src/services/requestService.ts` (id generation + remove debug block), `server/src/data/demoUsers.ts` (trim roles).
- Frontend: `src/api/itsmApi.ts` (synchronous setter), `src/App.tsx` (drop fallbacks + useEffect), `src/shell/Bootstrap.tsx` (drop FALLBACK arrays), `src/data/seeds.ts` (REQ-suffix on fixtures + real roles in `buildRequester`), `src/forms/RadioCards.tsx` (inline-style dot).
- Camel: `gdfkube-camel/.../routes/RepoBootstrapRoute.java`, `RequestRouterRoute.java`, `StatusEmitterRoute.java` (intermediate stage writes + `$max`).

**Affected APIs**
- `POST /api/itsm/requests` — returns new id format.
- `GET /api/itsm/settings` & `PATCH /api/itsm/settings` — unchanged behavior, now reliably reachable for admin.
- `X-Demo-User` header — only `operator`/`admin` users honored after `DEMO_USERS` trim.

**Affected Kafka topics / Mongo collections**
- `requests` collection in Mongo: `_id` accepts both ULID and REQ-pattern; `stage` field updated via `$max`.
- No Kafka topic changes.

**Tests**
- Update: `server/__tests__/requests.test.ts:165` (regex), `gdfkube-camel/.../HelmValuesBuilderTest.java:78,112` (fixture), `server/__tests__/demoUser.test.ts` (drop approver/service assertions).
- Add: race-regression test (role-flip causes next API call to carry admin header), id-generation collision-retry test, `$max` monotonic-stage test.

**Dependencies**: None added.

**Risk**: Low. Downstream-impact audit confirmed no length/regex assumptions broken by the id-format change.
