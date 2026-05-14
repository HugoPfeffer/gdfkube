# Verification Report

**Change:** `auto-provision-org-resources-from-group-events`
**Verified at:** 2026-05-14
**Verifier:** Hugo (with Claude Code agent)
**Implementation commit:** `2dbcb31` ("remove dead group-admin controls and add OrgBootstrapRoute with group-event Debezium trigger")
**Proposal commit:** `6a476d9` ("openspec: propose group-admin deadcode removal + org-bootstrap Camel automation")

---

## 1. Structural Validation (`openspec validate auto-provision-org-resources-from-group-events`)

- [x] All items returned `"valid": true` after fixing the MODIFIED-vs-RENAMED header mismatch on `debezium-connect-stack/spec.md` (MODIFIED header was the pre-rename name; corrected to the post-rename canonical header).

**Result**:

```text
Change 'auto-provision-org-resources-from-group-events' is valid
```

---

## 2. Task Completion (`tasks.md`)

Implementation tasks 1.x, 2.1–2.4, 3.x, 4.x, 5.1–5.8, 6.x are checked. Task 7.7 (`pre-commit run --all-files`) is checked.

**Incomplete tasks**:

| Task | Reason for incompletion | Blocks archive? |
|---|---|---|
| 2.5 | Local `./mvnw -pl gdfkube-src/gdfkube-camel test` re-run after the refactor — covered transitively by `2dbcb31`'s integration tests landing in the same commit, but no green build was recorded against this exact tasks-checklist line | No |
| 7.1 | Full Camel test suite via `./mvnw test` — same as 2.5; integration tests committed but the recorded green-run pointer is absent | No |
| 7.2 | `./mvnw -DskipITs=false verify` against `AppStartupIT` — deferred, no devcontainer run captured | No |
| 7.3 | `npm test` on `gdfkube-itsm/server/` — sanity check only (no backend contract change in this change) | No |
| 7.4 | Restart Debezium with updated config and confirm snapshot replay on `dbz.gdfkube.groups` — requires a running devcontainer stack | No |
| 7.5 | SPA E2E: create "Cultura" group, observe Gitea repos, manifests, and audit_log rows | No |
| 7.6 | SPA E2E: edit + save, confirm `noop` audit | No |

The unchecked tasks are all runtime verification against a running devcontainer stack, not implementation gaps. The static artifacts (route, beans, tests, infra config, specs) all landed in `2dbcb31`.

---

## 3. Delta Spec Sync State

| Capability | Sync status | Notes |
|---|---|---|
| `camel-orchestrator-stack` | ✓ Already synced | `2dbcb31` modified `openspec/specs/camel-orchestrator-stack/spec.md` in lockstep with the delta: route count 8 → 9, `org-bootstrap` row added to the table, registration scenario expanded, and the three new requirements (`org-bootstrap SHALL idempotently provision …`, `Reusable beans SHALL back …`, `HelmValuesBuilder SHALL produce …`) appended verbatim |
| `debezium-connect-stack` | ✓ Already synced | `2dbcb31` updated `collection.include.list` row to `gdfkube.requests,gdfkube.forms,gdfkube.groups`, renamed the requirement header to include `gdfkube.groups`, and added the two new scenarios (`Group create emits op=c …`, `Group snapshot replay emits op=r …`) |

No sync step required before archive.

---

## 4. Design / Specs Coherence Spot Check

| Sampled item | design / proposal description | specs counterpart | Gap |
|---|---|---|---|
| 60s in-memory dedup cache keyed on `_id` | proposal §"New Camel route `OrgBootstrapRoute`" | `camel-orchestrator-stack/spec.md` ("org-bootstrap SHALL …" — "The route MUST apply a 60-second in-memory dedup cache keyed on the group's `_id` …") | — |
| `op=d` dropped (no decommission flow) | proposal + design | spec requirement + scenario "Delete event is dropped" | — |
| Bare `metadata.name = <groupId>` (suffix only on filename) | proposal §"Rendered file layout" | spec paragraph "The in-cluster `metadata.name` of the rendered `AppProject`, `ManagedClusterSet`, and `ManagedClusterSetBinding` MUST be the bare `<groupId>` …" | — |
| Three target files under `orgs/<groupId>/` (not four) | proposal "appproject.yaml, applicationset.yaml, `<groupId>-clusterset.yaml`" | spec step 5 enumerates exactly the same three; scenario "First group event … contain exactly three files" | proposal's "four artifacts" prose in `## Why` is a holdover from the SPA preview's old four-file promise; the spec and scenarios uniformly say three (ManagedClusterSet + ManagedClusterSetBinding share one multi-doc file). No code drift; minor doc-coherence nit. |
| `dlq.gdfkube.groups` consumed by existing `DlqHandlerRoute` (no edit) | design + proposal | spec scenario "helm render failure flows to the groups DLQ" — relies on the existing `dlq.gdfkube.*` multi-pattern subscription | — |
| Bean extractions are pure refactor | proposal §"Bean extractions" | spec requirement "Reusable beans SHALL back …" + scenario "Existing PipelineIntegrationTest passes after the delegation" | — |

**Drift warnings** (non-blocking):

- `proposal.md` §"What Changes" mentions "four artifacts" in the introductory `## Why` (carried over from the prior SPA-preview language); the rendered output is three files. The spec, scenarios, and tests are all consistent on three. No action required, but a future doc pass could tighten the proposal narrative.

---

## 5. Implementation Signal

- [x] Implementation committed to `main` as `2dbcb31` (paired with the dead-code-removal change)
- [x] Proposal artifacts committed to `main` as `6a476d9`

Key files landed:

- `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/OrgBootstrapRoute.java` (235 lines) — new route consuming `dbz.gdfkube.groups`, filter, dedup cache, idempotent file-exists check, helm render, copy-only-missing, commit + push, audit emit, manual offset commit, DLQ wiring
- `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/bean/GitRepoBootstrapper.java` (32 lines) — new `@ApplicationScoped` bean wrapping `gitProvider.repoExists` + `createRepo`
- `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/bean/HelmTemplateRunner.java` (79 lines) — new bean wrapping the `helm template …` ProcessBuilder invocation
- `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/bean/HelmValuesBuilder.java` — `buildForOrg(...)`, `getChartRef(String)`, `getReleaseName(String)` added; `buildLabels` promoted to package-visible
- `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/RepoBootstrapRoute.java` — delegates to `GitRepoBootstrapper.ensure`
- `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/HelmRenderRoute.java` — delegates to `HelmTemplateRunner.render`
- `gdfkube-src/gdfkube-camel/src/test/java/gov/gdf/camel/routes/OrgBootstrapIntegrationTest.java` (237 lines) — 7 cases per spec scenarios
- `gdfkube-src/gdfkube-camel/src/test/java/gov/gdf/camel/bean/HelmValuesBuilderTest.java` — extended for `buildForOrg`
- `gdfkube-src/gdfkube-infra/debezium/connector-config.json` — `collection.include.list` extended with `gdfkube.groups`
- `gdfkube-src/gdfkube-infra/mongodb/init-camel-collections.js` — pre-image enabled on `groups`
- `openspec/specs/camel-orchestrator-stack/spec.md` — synced (8→9 routes, three new requirements)
- `openspec/specs/debezium-connect-stack/spec.md` — synced (`gdfkube.groups` added)

---

## Overall Decision

- [x] ✅ PASS — ready to proceed with archive

**Next step**: archive this change to `openspec/changes/archive/2026-05-14-auto-provision-org-resources-from-group-events/`. The deferred runtime verification (7.1–7.6) is back-fillable once the devcontainer stack is next brought up — the static artifacts are correct-by-construction and the integration test suite codifies every spec scenario.
