## Design Summary

Add a working Settings page to the ITSM portal that replaces the dead "Preferences" placeholder in the topbar user dropdown. The page lets an admin configure the single, global Gitea instance the platform uses — endpoint URL, owner, and Personal Access Token — stored as a MongoDB singleton document (`_id: 'gitea'` in `gitea_settings`). The backend exposes `GET` and `PATCH /api/itsm/settings` (admin-only), with the token redacted in responses unless `?reveal=1` is passed. Seeding uses `$setOnInsert` (not `replaceOne`) so re-seeds never overwrite admin-edited values.

Scope is intentionally narrow: one Gitea instance, system-wide, PAT auth only. The actual Gitea container and the Camel/ArgoCD wiring to consume this config are separate future changes. This proposal only delivers the config surface (UI + collection + API + seed).

## Alternatives Considered

### Option A: Extend the existing Helm values as the single source of truth

- **Approach**: Keep Gitea config in `gdfkube-infra/charts/cluster-request/values.yaml` and add a PAT field there. No new collection, no new page. Camel reads from Helm values at startup.
- **Pros**: Zero new code. Config stays in one place.
- **Cons**: No runtime re-configuration — changing the Gitea target requires a Helm value edit + full redeploy. No PAT exists in Helm values today (only URL/owner). No admin-facing UI for the config. Doesn't resolve the dead "Preferences" placeholder.
- **Why not chosen**: The platform needs a runtime knob; Helm values are deploy-time only. The dead topbar item needs to be wired to something useful.

### Option B: Multi-tenant settings with per-org Gitea config

- **Approach**: Create a `settings` collection with one document per org, each containing its own Gitea endpoint/owner/token. The Settings page shows org-scoped config.
- **Pros**: Supports multi-org demos. Closer to a production-grade design.
- **Cons**: Massive scope expansion — multi-org routing, UI selectors, per-org access control. The demo is single-tenant; no org-level Gitea separation exists. Camel routes would need per-org config resolution.
- **Why not chosen**: Violates the "lightest possible primitive" goal. Single-org singleton is sufficient for the demo and can be extended later if needed.

### Option C: Singleton MongoDB settings document (chosen)

- **Approach**: One new `gitea_settings` collection with a singleton document (`_id: 'gitea'`). One new Settings page, one new route pair (`GET`/`PATCH`), seeded with project defaults. Admin-only access.
- **Pros**: Lightest footprint — one collection, one route pair, one page. Runtime-configurable. Replaces dead UI. Seeds match existing Helm values. Non-destructive re-seed via `$setOnInsert`.
- **Cons**: Token stored inline in MongoDB (no vault integration) — acceptable for the demo. Single-instance only.
- **Why not chosen**: This IS the chosen approach.

## Agreed Approach

**Option C — Singleton MongoDB settings document.** The platform needs a runtime-configurable Gitea target, and the dead "Preferences" placeholder needs to be wired. A singleton document is the lightest primitive that satisfies both: one new collection, one new route pair, one new page. The `$setOnInsert` seed pattern ensures admin-edited values survive re-seeds.

## Key Decisions

| Decision | Chosen | Alternative | Why not the alternative |
|---|---|---|---|
| Storage | MongoDB singleton (`_id: 'gitea'`) | Helm values / env vars | No runtime re-config; Helm is deploy-time only |
| Auth method | Personal Access Token (PAT) | OAuth / SSH keys / basic auth | PAT is simplest; demo doesn't need OAuth flows |
| Token handling | Stored inline, redacted in API responses | Vault / K8s Secret | Inline is consistent with how the demo handles all values |
| Seed idempotence | `updateOne` + `$setOnInsert` | `replaceOne` + `upsert` | `replaceOne` would overwrite admin-edited values on re-seed |
| Topbar item | Rename "Preferences" → "Settings" | Keep both | "Preferences" is dead; no user preferences feature exists |
| Page location | `src/pages/admin/Settings.tsx` | `src/pages/Settings.tsx` | Admin-only page; `admin/` subdirectory matches organizational intent |
| API token reveal | `?reveal=1` query param | Separate endpoint | Single endpoint simpler; reveal is a read-time flag |

## Open Questions

None — scope and decisions are locked by the plan document.
