## Why

The Admin → New Group page in the ITSM SPA promises a "Resources that will be created" preview listing four artifacts — the first of which is a Keycloak group (`gdf-{id}`). The backend never provisions Keycloak: no Camel route, no Helm chart, no client registration (verified 2026-05-14: zero matches for `[Kk]eycloak` under `gdfkube-src/gdfkube-camel/src/main/java/`). The drift extends through 15 doc locations across two change folders and one published spec, all still saying "four artifacts / four files / four target paths." This change aligns the UI promise and remaining docs with backend reality and unblocks archiving of `auto-provision-org-resources-from-group-events`, whose own docs currently mislead.

## What Changes

**New Group page preview (SPA)**
- From: Preview lists four artifacts (`Keycloak group`, `AppProject`, `ManagedClusterSetBinding`, `Git repo`); help text reads "Used for Keycloak group, repo, and AppProject names."; file-header comment describes four artifacts.
- To: Preview lists three artifacts (`AppProject`, `ManagedClusterSetBinding`, `Git repo`); help text reads "Used for repo and AppProject names."; file-header comment describes three artifacts.
- Reason: Backend provisions only three artifacts; the Keycloak line is a false promise.
- Impact: Non-breaking. Visible only to admins on the New Group form; no API or data shape changes.

**SPA tests (`__tests__/NewGroupPage.test.tsx`)**
- From: assertions reference "Keycloak group" text.
- To: negative assertion that no element contains "Keycloak group"; positive assertion that the preview block (`data-testid="group-preview"`) contains exactly three `<li>` children.
- Reason: Pin the corrected behavior so any future re-introduction of the line fails loudly.
- Impact: Non-breaking; test-only.

**OpenSpec doc amendments (15 locations)**
- Replace "four → three" and delete Keycloak references at the lines enumerated in `tmp/unified-audit-findings.md` (amendments A-4, A-9, A-10, A-11, A-27, A-28, A-29, A-30, A-31, A-32, A-33, A-34, A-35, A-36, A-39, A-40, A-41).
- Files touched: `openspec/specs/itsm-admin-users/spec.md`; `openspec/changes/auto-provision-org-resources-from-group-events/{proposal,design,plan,brainstorm}.md`; `openspec/changes/auto-provision-org-resources-from-group-events/specs/camel-orchestrator-stack/spec.md`; `openspec/changes/remove-deadcode-group-admin-controls/specs/itsm-admin-users/spec.md`.
- Reason: Drift between docs and shipped behavior; unblocks archiving of the auto-provision change.
- Impact: Documentation only; no runtime behavior change.

**Explicitly not changing**
- No Keycloak provisioning is added — backend code, Camel routes, and Helm charts are untouched.
- `openspec/specs/camel-orchestrator-stack/spec.md:387` (already says "three files") is not touched.
- A-37 (Java test class rename in `gdfkube-camel`) is handled separately by `strengthen-org-bootstrap-tests.md`.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `itsm-admin-users`: New Group page preview behavior. Requirement changes from "preview lists four artifacts including a Keycloak group" to "preview lists three artifacts (AppProject, ManagedClusterSetBinding, Git repo)"; supporting help-text requirement updated; scenarios updated to assert three lines and absence of Keycloak text.

## Impact

**Affected code**
- `gdfkube-src/gdfkube-itsm/src/admin/NewGroupPage.tsx` — file-header comment (lines 1–7), help text at line 98, preview block at lines 122–127. ~3 LOC removed plus comment + help-text edits.
- `gdfkube-src/gdfkube-itsm/src/admin/__tests__/NewGroupPage.test.tsx` — assertion swap plus one new regression assertion.

**Affected docs**
- 15 line-level edits across 6 Markdown files in `openspec/specs/itsm-admin-users/`, `openspec/changes/auto-provision-org-resources-from-group-events/` (4 files including its nested spec delta), and `openspec/changes/remove-deadcode-group-admin-controls/specs/itsm-admin-users/spec.md`.

**Affected services / APIs / topics / consumers**
- None. No backend, API, Kafka topic, MongoDB collection, Helm chart, or ArgoCD application is touched.

**Dependencies**
- No package or dependency version changes. No new libraries. No pinned versions to flag.

**Testing strategy**
- Unit (SPA, Vitest + React Testing Library): `NewGroupPage.test.tsx` is updated to assert three `<li>` children and absence of any "Keycloak group" text. Run via `cd gdfkube-src/gdfkube-itsm && npm test`.
- Integration: not applicable — no backend, contract, or Kafka surface changes.
- Contract: not applicable — no API schema change.
- Manual smoke: open the New Group page; confirm the preview shows three lines (AppProject, MCSB, Git repo) and the help text no longer mentions Keycloak.
- Doc-drift verification: `grep -rn "Keycloak" gdfkube-src/gdfkube-itsm/src/` returns zero; `grep -rn "four artifacts\|four files\|four target paths\|four target manifests\|four lines" openspec gdfkube-src/gdfkube-itsm` returns zero.

**Dependency graph**
- Blocks: archiving of `auto-provision-org-resources-from-group-events` (its docs must read consistently).
- Blocked by: nothing.
- Related: `strengthen-org-bootstrap-tests.md` handles the separate Java test class rename (A-37).
