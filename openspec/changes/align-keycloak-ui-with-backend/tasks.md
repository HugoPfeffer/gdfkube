## 1. SPA — NewGroupPage source

- [x] 1.1 In `gdfkube-src/gdfkube-itsm/src/admin/NewGroupPage.tsx`, update the file-header comment (lines 1–7) so any "four" wording becomes "three" and the Keycloak bullet is dropped from the list.
- [x] 1.2 In the same file at line 98, change the help text from `Used for Keycloak group, repo, and AppProject names.` to `Used for repo and AppProject names.`.
- [x] 1.3 In the same file at lines 122–127, remove the `<li>Keycloak group: gdf-{idDisplay}</li>` entry so the preview emits exactly three `<li>` entries (`AppProject`, `ManagedClusterSetBinding`, `Git repo`).
- [x] 1.4 Confirm the preview wrapper still exposes `data-testid="group-preview"`; if absent, add it on the `<ul>` so the regression test can target it.

## 2. SPA — NewGroupPage tests

- [x] 2.1 In `gdfkube-src/gdfkube-itsm/src/admin/__tests__/NewGroupPage.test.tsx`, replace any positive assertion that the preview contains text matching `Keycloak group` with a negative assertion (e.g. `expect(screen.queryByText(/Keycloak group/i)).toBeNull()`).
- [x] 2.2 Add a regression assertion that, with a non-empty Display name, the preview block (`getByTestId('group-preview')`) contains exactly three `<li>` children.
- [x] 2.3 Update any existing scenario referencing the four-line preview to reference three lines instead.
- [x] 2.4 Run `cd gdfkube-src/gdfkube-itsm && npm test -- --run NewGroupPage` and confirm green.

## 3. OpenSpec — `itsm-admin-users` published spec

- [x] 3.1 In `openspec/specs/itsm-admin-users/spec.md` at line 64 (A-4), change `preview of the Keycloak group, repo, AppProject, and ManagedClusterSetBinding to be created.` to `preview of the repo, AppProject, and ManagedClusterSetBinding to be created.`.
- [x] 3.2 In the same file at line 108 (A-9), change `MUST list four lines` to `MUST list three lines`.
- [x] 3.3 In the same file at line 109 (A-10), delete the `- Keycloak group: gdf-{id}` bullet from the list under the requirement.
- [x] 3.4 In the same file at line 120 (A-11), delete the scenario assertion `**THEN** an element with text \`Keycloak group: gdf-cultura\` is present`.

## 4. OpenSpec — archived `auto-provision-org-resources-from-group-events` change folder

Note: this change was archived at `openspec/changes/archive/2026-05-14-auto-provision-org-resources-from-group-events/`. The amendments below correct the historical record so the archived docs read consistently with backend reality.

- [x] 4.1 In `openspec/changes/archive/2026-05-14-auto-provision-org-resources-from-group-events/proposal.md` at line 3 (A-27), change `four artifacts` to `three artifacts`.
- [x] 4.2 In the same file at line 94 (A-28), change `the four files` to `the three files`.
- [x] 4.3 In `openspec/changes/archive/2026-05-14-auto-provision-org-resources-from-group-events/design.md` at line 5 (A-29), change `four artifacts (Keycloak group / AppProject / ManagedClusterSetBinding / Git repo)` to `three artifacts (AppProject / ManagedClusterSetBinding / Git repo)`.
- [x] 4.4 In the same file at line 20 (A-30), change `the four target files` to `the three target files`.
- [x] 4.5 In the same file at line 89 (A-31), change `the four files at orgs/cultura/` to `the three files at orgs/cultura/`.
- [x] 4.6 In `openspec/changes/archive/2026-05-14-auto-provision-org-resources-from-group-events/plan.md` at line 6 (A-32), change `four target manifests` to `three target manifests`.
- [x] 4.7 In `openspec/changes/archive/2026-05-14-auto-provision-org-resources-from-group-events/brainstorm.md` at line 14 (A-33), change `four target paths` to `three target paths`.
- [x] 4.8 In the same file at line 42 (A-34), change `four target paths` to `three target paths`.
- [x] 4.9 In `openspec/changes/archive/2026-05-14-auto-provision-org-resources-from-group-events/specs/camel-orchestrator-stack/spec.md` at line 49 (A-35), change `four target paths` to `three target paths`.
- [x] 4.10 In the same file at line 64 (A-36), change the scenario title `writes all four files` to `writes all three files`.

## 5. OpenSpec — `remove-deadcode-group-admin-controls` change folder

- [x] 5.1 In `openspec/changes/remove-deadcode-group-admin-controls/specs/itsm-admin-users/spec.md` at line 5 (A-39), change `preview of the Keycloak group, repo, AppProject, and ManagedClusterSetBinding` to `preview of the repo, AppProject, and ManagedClusterSetBinding`.
- [x] 5.2 In the same file at line 24 (A-40), change `four lines` to `three lines` and delete the Keycloak bullet from the enumerated list.
- [x] 5.3 In the same file at line 36 (A-41), delete the scenario `THEN` assertion that an element with text `Keycloak group: gdf-…` is present.

## 6. Verification

- [x] 6.1 Run `openspec validate align-keycloak-ui-with-backend` and confirm it passes.
- [x] 6.2 Run `cd gdfkube-src/gdfkube-itsm && npm test` and confirm the full SPA test suite is green.
- [x] 6.3 Run `grep -rn "Keycloak" gdfkube-src/gdfkube-itsm/src/` and confirm zero hits in `NewGroupPage.tsx` and `NewGroupPage.test.tsx`.
- [x] 6.4 Run `grep -rn "four artifacts\|four files\|four target paths\|four target manifests\|four lines" openspec gdfkube-src/gdfkube-itsm` and confirm zero hits.
- [ ] 6.5 Manual SPA smoke: open the New Group page in dev mode (`npm run dev` under `gdfkube-src/gdfkube-itsm/`) and verify the preview shows exactly three lines (AppProject, MCSB, Git repo) and the help text below the id input no longer mentions Keycloak.
- [x] 6.6 Run `pre-commit run --all-files` and confirm green before pushing.
