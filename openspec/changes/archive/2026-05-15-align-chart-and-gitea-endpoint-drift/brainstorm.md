## Design Summary

Eliminate two drift hotspots flagged by the 2026-05-14 audit (H-8 and the `formId` divergence in `HelmValuesBuilder.buildForOrg`):

1. **Gitea endpoint drift** — `mongodb/seed-data/settings.json` writes `endpoint: "https://gitea-gitea.apps.gdfkube.gov"` (external route). `gitea/sync-token.sh` overwrites the same document with `endpoint: "http://gitea:3000"` (in-cluster service). The seed value is dead — every cluster start clobbers it — yet developers reading the seed assume it is authoritative. The Camel side (`HelmValuesBuilder.giteaExternalUrl`) consumes a Helm chart value (`https://gitea-gitea.apps.gdfkube.gov`), not the Mongo `gitea_settings.endpoint`. Only ITSM/server reads `gitea_settings.endpoint`.
2. **Chart `formId` default drift** — `argocd-org/values.yaml` and `rhacm-org/values.yaml` declare `meta.formId: "org-onboard"`. `HelmValuesBuilder.buildForOrg` writes `meta.formId: "org-bootstrap"` into the rendered values. No template branches on `formId` today, so behavior is unaffected, but the literal differs between source-of-truth (Java) and chart defaults. The Java emitter is the actual producer for the org-bootstrap path; the chart default is unreachable for that workflow.

The fix is to pick the canonical value in each case and remove the loser, then add a guard that fails fast if drift reappears.

## Alternatives Considered

### Option A: Make Camel/Helm the single source of truth, delete the dead/stale defaults
- **Approach**:
  - Remove `endpoint` from `mongodb/seed-data/settings.json` (keep `_id`, `owner`, `token: "CHANGE_ME"`, `updatedBy: "seed"`); rely entirely on `gitea-token-sync` to upsert `endpoint`/`owner`/`token` at startup. Update the ITSM server reader to treat absence as a hard error (consistent with the CLAUDE.md "fail hard, don't paper over" rule).
  - In `argocd-org/values.yaml` and `rhacm-org/values.yaml`, replace `formId: "org-onboard"` with `formId: "org-bootstrap"` so chart defaults match what `HelmValuesBuilder.buildForOrg` emits for the org-bootstrap path. Document that the org-bootstrap workflow is the only consumer of these defaults.
- **Pros**: Removes dead writes; one writer per field; aligns with project rule "eliminate drift: generated manifests must match their source of truth"; minimal surface change.
- **Cons**: Requires confidence that no other path reads the seed `endpoint` before `gitea-token-sync` finishes; need to verify ITSM startup order.
- **Why chosen**: This is the smallest correct change. It matches CLAUDE.md's stated values (no fallback constants, no papering over) and the audit's diagnosis that the seed value is dead.

### Option B: Promote Mongo `gitea_settings` to canonical, drop the Helm chart `giteaExternalUrl` value
- **Approach**: Have Camel read `gitea_settings.endpoint`/`owner` from Mongo at startup instead of from `application.properties`/Helm values; remove `system.giteaExternalUrl`/`system.giteaOwner` from `cluster-request` and `argocd-org` chart values.
- **Pros**: Single field, single store; chart values shrink.
- **Cons**: Adds a runtime Mongo dependency to the Camel bootstrap path (currently it only needs Helm values); the Mongo value is internal (`http://gitea:3000`) while ArgoCD needs the routable external URL — they cannot collapse into one value. Conflates two distinct consumers (UI link rendering vs ArgoCD `repoURL`).
- **Why not chosen**: The two endpoints serve different consumers (in-cluster API client vs ArgoCD route); merging them is the actual mistake, not a fix.

### Option C: Add a `validate-drift` pre-commit/CI check and leave both values in place
- **Approach**: Add a check that compares `seed-data/settings.json` `endpoint` against the value written by `sync-token.sh`, and `formId` literals across Java + chart values, failing on mismatch — but keep both values authoritative as documentation.
- **Pros**: Cheapest; preserves "documentation as code" intent.
- **Cons**: Doesn't fix the dead write — both values still exist, one is still overwritten on every start. Future readers still confused. Adds tooling for a problem the audit asks us to remove, not codify.
- **Why not chosen**: Detection is no substitute for elimination here. The drift is fixable by deletion.

## Agreed Approach

**Option A.** Make the runtime writer authoritative for the Gitea endpoint (delete the dead seed field). Make the Java emitter authoritative for `formId: "org-bootstrap"` (correct the chart defaults to match). Both changes follow CLAUDE.md's drift-elimination rule and remove dead state rather than adding new abstractions.

## Key Decisions

- **Canonical Gitea endpoint writers**:
  - In-cluster API endpoint (Mongo `gitea_settings.endpoint`): owned exclusively by `gitea/sync-token.sh`. Seed JSON no longer carries `endpoint`.
  - External Gitea URL (used by ArgoCD `repoURL`, ITSM UI links): owned by chart values `system.giteaExternalUrl` in `cluster-request`/`argocd-org`, propagated via Camel `HelmValuesBuilder.giteaExternalUrl`. Untouched by this change.
- **Canonical `formId` for org-bootstrap**: `"org-bootstrap"` (matches Java emitter). Update `argocd-org/values.yaml` and `rhacm-org/values.yaml` defaults to match. Other charts (`cluster-request: "cluster-request"`, `namespace-request: "namespace-request"`) already match their `RequestEvent.formId` callers — leave them.
- **No new abstractions**: do not introduce a shared `_gitea.tpl` helper or a `formId` enum. The audit notes duplication (M-13) but solving that is a separate change.
- **Fail-hard on missing seed**: After removing `endpoint` from seed JSON, ITSM `/api/itsm/settings/gitea` (or equivalent) must surface a 5xx if Mongo lacks the document — no in-memory fallback. (Consistent with the SPA "fail hard" guidance in CLAUDE.md.)
- **Verification**: Add a small assertion to an existing Camel test (or seeds test) that `HelmValuesBuilder.buildForOrg(...)` emits the same `formId` literal that appears in the chart `values.yaml` files. Cheap, no new test file required.

## Open Questions

- None blocking. If the ITSM server currently tolerates a missing `gitea_settings` document with a silent default, that toleration should be removed in this change; otherwise removing the seed `endpoint` is the only required action.
