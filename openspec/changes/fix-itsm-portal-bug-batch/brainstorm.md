## Design Summary

Five regressions in the gdfkube ITSM portal need targeted fixes: (1) Provisioning Pipeline UI stuck at stage 1 despite downstream Camel/Gitea progress, (2) invisible environment radio dots on the OpenShift Cluster Request form, (3) new request numbers appearing as raw ULIDs instead of the seeded `REQ`-pattern, (4) Settings page returning Forbidden for Platform Admin due to a render-order race in the `X-Demo-User` header (compounded by three inconsistent user sources of truth), and (5) a leftover debug-ingest fetch in `requestService.ts` that leaks request data to a hardcoded localhost endpoint.

The agreed approach is minimum-surface fixes that follow the existing helpers (`updateStageInMongo`, `pickUser`), consolidate identity to one source (`server/src/data/demoUsers.ts`), and amend reference docs to prevent the same drift from recurring. ArgoCD stage progression is explicitly out of scope (future spec).

## Alternatives Considered

### Bug #1 — Pipeline stage drift

#### Option A: Emit intermediate stage writes from existing Camel routes
- **Approach**: Add `updateStageInMongo(requestId, N)` calls from `RequestRouterRoute` (stage 4) and `RepoBootstrapRoute` (stage 5). Change `StatusEmitterRoute`'s `$set` to `$max` so out-of-order events cannot regress the stage.
- **Pros**: Reuses the existing helper, minimal new code, ArgoCD stage left untouched (it stays "pending" until that capability lands).
- **Cons**: Each route now has a side-effect on Mongo; if a route fails after the write but before completing its real work, the UI may show a slightly-ahead state momentarily.

#### Option B: Drive stage progression from Debezium / Kafka watermark events
- **Approach**: Listen to Kafka topic offsets / Debezium ack events and derive the stage from observed message flow rather than explicit writes.
- **Pros**: Truly decoupled, fewer places mutate Mongo.
- **Cons**: Significantly more infra wiring, harder to test, doesn't fit the demo's existing pattern.
- **Why not chosen**: Overkill for a demo; Option A reuses existing helpers and matches the project's "modify before adding" preference.

### Bug #3 — Request number format

#### Option A: Sequential REQ + 7-digit counter + form-type letter, generator-only migration
- **Approach**: Replace `const id = ulid()` with a generator that reads the highest existing `REQ`-prefixed id, increments, zero-pads, and appends `C`/`N`/`S` based on `formId`. Keep existing ULID rows as-is. Retry on duplicate-key.
- **Pros**: Matches the user-confirmed format. Existing rows readable; only generator and a handful of test assertions change. Downstream audit confirmed safe (k8s label length OK, filesystem-safe, no length-26 assumptions).
- **Cons**: Two concurrent submissions could collide; needs retry-on-duplicate-key logic.

#### Option B: Counter held in a separate Mongo collection (atomic findAndModify)
- **Approach**: Maintain a `counters` collection with an atomic increment per form-type.
- **Pros**: Race-free without retry logic.
- **Cons**: Adds a collection and a write per submission; over-engineered for current load.
- **Why not chosen**: The plan's retry-on-duplicate-key approach is simpler and adequate at demo scale.

### Bug #4 — Settings Forbidden + demo-user hardening

#### Option A: Synchronous setter + single source of truth (chosen)
- **Approach**: Replace `setDemoUserResolver` getter with `setDemoUser(username)` writing a module-level ref; call it synchronously in `App.tsx` render. Drop `FALLBACK_USERS` in `Bootstrap.tsx` (fail hard via the existing error UI). Update `seeds.ts:buildRequester` to honor real roles via a small `KNOWN_ROLES` map. Trim `DEMO_USERS` to `operator | admin` (removing the unreachable `approver`/`service` users).
- **Pros**: Eliminates the race deterministically. Collapses three inconsistent user sources to one. Removes dead code for unreachable roles.
- **Cons**: Touches more files than a race-only fix; tests for `demoUser` middleware need narrowing.

#### Option B: Race-fix only
- **Approach**: Just move the resolver-update out of `useEffect`.
- **Pros**: Smallest diff.
- **Cons**: Leaves three sources of truth and unreachable roles in place; the same drift will recur.
- **Why not chosen**: User explicitly chose the full consolidation path.

#### Option C: Real session/login endpoint
- **Approach**: Replace `X-Demo-User` with `/api/auth/session`, persist role to localStorage, add login UX.
- **Pros**: Closer to production design.
- **Cons**: Major refactor for a demo. User declined.

## Agreed Approach

- **Bug #1**: Option A (intermediate stage writes via existing `updateStageInMongo`, `$max` in `StatusEmitterRoute`, no ArgoCD write).
- **Bug #2**: Replace `className="dot"` in `RadioCards.tsx` with the reference design's inline-style approach (8×8 circle).
- **Bug #3**: Option A (REQ + 7 digits + form-type letter, generator-only, retry-on-duplicate-key, existing ULID rows untouched).
- **Bug #4**: Option A (synchronous setter + single source of truth + role trim + doc amendments).
- **Bug #5**: Delete the `#region agent log` block in `requestService.ts:53-55` and `.cursor/debug-df73a6.log`; audit for any other ingest leftovers.

## Key Decisions

- ArgoCD stage progression is out of scope; stage 6 stays "pending" until the ArgoCD capability lands.
- The new request-id format includes a form-type letter (`C`/`N`/`S`); fallback `X` for unknown form ids with a server log warning.
- Existing ULID `_id` rows are not migrated — generator-only change.
- `DEMO_USERS` is trimmed to `operator | admin`; the `approver`/`service` users (`lucia.fernandes`, `platform.bot`) are removed.
- `Bootstrap.tsx` no longer silently falls back when `/api/itsm/users` fails — it shows the existing hard-error UI with a Retry button.
- `docs/` and `openspec/` reference material must be amended so the same drift cannot reappear; superseded sections in archived OpenSpec changes are annotated rather than rewritten.

## Open Questions

- None for the immediate scope. Future questions (deferred): when ArgoCD stage is implemented, decide whether to add a stage-6 writer or compute completion from ApplicationSet status; whether to introduce a `counters` collection for request-id generation if demo load increases.
