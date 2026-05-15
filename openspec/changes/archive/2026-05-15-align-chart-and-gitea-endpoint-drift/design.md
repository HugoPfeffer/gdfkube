## Context

Two pieces of state in this codebase have two writers that disagree:

1. **Mongo `gitea_settings.endpoint`**: the singleton document tracks the URL the ITSM Express server uses to talk to Gitea.
   - `gdfkube-src/gdfkube-infra/mongodb/seed-data/settings.json` ships `endpoint: "https://gitea-gitea.apps.gdfkube.gov"` (the external OpenShift route).
   - `gdfkube-src/gdfkube-infra/gitea/sync-token.sh` upserts the same `_id: "gitea"` document with `endpoint: "http://gitea:3000"` (the in-cluster service DNS) on every `docker compose up`.
   - `gitea-token-sync` runs `after gitea-bootstrap` and `mongo-seed`, so it always wins. The seed value is observed only in the gap between mongo-seed completing and gitea-token-sync completing — a window no application code reads from.

2. **`meta.formId` for the org-bootstrap Helm rendering**:
   - `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/bean/HelmValuesBuilder.java` line 71 writes `meta.formId = "org-bootstrap"`.
   - `gdfkube-src/gdfkube-infra/charts/infra/argocd-org/values.yaml` line 3 and `…/rhacm-org/values.yaml` line 3 declare `formId: "org-onboard"`.
   - The chart `--values` argument supplies the values written by Camel, so the chart default is unreachable. But two distinct literals exist for the same logical key, which is the textbook definition of drift.

Existing specs already define the canonical Java side (`camel-orchestrator-stack/spec.md` says `meta.formId == "org-bootstrap"`). The drift is purely in the chart defaults and in the seed JSON.

The audit (2026-05-14) recorded these as H-8 and a separate `formId` mismatch row. The fix is intentionally narrow: pick a winner per field and delete the loser.

## Goals / Non-Goals

**Goals:**
- One writer per field for `gitea_settings.endpoint` (the runtime upsert in `sync-token.sh`).
- One literal value for the `formId` of the org-bootstrap rendering, matching the actual producer (Java).
- A small automated check that detects regression of the `formId` literal pair.
- Update the two spec files whose requirements currently mandate the dead/wrong values.

**Non-Goals:**
- Collapse `system.giteaExternalUrl` (chart value) and `gitea_settings.endpoint` (Mongo) into one variable. They serve different consumers (ArgoCD `repoURL` vs in-cluster Gitea API client) and currently hold different URLs by design.
- Solve M-13 (broker/mongo/gitea hosts duplicated across 5+ files). That belongs to a separate consolidation change.
- Introduce a Helm `values.schema.json` enum for `formId`. Schema-tightening is a follow-up; today no chart actually branches on `formId`.
- Touch the ITSM SPA. The SPA reads `/api/itsm/settings/gitea` via the Express layer; only the server-side reader changes (fail-hard on missing document).

## Decisions

### D1. Single writer for `gitea_settings.endpoint`: `gitea-token-sync`
**Choice**: Remove `endpoint` from `mongodb/seed-data/settings.json`; let `sync-token.sh` upsert it.
**Why**: `sync-token.sh` already runs after `mongo-seed` in compose, always overwrites the seed value, and is the only place that knows the runtime-correct in-cluster URL. The seed value is invisible to all readers in practice. Removing it eliminates a misleading read.
**Alternative considered**: Make seed authoritative and rewrite `sync-token.sh` to only set the token. Rejected because the in-cluster URL depends on the deployment topology (Compose vs OpenShift) and the seed shouldn't pin a Compose-specific default. The runtime script has the deployment context; the seed does not.

### D2. Canonical `formId` for org-bootstrap is `"org-bootstrap"`
**Choice**: Update `argocd-org/values.yaml` and `rhacm-org/values.yaml` chart defaults to `formId: "org-bootstrap"`.
**Why**: `HelmValuesBuilder.buildForOrg(...)` is the only producer that supplies values to those charts, and it already emits `"org-bootstrap"` (matches the existing spec at `camel-orchestrator-stack/spec.md:465`). Renaming the chart default is the smallest fix; renaming the Java emitter would require a spec change.
**Alternative considered**: Rename Java to emit `"org-onboard"`. Rejected — `org-bootstrap` is referenced widely (route id, release-name suffix, request-id prefix, existing spec text); changing it would cascade.

### D3. Fail-hard reader, no fallback constants
**Choice**: The Express handler for `/api/itsm/settings/gitea` returns 503 if `gitea_settings.endpoint` is absent. No in-memory default.
**Why**: CLAUDE.md mandates "fail hard, don't paper over" for the demo identity surface; this is the analogous surface for Gitea config. With the seed `endpoint` removed, a missing document is a real misconfiguration (gitea-token-sync didn't run) that should be loud.
**Alternative considered**: Have the reader fall back to the chart's `giteaExternalUrl` value via env. Rejected — that's a fallback constant, exactly what CLAUDE.md prohibits, and it conflates the two endpoints again.

### D4. Drift guard lives in `HelmValuesBuilderTest`
**Choice**: Add one JUnit assertion (using SnakeYAML, already on classpath via the bean itself) that parses `infra/argocd-org/values.yaml` and `infra/rhacm-org/values.yaml` from the test classpath / known relative path and asserts each `meta.formId` equals the literal returned by `buildForOrg(...)`.
**Why**: Cheap, lives next to the producer, catches both directions of regression (changing Java without chart, or chart without Java). The test already runs in the Camel module's surefire phase.
**Alternative considered**: A standalone Python/Bash pre-commit script. Rejected — adds tooling for a single-file invariant; the JUnit assertion is shorter and already in the test path.

### D5. Spec deltas, not new specs
**Choice**: Modify `gitea-stack` (Requirement: "Committed seed data SHALL retain placeholders, never live values") and `itsm-settings-collection` (Requirement: "Seed data SHALL match chart defaults" + the scenario asserting endpoint equality).
**Why**: Both capabilities exist; only the seed-shape requirement inside them needs to flip. No new capability is being introduced.

## Risks / Trade-offs

- **Risk**: Some local-dev workflow may read `gitea_settings` before `gitea-token-sync` has run (e.g., starting only the Express server against a freshly seeded Mongo, without bringing up the gitea-token-sync container).
  → **Mitigation**: D3's 503 response surfaces this loudly with a clear message ("gitea_settings document missing — run gitea-token-sync"). Developers must `docker compose up gitea-token-sync` before hitting the settings endpoint. This is already required for the token to exist; removing `endpoint` doesn't change the order-of-ops, only the failure mode.

- **Risk**: `npm run seed:export` (per `itsm-settings-collection/spec.md` line 100) currently re-emits `endpoint`. If we don't update the export script, every run regenerates the dead field.
  → **Mitigation**: Update `scripts/export-seed-data.mjs` to project the document without `endpoint` (or rely on the seed source-of-truth no longer carrying it). Verify in the `seeds.test.ts` round-trip.

- **Risk**: Hidden chart template branch on `meta.formId`.
  → **Mitigation**: `grep -rn "formId" gdfkube-src/gdfkube-infra/charts/` already confirms no template uses it. Re-check during apply.

- **Trade-off**: The drift guard couples the Camel test module to chart file paths.
  → Acceptable: the Camel bean already loads chart values at runtime via `helm template /opt/charts/<chartRef>`. A test-time path read is no tighter a coupling than runtime.

## Migration Plan

1. **Deploy order**: This is a pure source change. After merge, the first `docker compose up` will:
   - Mongo-seed writes the new shape (no `endpoint` field).
   - `gitea-token-sync` upserts `endpoint`, `owner`, `token` as before. No-op for the document shape from the live side.
   - Existing deployments already have `endpoint` populated; the seed change doesn't run against them again (`$setOnInsert`).
2. **No Mongo migration script needed** — existing documents keep their fields.
3. **Rollback**: Revert the commit. The seed regains the dead `endpoint` field; behavior is identical because `sync-token.sh` still overwrites it.
4. **Kafka**: no consumer group rebalancing; topics and consumer groups are unchanged.
5. **Helm**: chart `values.schema.json` files are not modified, so existing rendered releases remain valid.
