# fix-spec-doc-drift Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development
> to implement this plan task-by-task.

**Goal:** Refresh every component doc under `docs/` so its `Implementation Status` badge, `## Specs` backlinks, and `Last validated` date match what is actually in `gdfkube-src/` and `openspec/specs/` as of 2026-05-14, and regenerate `docs/README.md`'s status table to agree.

**Architecture:** Pure documentation sweep. Each doc is edited in-place: replace one header line, insert one new section, refresh one date. `docs/README.md`'s status table column is overwritten verbatim from the per-doc badges. The `gdfkube-architecture-docs` capability spec (created in this change) defines the contract every doc must satisfy after the sweep.

**Tech Stack:** Markdown only. No build, no tests beyond a shell `grep`/`test -f` cross-link check.

---

## Task 1: Per-doc edits — Reference and Implemented set (`00`, `01`, `02`, `03`, `05`, `08`)

Each step edits one doc. Use the Edit tool. After each step, the doc has a correct badge, a `## Specs` section per design.md §D4, and `Last validated: 2026-05-14`.

- [ ] **Step 1:** `docs/00-architecture-overview.md` — replace the existing `> **Implementation Status:** ...` line with `> **Implementation Status:** Reference`. Replace `> **Last validated:** 2026-05-05` with `> **Last validated:** 2026-05-14`. Do **not** add a `## Specs` section (per design §D4: overview points to the index, not individual specs).
- [ ] **Step 2:** `docs/01-itsm-portal.md` — change badge to `Implemented`. Refresh date. Insert a `## Specs` section after the header block and before `## Role in the Pipeline`, listing 11 ITSM specs alphabetised:
  ```markdown
  ## Specs

  - [`itsm-admin-forms`](../openspec/specs/itsm-admin-forms/spec.md)
  - [`itsm-admin-settings`](../openspec/specs/itsm-admin-settings/spec.md)
  - [`itsm-admin-users`](../openspec/specs/itsm-admin-users/spec.md)
  - [`itsm-approvals-queue`](../openspec/specs/itsm-approvals-queue/spec.md)
  - [`itsm-container-image`](../openspec/specs/itsm-container-image/spec.md)
  - [`itsm-dashboard`](../openspec/specs/itsm-dashboard/spec.md)
  - [`itsm-portal-shell`](../openspec/specs/itsm-portal-shell/spec.md)
  - [`itsm-request-detail`](../openspec/specs/itsm-request-detail/spec.md)
  - [`itsm-request-submission`](../openspec/specs/itsm-request-submission/spec.md)
  - [`itsm-requests-list`](../openspec/specs/itsm-requests-list/spec.md)
  - [`itsm-service-catalog`](../openspec/specs/itsm-service-catalog/spec.md)
  ```
- [ ] **Step 3:** `docs/02-express-api.md` — badge `Implemented`, refresh date, `## Specs` section with the single entry ``- [`itsm-express-api`](../openspec/specs/itsm-express-api/spec.md)``.
- [ ] **Step 4:** `docs/03-mongodb.md` — badge `Implemented`, refresh date, `## Specs` section listing 8 specs alphabetised:
  ```markdown
  ## Specs

  - [`gdfkube-audit-log-collection`](../openspec/specs/gdfkube-audit-log-collection/spec.md)
  - [`gdfkube-dlq-log-collection`](../openspec/specs/gdfkube-dlq-log-collection/spec.md)
  - [`itsm-forms-collection`](../openspec/specs/itsm-forms-collection/spec.md)
  - [`itsm-groups-collection`](../openspec/specs/itsm-groups-collection/spec.md)
  - [`itsm-requests-collection`](../openspec/specs/itsm-requests-collection/spec.md)
  - [`itsm-settings-collection`](../openspec/specs/itsm-settings-collection/spec.md)
  - [`itsm-users-collection`](../openspec/specs/itsm-users-collection/spec.md)
  - [`mongodb-replica-set-stack`](../openspec/specs/mongodb-replica-set-stack/spec.md)
  ```
- [ ] **Step 5:** `docs/05-kafka.md` — badge `Implemented`, refresh date, `## Specs` section with the single entry ``- [`kafka-broker-stack`](../openspec/specs/kafka-broker-stack/spec.md)``.
- [ ] **Step 6:** `docs/08-git.md` — badge `Implemented`, refresh date, `## Specs` section with the single entry ``- [`gitea-stack`](../openspec/specs/gitea-stack/spec.md)``.

**Commit point:** stage tasks 1.1–1.14 together with task 2 in one commit (per tasks.md task 4.3) — do not commit mid-sweep.

---

## Task 2: Per-doc edits — Partially implemented set (`04`, `06`, `07`)

- [ ] **Step 1:** `docs/04-debezium.md` — badge `Partially implemented`, refresh date, `## Specs` section with the single entry ``- [`debezium-connect-stack`](../openspec/specs/debezium-connect-stack/spec.md)``.
- [ ] **Step 2:** `docs/06-camel.md` — badge `Partially implemented`, refresh date, `## Specs` section with the single entry ``- [`camel-orchestrator-stack`](../openspec/specs/camel-orchestrator-stack/spec.md)``.
- [ ] **Step 3:** `docs/07-helm.md` — badge `Partially implemented`, refresh date, `## Specs` section with body `_No specs yet — this component is not contracted._` (no spec exists for the Helm template-only model).

---

## Task 3: Per-doc edits — Planned and Deferred set (`09`, `10`, `11`, `12`, `13`)

- [ ] **Step 1:** `docs/09-argocd.md` — badge `Planned`, refresh date, `## Specs` section body `_No specs yet — this component is not contracted._`.
- [ ] **Step 2:** `docs/10-rhacm.md` — same shape as 9.
- [ ] **Step 3:** `docs/11-hypershift.md` — same shape as 9.
- [ ] **Step 4:** `docs/12-security-rbac.md` — same shape as 9.
- [ ] **Step 5:** `docs/13-observability.md` — badge `Deferred`, leave `Last validated:` empty or omit (per spec requirement: `Deferred` MAY omit), `## Specs` section body `_No specs yet — this component is not contracted._`.

---

## Task 4: Update `docs/README.md`

- [ ] **Step 1:** Read `docs/README.md`. Locate the index table (the `| # | Doc | Status |` block).
- [ ] **Step 2:** Overwrite the `Status` column for each row so the values match what tasks 1–3 wrote into the per-doc badges:
  - `00` → `Reference`
  - `01` → `Implemented`
  - `02` → `Implemented`
  - `03` → `Implemented`
  - `04` → `Partially implemented`
  - `05` → `Implemented`
  - `06` → `Partially implemented`
  - `07` → `Partially implemented`
  - `08` → `Implemented`
  - `09` → `Planned`
  - `10` → `Planned`
  - `11` → `Planned`
  - `12` → `Planned`
  - `13` → `Deferred`
- [ ] **Step 3:** In the "Conventions" → "Status badges" list, add one bullet immediately after the existing `Implemented` bullet:
  > `Partially implemented` — code or configuration exists but not yet end-to-end; see the doc for what is and isn't shipped.
- [ ] **Step 4:** Leave the intro paragraph, "Decisions Resolved" / "Open Questions" rules, and "Authoring Rules" sections untouched.

---

## Task 5: Cross-link sanity check

Run from the repository root. All three commands must return zero stderr and the expected output described.

- [ ] **Step 1:** `for s in $(grep -hoE 'openspec/specs/[a-z0-9-]+/spec\.md' docs/*.md); do test -f "$s" || echo "MISSING: $s"; done` — expect **no output**. If any line is printed, the spec slug in the doc is wrong; fix the doc before proceeding.
- [ ] **Step 2:** `grep -hoE 'Implementation Status:\*?\*? *[A-Z][a-zA-Z ]*' docs/*.md | sort -u` — every line must end with one of `Implemented`, `Partially implemented`, `Planned`, `Deferred`, `Reference`. Anything else is a violation of the `gdfkube-architecture-docs` spec and must be corrected.
- [ ] **Step 3:** `grep -hE 'Last validated:?\*?\*? +2026-' docs/*.md | sort -u` — every populated date must read `2026-05-14`. (`13-observability.md` is allowed to have an absent line; it should not appear in this output.)

---

## Task 6: Commit and PR

- [ ] **Step 1:** `pre-commit run --all-files` — must exit 0 (per CLAUDE.md `## Git`).
- [ ] **Step 2:** `git status` — confirm staged files are exactly `docs/README.md`, `docs/0*.md`, `docs/1*.md`, and the `openspec/changes/fix-spec-doc-drift/` tree. Nothing under `gdfkube-src/`, `openspec/specs/`, or `openspec/changes/archive/` should be staged.
- [ ] **Step 3:** Commit with subject `docs: refresh status badges and add spec backlinks`. Body: a 1-sentence summary plus a pointer to `openspec/changes/fix-spec-doc-drift/design.md` for the per-doc rationale tables.
- [ ] **Step 4:** Open PR against `main`. Reviewer instructions: cross-check the diff against `design.md` §D3 (status mapping) and §D4 (spec mapping); spot-check three of the new doc → spec links resolve in GitHub's rendered view.

---

## Definition of Done

All of the following must hold before this change is marked complete in verify.md:

1. Each row in design.md §D3 matches the badge that landed in the corresponding doc.
2. Each spec listed in design.md §D4 appears in the corresponding doc's `## Specs` section, alphabetised, with a working relative link.
3. `docs/README.md`'s status table matches the per-doc badges row-for-row.
4. Task 5 commands all report success.
5. `openspec validate "fix-spec-doc-drift"` reports the change is valid.
6. The commit touches no files outside `docs/` and `openspec/changes/fix-spec-doc-drift/`.
