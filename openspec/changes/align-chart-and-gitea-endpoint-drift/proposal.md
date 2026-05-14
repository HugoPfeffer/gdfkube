## Why

The 2026-05-14 codebase audit found two drift artifacts that violate the project rule "generated manifests must match their source of truth":

- `gitea_settings.endpoint` is written twice with different values — once by `mongodb/seed-data/settings.json` (`https://gitea-gitea.apps.gdfkube.gov`) and again by `gitea/sync-token.sh` which overwrites it with `http://gitea:3000` on every cluster start. The seed value is dead, but reads as authoritative.
- The `argocd-org` and `rhacm-org` chart values declare `meta.formId: "org-onboard"`, while `HelmValuesBuilder.buildForOrg` (the only producer for those charts) emits `"org-bootstrap"`. The chart default is unreachable. Both are silent today but will mislead the next reader and risk future template logic.

## What Changes

**Gitea seed endpoint**
- From: `gdfkube-src/gdfkube-infra/mongodb/seed-data/settings.json` carries `endpoint: "https://gitea-gitea.apps.gdfkube.gov"`; `gitea-token-sync` overwrites it on every boot.
- To: Seed JSON no longer carries `endpoint`; `gitea-token-sync` is the sole writer of `gitea_settings.endpoint`. Seeder uses `$setOnInsert` semantics consistent with existing spec, so re-seed is still a no-op against an admin-edited document.
- Reason: Eliminate dead writes; one writer per field.
- Impact: Non-breaking for runtime (sync-token already writes the canonical value first-boot). Breaking for any code path that assumed the seed `endpoint` is read before sync — ITSM `/api/itsm/settings/gitea` must surface a hard error if the document is missing, no silent fallback.

**Chart `formId` defaults**
- From: `charts/infra/argocd-org/values.yaml` and `charts/infra/rhacm-org/values.yaml` declare `meta.formId: "org-onboard"`.
- To: Both chart defaults declare `meta.formId: "org-bootstrap"`, matching `HelmValuesBuilder.buildForOrg`.
- Reason: Align chart defaults with the Java emitter (the only producer for org-bootstrap rendering).
- Impact: Non-breaking. No template branches on `formId` today; this fixes documentation/drift only. Helm `values.schema.json` is unaffected (no enum currently constrains `formId`).

**Drift guard**
- Add a single assertion to the existing `HelmValuesBuilderTest` (or a new `OrgBootstrapValuesTest`) that compares the literal `formId` from `buildForOrg(...)` output against the value parsed from `charts/infra/argocd-org/values.yaml`. Fails the build if either side drifts again.

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `gitea-stack`: Requirement "Committed seed data SHALL retain placeholders, never live values" updates to reflect that the seed `settings.json` no longer carries `endpoint`; the only writer of `gitea_settings.endpoint` is `gitea-token-sync`.
- `itsm-settings-collection`: Requirement "Seed data SHALL match chart defaults" is replaced by "Seed data SHALL omit `endpoint`, deferring to runtime upsert". The Mongoose schema still requires `endpoint`, but the seeded document does not pre-populate it.
- `camel-orchestrator-stack`: No requirement change — `meta.formId == "org-bootstrap"` is already specified for `buildForOrg`. A new scenario is added asserting `formId` agreement between Java and chart defaults.

## Impact

- **Code**
  - `gdfkube-src/gdfkube-infra/mongodb/seed-data/settings.json` — drop `endpoint` field.
  - `gdfkube-src/gdfkube-itsm/server/src/data/seeds.ts` (or whichever module exports the seed payload) — drop `endpoint` from the seed object; keep the model field required.
  - `gdfkube-src/gdfkube-itsm/scripts/export-seed-data.mjs` — ensure exported seed no longer emits `endpoint`.
  - `gdfkube-src/gdfkube-itsm/server/src/...` reader for `/api/itsm/settings/gitea` — return 503 if `gitea_settings.endpoint` is absent at request time.
  - `gdfkube-src/gdfkube-infra/charts/infra/argocd-org/values.yaml` — `formId: "org-bootstrap"`.
  - `gdfkube-src/gdfkube-infra/charts/infra/rhacm-org/values.yaml` — `formId: "org-bootstrap"`.
  - `gdfkube-src/gdfkube-camel/src/test/java/gov/gdf/camel/bean/HelmValuesBuilderTest.java` — new assertion comparing emitted `formId` to chart-defaults literal.
- **APIs**: `/api/itsm/settings/gitea` now fails fast (503) when the singleton document is missing — observable change for any consumer that previously got a silent default.
- **Kafka topics**: Unaffected.
- **Dependencies**: None changed.
- **Migrations**: None. Existing deployments already have `gitea_settings` populated by `gitea-token-sync`; the seed change only removes a field that is overwritten anyway.
- **Test strategy**:
  - Unit (server): `__tests__/seeds.test.ts` — assert seed object lacks `endpoint`; assert `$setOnInsert` behavior preserved.
  - Unit (Camel): `HelmValuesBuilderTest` — new assertion that `buildForOrg().formId` equals the parsed chart default in `argocd-org/values.yaml`.
  - Integration: existing `gitea-token-sync` scenario in `gitea-stack` spec already asserts the post-sync state — no new integration test needed.
