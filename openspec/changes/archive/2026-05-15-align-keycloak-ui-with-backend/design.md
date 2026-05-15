## Context

The `NewGroupPage.tsx` SPA component renders a "Resources that will be created" preview as four `<li>` entries — `Keycloak group: gdf-{id}`, `AppProject`, `ManagedClusterSetBinding`, `Git repo`. The backend `gdfkube-camel` orchestrator (see `openspec/specs/camel-orchestrator-stack/spec.md`) commits exactly three files per group-create event (AppProject, MCSB, Git repo). No Camel route, no Helm chart, and no client registration code references Keycloak (`grep -rn "[Kk]eycloak" gdfkube-src/gdfkube-camel/src/main/java/` returned zero on 2026-05-14).

The drift cascaded: the original group-events proposal text spread "four artifacts / four files / four target paths" across its proposal, design, plan, brainstorm, and nested spec delta. The published `itsm-admin-users` capability and the in-flight `remove-deadcode-group-admin-controls` change repeated the same numbers and the Keycloak bullet in their scenarios. Only `openspec/specs/camel-orchestrator-stack/spec.md:387` was corrected during a prior pass.

**Stakeholders:** the demo's solo developer (also reviewer) and any future operator who follows the New Group prompt expecting Keycloak provisioning to happen. **Constraint:** the project values "driftless codebases" (per `CLAUDE.md`) — UI promises and docs must match shipped behavior.

## Goals / Non-Goals

**Goals:**
- Make the SPA's New Group preview honest: list exactly the three artifacts the backend commits.
- Eliminate "four / Keycloak" drift across the 15 enumerated doc locations so `auto-provision-org-resources-from-group-events` can archive cleanly.
- Pin the corrected SPA behavior with a regression test that fails if any future edit re-introduces "Keycloak group" or a fourth `<li>`.

**Non-Goals:**
- Implementing Keycloak provisioning (no Camel route, chart, realm config, or admin credentials).
- Renaming the `OrgBootstrapRouteTest` Java class (A-37) — that's a code/test rewrite handled by `strengthen-org-bootstrap-tests.md`.
- Touching `openspec/specs/camel-orchestrator-stack/spec.md:387` (already says "three files").
- Restructuring affected Markdown files; only the enumerated lines change.

## Decisions

### D1: Drop the Keycloak `<li>` entirely; do not replace it with a "future" placeholder
- **Choice:** Remove `<li>Keycloak group: gdf-{idDisplay}</li>` outright. The preview becomes three lines.
- **Alternatives considered:**
  - Replace with `<li>(future) Keycloak group: gdf-{idDisplay}</li>` — rejected: still a promise, just hedged; encourages re-introduction of full provisioning without a stakeholder ask.
  - Hide behind a feature flag — rejected: zero code paths flip the flag today; adds dead infrastructure.
- **Trade-off:** Loses the "roadmap hint" the line provided. Acceptable: the audit confirmed there is no roadmap commitment behind it.

### D2: Edit the help text and file-header comment in the same SPA file
- **Choice:** Update three sites in `NewGroupPage.tsx` together — header comment (lines 1–7), help text at line 98, and preview block at lines 122–127.
- **Alternatives considered:** patch only the preview block — rejected: the help text "Used for Keycloak group, repo, and AppProject names." would still mislead.
- **Trade-off:** Slightly larger SPA diff (still ~3 LOC removed plus comment/help-text edits). Worth it for internal consistency.

### D3: Regression test asserts both negation and count
- **Choice:** In `NewGroupPage.test.tsx`, add (a) a negative assertion that no element contains "Keycloak group" and (b) a positive assertion that the preview (`data-testid="group-preview"`) contains exactly three `<li>` children.
- **Alternatives considered:**
  - Single assertion on count only — rejected: a future edit could swap one of the three entries to a Keycloak line and still pass.
  - Single negative assertion only — rejected: doesn't catch silent additions of a fifth/sixth artifact.
- **Trade-off:** Two assertions, one test. Negligible cost.

### D4: Doc amendments are surgical, not rewrites
- **Choice:** Edit only the exact lines enumerated by amendment IDs A-4, A-9, A-10, A-11, A-27, A-28, A-29, A-30, A-31, A-32, A-33, A-34, A-35, A-36, A-39, A-40, A-41 from `tmp/unified-audit-findings.md`. Don't restructure the affected files.
- **Alternatives considered:** rewrite the affected sections for clarity — rejected: balloons diff size, fragments git blame, and slows review.
- **Trade-off:** Some surrounding prose remains stylistically uneven. Acceptable; can be cleaned up in a later doc pass if needed.

### D5: Update the `itsm-admin-users` capability spec as a MODIFIED capability delta
- **Choice:** The change introduces no new capability; it modifies an existing one. The spec delta files under `specs/itsm-admin-users/spec.md` describe the requirement and scenario changes.
- **Alternatives considered:** introduce a separate "new-group-preview" capability — rejected: the preview is one requirement of an existing capability, not a standalone capability.
- **Trade-off:** Delta must clearly identify modified vs. removed requirements. We use OpenSpec's standard `## MODIFIED Requirements` / `## REMOVED Requirements` blocks for that.

## Risks / Trade-offs

- **[Risk] Reviewer reads the diff and thinks "where did Keycloak go?"** → Mitigation: the proposal and design both cite the 2026-05-14 verification (`grep` returned zero Camel-side matches) and link the unified-audit-findings amendment IDs.
- **[Risk] Future change re-introduces "four artifacts" wording before Keycloak provisioning exists** → Mitigation: the SPA test pins three `<li>` children and asserts absence of "Keycloak group" text; the doc-drift `grep` commands in `verify.md` will catch re-introductions in OpenSpec docs.
- **[Risk] The `auto-provision-org-resources-from-group-events` change's nested spec delta and the published `itsm-admin-users` spec disagree mid-review** → Mitigation: edits to both happen in this single change; CI/`pre-commit run --all-files` runs before push so any spec validation issues surface together.
- **[Risk] Hidden Keycloak references elsewhere (charts, env, scripts)** → Mitigation: verify step runs `grep -rn "[Kk]eycloak"` across the repo, not just SPA paths, and fails the change if anything turns up.
- **[Trade-off] No Keycloak provisioning means the demo narrative is less rich.** Accepted: honesty over aspiration.

## Migration Plan

No migration is required.

- No MongoDB schema changes.
- No Kafka topic, consumer group, or contract changes.
- No Helm chart changes — no `values.yaml`, no Application manifest, no AppProject change.
- No environment variable additions or removals.
- No backwards-incompatible API change. The SPA build artifact changes; cached browser SPAs will pick up the new bundle on next load.

**Rollback strategy:** revert the single PR. The SPA hot-reloads on redeploy; doc edits are pure Markdown.

## Open Questions

None. Direction and amendment-level edits were already settled in `tmp/unified-audit-findings.md`.
