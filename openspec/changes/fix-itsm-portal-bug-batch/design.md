## Context

The gdfkube ITSM portal is a React/TypeScript frontend backed by an Express server, with a Camel orchestrator that processes requests off Kafka, renders Helm values, and pushes generated manifests to Gitea. The current state has five regressions surfaced during dogfooding: pipeline UI stalls visually, environment radio dots collapse to 0×0, new request numbers are raw ULIDs, the Settings page is unreachable for the supposed admin user, and a debug-ingest fetch leaks request data to a hardcoded localhost endpoint.

The Settings bug exposes a deeper issue: the identity system has three sources of truth (`server/src/data/demoUsers.ts`, `src/shell/Bootstrap.tsx:FALLBACK_USERS`, `src/data/seeds.ts:buildRequester`), most of which are leftover from the original frontend-only mock (`/.tmp/handoff/gdfkube-remix/project/`) that predated the Express API. The role-switch UI exposes only `operator`/`admin` while the server schema still carries `approver`/`service` users that no UI surface activates.

Stakeholders: solo developer (Hugo). No external users yet; the demo runs in a devcontainer with `docker compose` providing Mongo, Kafka, Debezium, Camel, and Gitea.

## Goals / Non-Goals

**Goals:**
- Restore visible end-to-end pipeline progression in the Provisioning Pipeline card.
- Make environment radio dots visible again on the OpenShift Cluster Request form.
- Use human-readable `REQ` + 7-digit + form-type-letter ids for new requests, matching seed pattern.
- Make the Settings page reliably reachable for the Platform Admin role; eliminate the X-Demo-User race.
- Consolidate user identity to a single source of truth (`DEMO_USERS`).
- Remove the leftover debug-ingest fetch and any sibling artifacts.
- Amend `docs/`, `CLAUDE.md`, and OpenSpec specs/changes so the same drift cannot reappear.

**Non-Goals:**
- Implementing the ArgoCD pipeline stage (deferred to a future spec). Stage 6 remains "pending" indefinitely.
- Migrating existing ULID request rows to the new format.
- Introducing a real session/login API. The `X-Demo-User` header remains the identity wire.
- Adding `approver`/`service` role surfaces to the UI.
- Changing Kafka topic names, Mongo collection names, or Helm chart structure.

## Decisions

### D1. Camel routes emit intermediate stage writes; `StatusEmitterRoute` uses `$max`

Pipeline stage drift is fixed by having each Camel route call the existing `updateStageInMongo(requestId, N)` helper as it transitions:
- `RequestRouterRoute` writes `stage: 4` on first receipt.
- `RepoBootstrapRoute` (or `GitPushRoute` upon successful push) writes `stage: 5`.
- `StatusEmitterRoute` is changed from `$set: { stage }` to `$max: { stage }` so out-of-order events cannot decrement.

**Alternative considered**: derive stage from Kafka watermark events. Rejected — too much infrastructure for a demo; the current explicit-write pattern is the project's established style. `$max` adds a minimal safety net for ordering.

### D2. RadioCard dot rendered with inline styles, matching reference

`RadioCards.tsx:46-52` is changed to drop `className="dot"` and inline-style the span (`display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: opt.dotColor`). This matches the design reference (`/.tmp/handoff/gdfkube-remix/project/new-request.jsx:137-139`).

**Alternative considered**: add `.radio-card .rc-title .dot` rules to `styles.css`. Rejected — touching CSS for a one-off use case is more brittle than inline styles that already work elsewhere in the codebase.

### D3. Request id = REQ + 7-digit counter + form-type letter, generator-only

A helper `nextRequestNumber(formId)` queries `RequestModel.findOne({ _id: /^REQ\d{7}[CNSX]$/ }).sort({ _id: -1 })`, increments the digit segment, pads to 7, and appends `C` (cluster-request), `N` (namespace-request), `S` (scale-request), or `X` (unknown — also logs a warning). Concurrency: `RequestModel.create` is wrapped in a retry-on-duplicate-key loop (max 5 attempts).

Existing ULID rows in MongoDB are not migrated. The schema `_id: String` already accepts both formats; `findById` works against either.

**Alternative considered**: a separate `counters` collection with `findAndModify`. Rejected — over-engineered at current load; retry-on-duplicate-key is sufficient and matches the project's "modify before adding" preference.

### D4. Synchronous demo-user setter; single source of truth

The module-level resolver in `itsmApi.ts` is replaced with a ref:
```ts
const demoUserRef = { current: 'joao.silva' };
export function setDemoUser(username: string) { demoUserRef.current = username; }
```
`App.tsx` calls `setDemoUser(user.username ?? user.name)` synchronously in render (above the JSX return), eliminating the prior `useEffect` race.

`Bootstrap.tsx`'s `FALLBACK_USERS`/`FALLBACK_GROUPS` constants are removed. The existing `phase === 'error'` branch surfaces a hard error if `/api/itsm/users` or `/api/itsm/groups` fails. `seeds.ts:buildRequester` consults a small `KNOWN_ROLES` map (`{ 'maria.costa': 'admin', default: 'operator' }`). `App.tsx:FALLBACK_ADMIN`/`FALLBACK_OPERATOR` are removed because `data.users` is now guaranteed non-empty by Bootstrap.

`server/src/data/demoUsers.ts` is trimmed: `lucia.fernandes` (approver) and `platform.bot` (service) are removed. The `DemoUser['role']` union narrows to `'operator' | 'admin'`.

**Alternative considered**: full session/login endpoint. Rejected — overkill for a demo. User chose the consolidation path explicitly.

### D5. Remove the debug-ingest block; sweep for siblings

`server/src/services/requestService.ts:53-55` contains a `#region agent log` / `#endregion` block POSTing to `http://localhost:7430/ingest/60f88a58-2925-43f9-b28f-bcec8ca13914`. The block is deleted; `git grep -n "7430/ingest"` must return zero hits. `.cursor/debug-df73a6.log` (untracked) and `.cursor/rules/test-verification-logs.mdc` (untracked) are removed.

### D6. Amend reference docs

The `docs/00-13` files, `CLAUDE.md`, `openspec/specs/`, and archived `openspec/changes/` are swept for stale references that contributed to the drift: `FALLBACK_USERS`, `setDemoUserResolver`, `approver`/`service` users, ULID-shaped request id examples, over-stated ArgoCD readiness. Authoritative docs are fixed in place; archived OpenSpec change documents get a "Superseded by fix-itsm-portal-bug-batch (2026-05-13)" annotation rather than being rewritten.

## Risks / Trade-offs

- **Risk**: Two concurrent `submit()` calls race for the same `REQ` counter value.
  → Mitigation: retry-on-duplicate-key (up to 5 attempts). At demo scale this is effectively zero collisions.

- **Risk**: A Camel route writes stage 5 then fails silently before its real work completes, leaving the UI ahead of reality.
  → Mitigation: stage writes happen after the unit of work succeeds, not before. `$max` semantics prevent decrement on retry.

- **Risk**: Removing `FALLBACK_USERS` makes the app harder to start if the server is down.
  → Mitigation: the existing `phase === 'error'` UI already shows a Retry button. This is more honest than silently rendering with two hardcoded users.

- **Risk**: Trimming `DEMO_USERS` breaks tests that assert on the four-role enum.
  → Mitigation: tests are updated as part of this change (see proposal Tests section). The role union narrows to two values; affected assertions become simpler.

- **Risk**: New request id format breaks downstream assumptions.
  → Mitigation: downstream audit (in plan file) confirmed no length-26 assumptions, k8s label length is safe (11 chars vs 63-char limit), file paths and Kafka keys are format-agnostic. Two test assertions need updating; this change does so.

- **Trade-off**: ArgoCD stage 6 stays animated "pending" in the UI until the ArgoCD capability lands. Users see a not-fully-done pipeline indicator on ready requests.
  → Acceptable: the user explicitly scoped ArgoCD out; this matches the actual implementation state and avoids fake-readiness.

## Migration Plan

1. Land the change (commit + push).
2. No data migration required — existing ULID `_id` rows continue to work. New rows are REQ-pattern.
3. Devcontainer users restart their `docker compose` stack to pick up Camel route changes (the Java services rebuild on container restart).
4. No Kafka consumer-group rebalancing concerns — topic schemas and consumer groups are unchanged.
5. Rollback: revert the commit. Existing REQ-pattern rows remain valid (the old generator would not produce them but the old code is happy to read them).

## Open Questions

- _(none for current scope)_. Future scope (handled in subsequent specs): when ArgoCD lands, decide whether stage 6 is written by an ApplicationSet hook or polled from the Argo API.
