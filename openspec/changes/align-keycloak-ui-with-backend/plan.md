# Align Keycloak UI with backend — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development
> to implement this plan task-by-task.

**Goal:** Make the SPA's New Group preview list the three artifacts the backend actually provisions (AppProject, ManagedClusterSetBinding, Git repo), pin the corrected behavior with regression tests, and align 15 OpenSpec doc lines to match.

**Architecture:** No architectural change. SPA edits to one component + one test file in `gdfkube-src/gdfkube-itsm/src/admin/`, plus surgical Markdown edits across `openspec/specs/itsm-admin-users/spec.md`, the archived `openspec/changes/archive/2026-05-14-auto-provision-org-resources-from-group-events/` folder, and `openspec/changes/remove-deadcode-group-admin-controls/specs/itsm-admin-users/spec.md`. No backend, Helm, Camel route, Kafka, or MongoDB change.

**Tech Stack:** React + TypeScript + Vitest + React Testing Library for the SPA; Markdown + OpenSpec for docs.

---

## Task 1: SPA — NewGroupPage source edits

Target: `gdfkube-src/gdfkube-itsm/src/admin/NewGroupPage.tsx`. The data-testid `group-preview` is already on the wrapper `<div>` at line 120, so task 1.4 of `tasks.md` is already satisfied — no new attribute needed.

- [ ] **Step 1:** Edit the file-header comment (lines 4–7). Replace:
  ```
  // from id when the repo has not been edited manually). A "Resources that
  // will be created" preview block lists the four artifacts the Camel
  // automation will provision: Keycloak group, AppProject,
  // ManagedClusterSetBinding ({id} → {id}), Git repo.
  ```
  with:
  ```
  // from id when the repo has not been edited manually). A "Resources that
  // will be created" preview block lists the three artifacts the Camel
  // automation will provision: AppProject, ManagedClusterSetBinding
  // ({id} → {id}), Git repo.
  ```
- [ ] **Step 2:** Edit line 98 (help text under the ID input). Replace:
  ```tsx
  <div className="help">Auto-derived from Display name. Used for Keycloak group, repo, and AppProject names.</div>
  ```
  with:
  ```tsx
  <div className="help">Auto-derived from Display name. Used for repo and AppProject names.</div>
  ```
- [ ] **Step 3:** Edit lines 122–127 (preview `<ul>`). Delete the first `<li>` so the block becomes:
  ```tsx
  <ul className="mono" style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', fontSize: 13 }}>
    <li>AppProject: {idDisplay}-apps</li>
    <li>ManagedClusterSetBinding: {idDisplay} → {idDisplay}</li>
    <li>Git repo: {repoDisplay}</li>
  </ul>
  ```
- [ ] **Step 4:** From the worktree root, run `grep -n "Keycloak" gdfkube-src/gdfkube-itsm/src/admin/NewGroupPage.tsx` and confirm zero hits.

---

## Task 2: SPA — NewGroupPage test edits (TDD: write the assertions first, then re-run after Task 1)

Target: `gdfkube-src/gdfkube-itsm/src/admin/__tests__/NewGroupPage.test.tsx`.

- [ ] **Step 1:** Replace the test at lines 80–89 (currently titled `'preview block renders four lines: …'`) with:
  ```tsx
  it('preview block renders three lines: AppProject / ManagedClusterSetBinding / Git repo (no Keycloak)', () => {
    render(withProvider(makeState(), <NewGroupPage onClose={vi.fn()} />));
    typeName('Cultura');

    const preview = screen.getByTestId('group-preview');
    expect(preview.textContent).toMatch(/AppProject:\s*cultura-apps/);
    expect(preview.textContent).toMatch(/ManagedClusterSetBinding:\s*cultura\s*→\s*cultura/);
    expect(preview.textContent).toMatch(/Git repo:\s*gdfkube-cultura/);
    expect(preview.textContent).not.toMatch(/Keycloak group/i);
    expect(preview.querySelectorAll('li')).toHaveLength(3);
  });
  ```
- [ ] **Step 2:** Replace line 142 (inside the last test, `'Display name with spaces and punctuation derives kebab-case ID'`) so the kebab-case assertion no longer touches Keycloak. Change:
  ```tsx
  expect(preview.textContent).toMatch(/Keycloak group:\s*gdf-min-da-fazenda/);
  ```
  to:
  ```tsx
  expect(preview.textContent).toMatch(/AppProject:\s*min-da-fazenda-apps/);
  ```
- [ ] **Step 3:** Run `cd gdfkube-src/gdfkube-itsm && npm test -- --run NewGroupPage` and confirm both tests pass. (If they fail because Task 1 hasn't been done yet, complete Task 1 first — TDD red → green.)

---

## Task 3: OpenSpec — `itsm-admin-users` published spec

Target: `openspec/specs/itsm-admin-users/spec.md`. Verified line numbers match the audit plan.

- [ ] **Step 1:** Edit line 64 (A-4). Replace:
  ```
  preview of the Keycloak group, repo, AppProject, and ManagedClusterSetBinding to be created.
  ```
  with:
  ```
  preview of the repo, AppProject, and ManagedClusterSetBinding to be created.
  ```
- [ ] **Step 2:** Edit line 108 (A-9). Replace `MUST list four lines` with `MUST list three lines`.
- [ ] **Step 3:** Delete line 109 (A-10) — the bullet:
  ```
  - `Keycloak group: gdf-{id}`
  ```
- [ ] **Step 4:** Delete line 120 (A-11) — the scenario assertion:
  ```
  - **THEN** an element with text `Keycloak group: gdf-cultura` is present
  ```
  Also rewrite the leading `THEN` on what was line 121 (`**AND** an element with text \`AppProject: cultura-apps\` is present`) so it becomes the new `**THEN**` for the scenario:
  ```
  - **THEN** an element with text `AppProject: cultura-apps` is present
  ```
- [ ] **Step 5:** Run `grep -n "Keycloak" openspec/specs/itsm-admin-users/spec.md` and confirm zero hits.

---

## Task 4: OpenSpec — archived `auto-provision-org-resources-from-group-events` folder

Note: This change is already archived. The edits below correct the historical record so archive docs no longer contradict backend reality. All targets live under `openspec/changes/archive/2026-05-14-auto-provision-org-resources-from-group-events/`.

- [ ] **Step 1:** `proposal.md` line 3 (A-27): change `four artifacts` to `three artifacts`.
- [ ] **Step 2:** `proposal.md` line 94 (A-28): change `the four files` to `the three files`.
- [ ] **Step 3:** `design.md` line 5 (A-29): change `four artifacts (Keycloak group / AppProject / ManagedClusterSetBinding / Git repo)` to `three artifacts (AppProject / ManagedClusterSetBinding / Git repo)`.
- [ ] **Step 4:** `design.md` line 20 (A-30): change `the four target files` to `the three target files`.
- [ ] **Step 5:** `design.md` line 89 (A-31): change `the four files at orgs/cultura/` to `the three files at orgs/cultura/`.
- [ ] **Step 6:** `plan.md` line 6 (A-32): change `four target manifests` to `three target manifests`.
- [ ] **Step 7:** `brainstorm.md` line 14 (A-33): change `four target paths` to `three target paths`.
- [ ] **Step 8:** `brainstorm.md` line 42 (A-34): change `four target paths` to `three target paths`.
- [ ] **Step 9:** `specs/camel-orchestrator-stack/spec.md` line 49 (A-35): change `four target paths` to `three target paths`. The numbered list below this line (with four bullets, one of which is the Keycloak target) MUST also drop the Keycloak target bullet so the list contains three items consistent with the new wording.
- [ ] **Step 10:** `specs/camel-orchestrator-stack/spec.md` line 64 (A-36): change scenario title `writes all four files` to `writes all three files`. Update any `**THEN**` step that enumerates a `Keycloak`-related path inside that scenario so the scenario asserts the three remaining target paths.
- [ ] **Step 11:** Run `grep -n "four\|Keycloak" openspec/changes/archive/2026-05-14-auto-provision-org-resources-from-group-events/` and confirm zero hits (or only hits that are unrelated to the artifact count).

---

## Task 5: OpenSpec — `remove-deadcode-group-admin-controls` spec delta

Target: `openspec/changes/remove-deadcode-group-admin-controls/specs/itsm-admin-users/spec.md`. Verified line numbers above.

- [ ] **Step 1:** Edit line 5 (A-39). Replace:
  ```
  preview of the Keycloak group, repo, AppProject, and ManagedClusterSetBinding to be created.
  ```
  with:
  ```
  preview of the repo, AppProject, and ManagedClusterSetBinding to be created.
  ```
- [ ] **Step 2:** Edit line 24 (A-40). Replace `MUST list four lines` with `MUST list three lines`. Delete the Keycloak bullet currently at line 25 (`- \`Keycloak group: gdf-{id}\``).
- [ ] **Step 3:** Edit line 36 (A-41) — delete the scenario `THEN` assertion `- **THEN** an element with text \`Keycloak group: gdf-cultura\` is present`. Promote what was the following `**AND**` line to be the new `**THEN**` so the scenario remains valid Given/When/Then form.
- [ ] **Step 4:** Run `grep -n "Keycloak\|four lines\|four artifacts" openspec/changes/remove-deadcode-group-admin-controls/specs/itsm-admin-users/spec.md` and confirm zero hits.

---

## Task 6: Verification

- [ ] **Step 1:** Run `openspec validate align-keycloak-ui-with-backend` and confirm it passes.
- [ ] **Step 2:** Run `cd gdfkube-src/gdfkube-itsm && npm test` and confirm the full SPA test suite is green.
- [ ] **Step 3:** Run `grep -rn "Keycloak" gdfkube-src/gdfkube-itsm/src/` and confirm zero hits in `NewGroupPage.tsx` and `NewGroupPage.test.tsx`.
- [ ] **Step 4:** Run `grep -rn "four artifacts\|four files\|four target paths\|four target manifests\|four lines" openspec gdfkube-src/gdfkube-itsm` and confirm zero hits.
- [ ] **Step 5:** Manual smoke: `cd gdfkube-src/gdfkube-itsm && npm run dev`, navigate to Admin → Groups → New Group, type "Cultura", confirm the preview shows exactly three lines (AppProject, MCSB, Git repo) and the ID help text no longer mentions Keycloak.
- [ ] **Step 6:** Run `pre-commit run --all-files` and confirm green.
- [ ] **Step 7:** Commit. Suggested message: `align New Group preview with backend (drop Keycloak; four → three across docs)`.
