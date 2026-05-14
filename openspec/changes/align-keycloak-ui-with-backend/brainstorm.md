## Design Summary

`NewGroupPage.tsx` promises a "Resources that will be created" preview listing four artifacts, the first being a Keycloak group (`gdf-{id}`). The backend never provisions Keycloak — no Camel route, no Helm chart, no client registration. The doc set ("four artifacts / four files / four target paths") echoes the same false promise across two change folders and one published spec. The published `camel-orchestrator-stack` spec was already corrected to "three files." Everything else drifted.

Resolve the drift by aligning the UI and remaining docs with backend reality: drop the Keycloak `<li>` from the SPA preview, update the SPA help text and header comment, and amend 15 OpenSpec doc lines to replace "four → three" and delete Keycloak references. Backend code and Helm charts are untouched.

## Alternatives Considered

### Option A: Honesty — drop Keycloak from UI + docs (CHOSEN)
- **Approach**: Remove the Keycloak `<li>` and Keycloak-related help text from `NewGroupPage.tsx`; flip "four → three" in 15 doc locations across 2 change folders and 1 published spec; update SPA tests to assert three preview lines and no Keycloak text.
- **Pros**:
  - Zero backend risk — only SPA + Markdown edits.
  - Eliminates drift between UI promise and shipped behavior.
  - Unblocks archiving of `auto-provision-org-resources-from-group-events` (whose own docs currently lie).
  - Mechanical, reviewable in one PR.
- **Cons**:
  - Removes a feature *promise* users could have read as roadmap.
  - Slightly weakens the demo narrative ("Keycloak group too!") — but the narrative was always aspirational.
- **Why chosen**: Matches the project's "driftless codebases" value and the pre-existing direction set by the unified audit (H-1 + M-24 + 15 amendments). The competing option (implement Keycloak) has no stakeholder commit yet.

### Option B: Implement Keycloak provisioning to match the UI promise
- **Approach**: Add a `KeycloakBootstrapRoute` Camel route, a Keycloak Helm chart, realm/admin credential env config, and integration tests. Leave the UI text alone.
- **Pros**:
  - Honors the original promise; demo gets a fourth artifact.
- **Cons**:
  - Multi-week scope: new chart, new route, new tests, secrets management (realm-admin password is a credential, not a placeholder).
  - No stakeholder ask documented; this is feature creep driven by stale UI copy.
  - Compounds drift further if it slips — UI keeps lying for longer.
- **Why not chosen**: Out of scope; punted to a future plan if/when a stakeholder commits. Same reasoning recorded in `tmp/unified-audit-findings.md`.

### Option C: Leave UI alone, only fix doc drift
- **Approach**: Update the 15 doc lines to "three" but leave the SPA preview showing four including Keycloak.
- **Pros**:
  - Smallest diff.
- **Cons**:
  - UI still lies to operators clicking through New Group.
  - Re-creates the same drift in the next doc cycle — anyone reading the SPA would re-introduce "four" into docs.
  - Defeats the purpose of the audit finding.
- **Why not chosen**: Solves only half the problem; the SPA preview is the most visible source of the false promise.

## Agreed Approach

Option A — Honesty. Concretely:
- **SPA (`gdfkube-itsm/src/admin/NewGroupPage.tsx`)**: remove the `<li>Keycloak group: gdf-{idDisplay}</li>` line (currently lines 122–127), change the help text at line 98 from "Used for Keycloak group, repo, and AppProject names." to "Used for repo and AppProject names.", and adjust the file-header comment (lines 1–7) so any "four" wording becomes "three" and the Keycloak bullet is dropped.
- **SPA test (`gdfkube-itsm/src/admin/__tests__/NewGroupPage.test.tsx`)**: replace assertions of "Keycloak group" presence with a negative assertion, and add a regression assertion that the preview block contains exactly three `<li>` children.
- **OpenSpec docs (15 amendments)**: across `openspec/specs/itsm-admin-users/spec.md`, `openspec/changes/auto-provision-org-resources-from-group-events/{proposal,design,plan,brainstorm}.md`, `openspec/changes/auto-provision-org-resources-from-group-events/specs/camel-orchestrator-stack/spec.md`, and `openspec/changes/remove-deadcode-group-admin-controls/specs/itsm-admin-users/spec.md`: flip "four → three" and delete Keycloak references at the exact line numbers enumerated in the source plan (A-4, A-9, A-10, A-11, A-27, A-28, A-29, A-30, A-31, A-32, A-33, A-34, A-35, A-36, A-39, A-40, A-41).
- **Out of scope**: A-37 (Java test class rename) — handled by `strengthen-org-bootstrap-tests.md` because it's a code rename bound to a test rewrite, not a pure doc edit.

## Key Decisions

- **No backend Keycloak provisioning** in this change. A future proposal may add it; until then, the UI must not promise it.
- **No fallback / placeholder Keycloak preview** — drop the `<li>` entirely rather than rewriting it as a "future" line. Honesty beats a hedged promise.
- **Test the negation**: add an explicit "no element contains 'Keycloak group'" assertion plus a count assertion (`children.length === 3`) so any future re-introduction of the line fails the test loud.
- **Doc edits are surgical, not rewrites**: only the enumerated lines change. No restructuring of the affected files — that preserves git blame and keeps the diff reviewable.
- **`camel-orchestrator-stack/spec.md:387`** (already says "three files") stays untouched. Don't re-correct what's already correct.

## Open Questions

None blocking. The direction was decided in `tmp/unified-audit-findings.md` (H-1, M-24, amendments A-4/A-9/A-10/A-11/A-27/A-28/A-29/A-30/A-31/A-32/A-33/A-34/A-35/A-36/A-39/A-40/A-41) and verified against the codebase on 2026-05-14: no Keycloak references exist under `gdfkube-src/gdfkube-camel/src/main/java/`.
