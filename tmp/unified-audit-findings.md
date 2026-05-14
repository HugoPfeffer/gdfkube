# gdfkube — Unified Audit Findings

**Date:** 2026-05-14  
**Sources:** `CODEBASE-AUDIT-2026-05-14.md`, `REPORT-ISSUES.md` (2026-05-05), `placeholder-report.md`  
**Branch:** `main` @ `2dbcb31`  
**Decisions:** Recorded inline where owner input resolved ambiguity.

---

## Critical (5)

**C-1. Repo-name split-brain.**  
`RepoBootstrapRoute.java:50` uses `<owner>-<org>`; `OrgBootstrapRoute.java:112` uses `gdfkube-<groupId>`.  
`argocd-org/applicationset.yaml` references `gdfkube-{{ .Values.meta.org }}.git` (matches OrgBootstrapRoute).  
**Decision:** Standardize on `gdfkube-<groupId>`. Unify in a shared helper consumed by both routes.  
*Audit: F-1, X-6, F-7*

**C-2. Form ID / chart name mismatch breaks scale rendering.**  
`forms.json:137-138` declares `_id: scale-request`; chart directory is `charts/scale-patch/`; `HelmValuesBuilder.getChartRef()` returns `event.formId`.  
**Decision:** Rename chart directory `scale-patch` → `scale-request`. Update `Chart.yaml:2` name field.  
*Audit: I-1*

**C-3. SPA POST `_id` vs service reads `body.id`.**  
`NewUserPage.tsx:50-60` posts `{ _id: username }` but `userAdminService.ts:27` reads `body.id`. Same in `NewGroupPage.tsx:46` ↔ `groupAdminService.ts:15`. Mongoose auto-generates ObjectId; demo-friendly IDs lost.  
**Decision:** Standardize on `id`. Fix SPA to send `{ id: ... }` instead of `{ _id: ... }`. Add POST body assertions in `NewGroupPage.test.tsx` / `NewUserPage.test.tsx`.  
*Audit: D-6, D-15*

**C-4. `dbz.gdfkube.groups` consumed but never declared as Kafka topic.**  
`OrgBootstrapRoute.java:69` consumes it; `kafka/init-topics.sh:30-44` only creates `dbz.gdfkube.requests` and `dbz.gdfkube.forms`. Relies on broker `auto.create.topics.enable=true`.  
**Fix:** Add `dbz.gdfkube.groups` and `dlq.gdfkube.groups` to `init-topics.sh`.  
*Audit: I-2, F-19*

**C-5. `debezium_signals` collection never created.**  
`connector-config.json:10` points at `gdfkube.debezium_signals`; `init-camel-collections.js` only creates `audit_log`/`dlq_log` + pre-images.  
**Fix:** Add `db.createCollection("debezium_signals")` to `init-camel-collections.js`.  
*Audit: I-3*

---

## High (14)

**H-1. Keycloak group promised in UI but never provisioned.**  
`NewGroupPage.tsx:123` shows "Keycloak group: gdf-{id}" in the preview. No Keycloak route or chart exists anywhere in the Camel module. Spec (`spec.md:387`) correctly says three files.  
**Decision:** Remove the Keycloak line from `NewGroupPage.tsx`. Update `design.md` to acknowledge the gap was only partially closed.  
*Placeholder-report: #1*

**H-2. Verification tasks unchecked — change is code-complete but evidence-pending.**  
`tasks.md` lines 13, 58-63: `mvnw test`, `mvnw verify`, `npm test`, Debezium restart, SPA E2E, edit-noop — all `[ ]`.  
**Decision:** Run verification before finalizing. Blocking.  
*Audit: X-1; Placeholder-report: #4*

**H-3. MockGitProvider flattens paths; integration test gives false confidence.**  
`MockGitProvider.commitAndPush` (lines 81-86) flattens to `workTree.resolve(file.getFileName())`; real `GiteaGitProvider` preserves relative path. `OrgBootstrapIntegrationTest` asserts only filename presence.  
*Audit: F-8, F-16*

**H-4. Hardcoded `/tmp` paths collide on concurrent re-delivery.**  
`OrgBootstrapRoute.java:147` uses `/tmp/<groupId>-bootstrap-out`; `REPO_LOCKS` guards git workdir, not these temp dirs.  
*Audit: F-9*

**H-5. OrgBootstrapRoute leaks rendered manifests in `/tmp`.**  
Cleans `valuesPath` but never deletes `outputDir`. Peer route `HelmRenderRoute` cleans up via `.onCompletion()`.  
*Audit: F-3; Placeholder-report: #3*

**H-6. DLQ test `helmRenderFailure_dlq` does not assert DLQ delivery.**  
Swallows exception in `try/catch(ignored)`; only asserts `verify(helmTemplateRunner, atLeastOnce()).render(...)`. DLQ topic, 9 mandatory headers never checked. Task 5.8 marked `[x]` but unfulfilled.  
*Audit: F-17; Placeholder-report: #2*

**H-7. `formId` value contract mismatch.**  
Chart defaults declare `meta.formId: "org-onboard"`; `HelmValuesBuilder.buildForOrg` writes `"org-bootstrap"`. No template uses `formId` today, but signals drift.  
*Audit: F-5*

**H-8. `gitea_settings.endpoint` written twice with different values.**  
`seed-data/settings.json:3` → `https://gitea-gitea.apps.gdfkube.gov`; `gitea/sync-token.sh:14` overwrites to `http://gitea:3000`. Seed value is dead.  
**Status:** Flagged for investigation — need to determine canonical hostname by context (internal backend vs external UI).  
*Audit: I-4, I-5, I-16*

**H-9. MongoDB README documents stale roles.**  
`mongodb/README.md:49` lists `operator, admin, approver, service`; actual enum is `operator | admin` only.  
*Audit: I-6*

**H-10. Groups pre-image enabled but CDC docs omit it.**  
`init-camel-collections.js:25` enables pre-image on `groups`; `debezium/README.md`, `kafka/README.md`, `mongodb/README.md` all list only `requests` and `forms`.  
*Audit: I-7*

**H-11. `dedupCache` updated before work succeeds.**  
`OrgBootstrapRoute.java:109` puts in cache before helm/git complete. Redelivery within 60s after failure is silently dropped.  
*Audit: F-12*

**H-12. Dedup TTL never tested.**  
`replayWithinTtl_dedupedByCache` sends two events back-to-back; no negative case advancing clock past 60s. `TTL_MS` and `evictExpired()` are untested.  
*Placeholder-report: #5*

**H-13. `remove-deadcode-group-admin-controls` verification tasks unchecked.**  
Tasks 6.5, 6.6, 6.8 (manual SPA verification, `pre-commit run --all-files`) are `[ ]`.  
*Audit: X-2*

**H-14. `audit-sink` spec omits `org-bootstrap` as audit producer.**  
`spec.md:213` enumerates `helm-render, git-push, repo-bootstrap, status-emitter`; `OrgBootstrapRoute` emits `create-repo` / `noop` / `bootstrap` events not in the requirement.  
*Audit: X-3*

---

## UX — Layout & Shell (from REPORT-ISSUES, confirmed still valid)

**UX-P0-1. `.app` CSS-grid layout unused.** `App.tsx` wraps in unstyled `.app-shell > .shell > .main-col`; reference's 3-row utility/sidebar/topbar/main grid never engages.  
**UX-P0-2. Density tweak has no effect.** Emits `density-*` class but only `[data-density="compact"]` exists in CSS.  
**UX-P0-3. Tweaks panel is a different component.** Hand-rolled drawer vs reference's floating `twk-*` panel with drag-positioning and host postMessage protocol.  
**UX-P0-4. Pulse animation default 3x slower.** `4s` vs reference `1.4s`.  
**UX-P0-5. Dashboard banner not rendered as `.banner`.** Plain card instead of dark gradient banner block.  
**UX-P0-6. Dashboard "New cluster request" CTA missing.**  
**UX-P0-7. Dashboard `.detail-grid` collapsed.** Side-by-side → vertical stack.  
**UX-P0-8. RequestsList tabs and toolbar missing.**  
**UX-P0-9. RequestsList table reduced from 9 to 5 columns.**  
**UX-P0-10. Detail header gutted.** Missing pill, title, "Submitted by", action buttons.  
**UX-P0-11. Pipeline header/progress bar missing.**  
**UX-P0-12. Cluster Access card always present.** Should only show when `status === "ready"`.

**UX-P1 summary (36 items):** Host protocol absent in useTweaks; ~50 JSX classes with no CSS rules; StatusPill class/label/coverage drift; Catalog tiles drop meta row and shortTitle; Catalog missing empty state; filter chip order drift; approval-chain semantics inverted; queue header KPIs absent; decision panel header drift; reject-without-comment guard missing; "What happens next" card removed; Kafka topic footer removed; admin sub-features missing (Fields/Template tabs, Submissions column, Reload-from-Git/Save buttons, Add-field, MongoDB shape preview, Template tabs, Camel/Git info banner, click-to-copy variable rows).

---

## Medium (25)

**M-1.** Dead parameter `groupRepo` in `HelmValuesBuilder.buildForOrg` — read at OrgBootstrapRoute:102, ignored at HelmValuesBuilder:68. *(F-2)*  
**M-2.** `system.labels` over-labels org charts with extra `clusterset` label. *(F-6)*  
**M-3.** Empty `*-clusterset.yaml` committed without validation when no rhacm files found. *(F-10)*  
**M-4.** `op == null` accepted as create in `processGroupEvent`. *(F-11)*  
**M-5.** `UserEditor.handleSave` omits `fullName` and `active` despite server whitelist. *(D-7)*  
**M-6.** Group PATCH whitelist has more keys than SPA sends (`users, forms, clusters` unused from UI). *(D-8)*  
**M-7.** Silent error catches on create in `NewUserPage` and `NewFormPage` — no toast, no log. `NewGroupPage` does it correctly. *(D-12)*  
**M-8.** `GroupEditor`/`UserEditor` discard server response — no round-trip of server normalization. *(D-17)*  
**M-9.** `GroupEditor.test.tsx` never asserts PATCH body shape — extra keys slip through. *(D-14)*  
**M-10.** Namespace naming has three different conventions across Camel, charts, and forms.json. *(I-8)*  
**M-11.** `argocd-org`/`rhacm-org` values.yaml omit `vars:` while every other chart includes {meta, vars, system}. *(I-9)*  
**M-12.** `releaseImage`/`system.baseDomain` injected universally but only defined in one chart. *(I-10)*  
**M-13.** Hardcoded broker/mongo/gitea hosts duplicated across 5+ files with no shared include. *(I-11)*  
**M-14.** `requests` indexes scattered + README documents `idx_createdAt` while actual indexed field is `submittedAt`. *(I-12)*  
**M-15.** `HelmValuesBuilderTest` does not cover `clusterset` label leakage on `buildForOrg`. *(F-18)*  
**M-16.** Form fields lack inline error display — only computes `isValid`, never renders `validateField` output. *(REPORT-ISSUES P2)*  
**M-17.** Default field values not seeded — `GenericRequest` initializes `useState<FormValues>({})` empty. *(REPORT-ISSUES P2)*  
**M-18.** `Group.clusters/users/forms` schema mismatch — `Schema.Types.Mixed` server-side, `number` in SPA types, arrays in tests. *(D-9)*  
**M-19.** `NewGroupPage` merges `created.* ?? local` after create — if server omits a field, local guess wins with no refetch. *(D-18)*  
**M-20.** `itsmApi.ts:64-77` swallows non-JSON 5xx body parsing errors — only statusText reaches UI. *(D-13)*  
**M-21.** `server/__tests__/users.test.ts` does not exercise whitelist entries added by commit `19c7371`. *(D-16)*  
**M-22.** `GenericRequest.tsx:97` defaults `env` to `production` — reference defaults to `development`. **Status:** Flagged for investigation (may still cause accidental production requests in demo). *(REPORT-ISSUES cross-cutting)*  
**M-23.** `GenericRequest.tsx:115-132` hard-codes `'saude'` group fallback. Brittle demo artifact. *(REPORT-ISSUES cross-cutting)*  
**M-24.** Stale "four artifacts" copy in `proposal.md:3,25` — actual implementation and spec both say three. *(X-4)*  
**M-25.** `itsm-admin-users/spec.md:4` still has placeholder `Purpose: TBD`. *(X-5)*

---

## Low (27)

**L-1.** Two sources of truth for "repo was bootstrapped" — both routes call `GitRepoBootstrapper.ensure` with different stage numbers. *(F-4)*  
**L-2.** `HelmTemplateRunner` has no bound on captured stdout bytes. *(F-13)*  
**L-3.** Kafka consumer `groupId=gdfkube-camel` shared across three routes — concurrency limits interleaved. *(F-14)*  
**L-4.** DLQ topic naming inconsistency — `dlq.gdfkube.groups` vs `dlq.gdfkube.<route-id>` pattern. *(F-15)*  
**L-5.** `node.path("repo")` read but dead. *(F-20)*  
**L-6.** `adminSeeds.ts` dead code (~140 lines). **Decision:** Keep as-is for local development. *(D-1, D-2, D-10)*  
**L-7.** Slug derivation reimplemented inline in `NewUserPage` instead of reusing `slug.ts`. *(D-3)*  
**L-8.** `RadioCard` duplicated between `UserEditor` and `NewUserPage`. *(D-4)*  
**L-9.** "Live entity" pattern duplicated in `GroupEditor`/`UserEditor`. *(D-5)*  
**L-10.** `UserEditor.tsx:238-239` uncontrolled password input never read or submitted. *(D-11)*  
**L-11.** `UserEditor.handleDisable` writes `active: false` — no test covers this path. *(D-19)*  
**L-12.** `App.tsx:64` falls back to `user.name` when `username` missing — display name in header causes 401. *(D-20)*  
**L-13.** `App.tsx:52-58` non-null assertion `data.users[0]!` crashes if users array is empty. *(D-21)*  
**L-14.** `mongodb/README.md` duplicates "Tearing down" section. *(I-13)*  
**L-15.** `charts/scale-patch/Chart.yaml:3` description says "NodePool patch" but template emits full NodePool manifest. *(I-14)*  
**L-16.** `seed-collections.js:11,34` uses Node `process.env`/`fs.readFileSync` inside mongosh. *(I-15)*  
**L-17.** `forms.json:54` template uses stale hostname `https://git.gdfkube.gov/`. *(I-16)*  
**L-18.** `seed-data/settings.json:5` `"token": "CHANGE_ME"` — consider `# trufflehog:ignore`. *(X-9)*  
**L-19.** Same logical entity has three surface names (`_id`, `requesterGroupName`, `groupId`). *(X-7)*  
**L-20.** Two release-naming conventions — `<groupId>-bootstrap` vs `appset-{{ meta.requesterGroupName }}-...`. *(X-8)*  
**L-21.** StatusPill labels drift ("Awaiting approval" vs "Approval pending"). *(REPORT-ISSUES P1)*  
**L-22.** StatusPill missing `pending`, `healthy`, `degraded` variants. *(REPORT-ISSUES P1)*  
**L-23.** Catalog tiles drop `meta` row and shortTitle override. *(REPORT-ISSUES P1)*  
**L-24.** Catalog missing empty state. *(REPORT-ISSUES P1)*  
**L-25.** Submit button label and loading state simplified vs reference. *(REPORT-ISSUES P3)*  
**L-26.** PayloadPreview unstyled `<pre>` vs reference dark-theme + injected IDs. *(REPORT-ISSUES P3)*  
**L-27.** Duplicate `@keyframes pulse` in styles.css. *(REPORT-ISSUES P3)*

---

## Severity tally

| Severity | Count |
|----------|-------|
| Critical | 5 |
| High | 14 |
| UX-P0 | 12 |
| UX-P1 | 36 (summarized) |
| Medium | 25 |
| Low | 27 |

---

## Quickest wins (ranked by effort/impact)

1. **C-3** — Fix SPA to send `id` instead of `_id` in `NewUserPage`/`NewGroupPage`. Add POST body assertions in tests. One-line change + one-line test each.
2. **C-4** — Add `dbz.gdfkube.groups` and `dlq.gdfkube.groups` to `kafka/init-topics.sh`. Two lines.
3. **C-5** — Add `db.createCollection("debezium_signals")` to `init-camel-collections.js`. One line.
4. **H-1** — Remove Keycloak line from `NewGroupPage.tsx:123`. One line.
5. **C-2** — Rename chart directory `scale-patch` → `scale-request`, update `Chart.yaml:2`. File rename + one-line edit.
6. **C-1** — Extract `getRepoName(groupId)` → `"gdfkube-" + groupId` into shared helper, consume from both routes.
7. **H-9** — Fix role list in `mongodb/README.md` to `operator | admin`.
8. **M-7** — Add toast to `NewUserPage`/`NewFormPage` error catches (match `NewGroupPage` pattern).

## Open investigations

| ID | Question | Context |
|----|----------|---------|
| H-8 | Canonical Gitea hostname | `http://gitea:3000` (internal) vs `https://gitea-gitea.apps.gdfkube.gov` (external) — determine which contexts use which |
| M-22 | `env` default `production` vs `development` | Check whether this persists post-Express API and whether it affects real demo flows |
| M-23 | `saude` group fallback | Determine if this is still reachable or dead after Express API migration |

## Decisions log

| Item | Decision | Rationale |
|------|----------|-----------|
| Repo naming (C-1) | `gdfkube-<groupId>` | Matches ArgoCD ApplicationSet references |
| Scale chart (C-2) | Rename chart → `scale-request` | Align chart to form ID (form is source of truth) |
| POST field (C-3) | Use `id` | Fix SPA to match service layer expectation |
| Keycloak (H-1) | Remove from UI | No backend implementation exists; acknowledge gap |
| adminSeeds.ts (L-6) | Keep | Useful for local development despite CLAUDE.md tension |
| UX findings | Include | Still valid; tracked separately in UX-P0/P1 sections |
| Verification (H-2) | Run before ship | Change is code-complete but evidence-pending |

---

## Amendments required

Specific doc/spec/README locations that contain misleading or leftover information based on the audit decisions above. Grouped by file, each entry quotes the current text, describes the needed change, and traces back to the originating decision.

---

### `openspec/specs/camel-orchestrator-stack/spec.md`

**A-1. Line 148 — Chart name `scale-patch` should be `scale-request`** *(C-2)*

Current:
> `| scale-patch/ | NodePool replica patch |`

Change to: `| scale-request/ | NodePool replica count request |`

Rationale: Decision C-2 renamed the chart directory from `scale-patch` to `scale-request` to match the `forms.json` form ID.

---

**A-2. Line 214 — Audit-sink producer list omits `org-bootstrap`** *(H-14)*

Current:
> `A Camel-internal AuditInterceptor bean MUST emit one audit event to gdfkube.audit per execution of each side-effecting route (helm-render, git-push, repo-bootstrap, status-emitter).`

Change: Add `org-bootstrap` to the parenthetical list: `(helm-render, git-push, repo-bootstrap, status-emitter, org-bootstrap)`.

Rationale: `OrgBootstrapRoute` emits `create-repo`, `noop`, and `bootstrap` audit events. The requirement's enumeration must include it.

---

### `openspec/specs/itsm-admin-users/spec.md`

**A-3. Lines 3-4 — Purpose placeholder still reads `TBD`** *(M-25)*

Current:
> `## Purpose`
> `TBD - created by archiving change build-itsm-portal. Update Purpose after archive.`

Change: Replace with a concrete purpose statement, e.g.: "Defines the ITSM admin Users and Groups management surfaces: user/group listing, per-entity editors, create flows, role and search filters, and the new-group resource-creation preview."

---

**A-4. Line 64 — Preview description includes Keycloak** *(H-1)*

Current:
> `plus a live preview of the Keycloak group, repo, AppProject, and ManagedClusterSetBinding to be created.`

Change: Remove "Keycloak group": `plus a live preview of the repo, AppProject, and ManagedClusterSetBinding to be created.`

---

**A-5. Line 81 — UserEditor radio-cards list four roles including `approver` and `service`** *(H-9 / CLAUDE.md)*

Current:
> `the editor MUST render role as a row of radio-cards (one per role: operator / approver / admin / service)`

Change: Restrict to the actual enum: `(one per role: operator / admin)`.

Rationale: CLAUDE.md declares the role enum is exactly `operator | admin`. `approver` and `service` do not exist.

---

**A-6. Line 94 — Scenario dispatches non-existent role `approver`** *(H-9 / CLAUDE.md)*

Current:
> `- WHEN the user clicks the radio-card labeled "Approver"`
> `- THEN UPDATE_USER is dispatched with {username: "m.costa", patch: {role: "approver"}}`

Change: Use a valid role, e.g. "Operator" with `{role: "operator"}`.

---

**A-7. Line 98 — Info banner describes four role descriptions including `approver` and `service`** *(H-9 / CLAUDE.md)*

Current:
> `"Operator submits requests · Approver reviews and approves · Admin manages forms and users · Service is for automation accounts"`

Change: Remove non-existent roles. E.g.: `"Operator submits requests · Admin manages forms, users, and approvals"`.

---

**A-8. Lines 100-104 — Scenario asserts text for non-existent roles** *(H-9 / CLAUDE.md)*

Current:
> `- THEN an element with text matching "Operator submits requests" is present`
> `- AND elements with text matching "Approver reviews", "Admin manages forms", "Service is for" are also present`

Change: Remove "Approver reviews" and "Service is for" assertions. Keep "Operator submits requests" and "Admin manages forms".

---

**A-9. Line 108 — Preview says "four lines" but should be three after Keycloak removal** *(H-1 / M-24)*

Current:
> `The "Resources that will be created" preview block on the NewGroupPage MUST list four lines`

Change: Replace "four lines" with "three lines".

---

**A-10. Line 109 — Keycloak line in preview list** *(H-1)*

Current:
> `- Keycloak group: gdf-{id}`

Change: Delete this line entirely. The remaining preview lines are: AppProject, ManagedClusterSetBinding, Git repo.

---

**A-11. Line 120 — Scenario asserts Keycloak text** *(H-1)*

Current:
> `- THEN an element with text Keycloak group: gdf-cultura is present`

Change: Remove this assertion line from the scenario.

---

### `openspec/specs/itsm-groups-collection/spec.md`

**A-12. Lines 85-92 — "Groups Not in CDC Include List" requirement is stale** *(H-10 / C-4)*

Current:
> `### Requirement: Groups Not in CDC Include List`
> `The gdfkube.groups collection SHALL NOT appear in Debezium's collection.include.list.`

Change: Delete or rewrite this entire requirement. Groups ARE now in the CDC include list (`gdfkube.requests,gdfkube.forms,gdfkube.groups`) per the `auto-provision-org-resources-from-group-events` change and `debezium-connect-stack/spec.md` line 84.

---

**A-13. Line 48 — POST body uses `_id` instead of `id`** *(C-3)*

Current:
> `- WHEN an admin POSTs { _id: 'novo-org', name: 'Novo Org', users: [], forms: [] }`

Change: Replace `_id` with `id` in the POST body: `{ id: 'novo-org', ... }`.

---

**A-14. Lines 51-52 — Duplicate scenario title and body reference `_id`** *(C-3)*

Current:
> `#### Scenario: POST with duplicate _id returns 409`
> `- WHEN the body's _id matches an existing group`

Change: Replace `_id` with `id` in both the title and body text.

---

### `openspec/specs/itsm-users-collection/spec.md`

**A-15. Line 49 — POST body uses `_id` instead of `id`** *(C-3)*

Current:
> `- WHEN the client POSTs { _id: 'new.user', name: 'New User', ... }`

Change: Replace `_id` with `id`: `{ id: 'new.user', ... }`.

---

**A-16. Lines 57-59 — Duplicate scenario references `_id`** *(C-3)*

Current:
> `#### Scenario: POST with duplicate _id returns 409`
> `- WHEN the body's _id matches an existing user`

Change: Replace `_id` with `id` in both the title and body text.

---

### `openspec/specs/itsm-express-api/spec.md`

**A-17. Line 157 — Forms POST body uses `_id`** *(C-3, consistency)*

Current:
> `- WHEN the client POSTs { _id: 'new-form', name: 'New', topic: 'gdfkube.requests.new', status: 'active', fields: [...] }`

Change: Replace `_id` with `id`: `{ id: 'new-form', ... }`.

Note: C-3 explicitly names users and groups, but forms use the same SPA-to-service POST pattern. Applying `id` consistently prevents the same mismatch for forms.

---

**A-18. Line 162 — Forms duplicate scenario references `_id`** *(C-3, consistency)*

Current:
> `- WHEN a POST repeats an existing _id`

Change: Replace `_id` with `id`.

---

### `openspec/specs/itsm-forms-collection/spec.md`

**A-19. Line 43 — Forms collection duplicate scenario references `_id`** *(C-3, consistency)*

Current:
> `- WHEN a POST repeats an existing _id`

Change: Replace `_id` with `id`.

---

### `openspec/specs/kafka-broker-stack/spec.md`

**A-20. Lines 53-69 — Topic catalog missing `dbz.gdfkube.groups` and `dlq.gdfkube.groups`** *(C-4)*

Current: The requirement title says "All 9 catalog topics" and the topic catalog table lists 9 topics; `dbz.gdfkube.groups` and `dlq.gdfkube.groups` are absent.

Change: Add two rows to the table (with settings matching peer topics):
> `| dbz.gdfkube.groups | 1 | 3 | 604800000 | 2 |`
> `| dlq.gdfkube.groups | 1 | 3 | 2592000000 | 2 |`

Update the requirement title from "All 9 catalog topics" to "All 11 catalog topics".

---

**A-21. Lines 71, 76 — Scenario count says 9, should be 11** *(C-4)*

Current:
> `#### Scenario: All 9 topics exist after kafka-init`
> `... SHALL print all 9 topic names`

Change: Replace both occurrences of `9` with `11`.

---

### `gdfkube-src/gdfkube-infra/mongodb/README.md`

**A-22. Line 49 — Stale role list includes `approver, service`** *(H-9)*

Current:
> `| users | Demo user identities (operator, admin, approver, service) | No |`

Change: Remove non-existent roles: `(operator, admin)`.

---

**A-23. Line 50 — `groups` CDC-watched column says `No`, should be `Yes`** *(H-10)*

Current:
> `| groups | Department/org groups | No |`

Change: Flip the CDC-watched column to `Yes`.

---

**A-24. Lines 52-55 — Text says groups are admin-only and not CDC-watched** *(H-10)*

Current:
> `**CDC-watched** collections (requests, forms) have their changes captured by Debezium and published to Kafka topics. Admin-only collections (users, groups) are managed exclusively through the Express API and are not part of the CDC pipeline.`

Change: Move `groups` to the CDC-watched list; `users` is the only admin-only collection:
> `**CDC-watched** collections (requests, forms, groups) have their changes captured by Debezium and published to Kafka topics. The users collection is managed exclusively through the Express API and is not part of the CDC pipeline.`

---

### `gdfkube-src/gdfkube-infra/debezium/README.md`

**A-25. Lines 39-40 — Topic-prefix mapping omits `groups`** *(H-10)*

Current:
> `- dbz.gdfkube.requests -- CDC events from the requests collection`
> `- dbz.gdfkube.forms -- CDC events from the forms collection`

Change: Add the missing entry:
> `- dbz.gdfkube.groups -- CDC events from the groups collection`

---

### `gdfkube-src/gdfkube-infra/kafka/README.md`

**A-26. Line 16 — Consumer group topic list omits `dbz.gdfkube.groups`** *(H-10)*

Current:
> `| gdfkube-camel | Camel routes | dbz.gdfkube.requests, dbz.gdfkube.forms, dlq.gdfkube.* |`

Change: Add `dbz.gdfkube.groups` to the topics list.

---

### `openspec/changes/auto-provision-org-resources-from-group-events/proposal.md`

**A-27. Line 3 — Says "four artifacts"** *(M-24)*

Current:
> `the SPA's NewGroupPage preview still promises four artifacts that nothing in the system produces today`

Change: Replace "four artifacts" with "three artifacts" -- the preview now lists AppProject, ManagedClusterSetBinding, and Git repo (Keycloak removed per H-1).

---

**A-28. Line 94 — Says "four files"** *(M-24)*

Current:
> `assert the four files appear in gdfkube-orgs`

Change: Replace "four files" with "three files" (`appproject.yaml`, `applicationset.yaml`, `<groupId>-clusterset.yaml`).

---

### `openspec/changes/auto-provision-org-resources-from-group-events/design.md`

**A-29. Line 5 — Says "four artifacts" and includes Keycloak in the parenthetical** *(H-1 / M-24)*

Current:
> `the SPA's NewGroupPage "Resources that will be created" preview still describes four artifacts (Keycloak group / AppProject / ManagedClusterSetBinding / Git repo)`

Change: Remove Keycloak and update count: "three artifacts (`AppProject / ManagedClusterSetBinding / Git repo`)".

---

**A-30. Line 20 — Says "the four target files"** *(M-24)*

Current:
> `idempotently producing the per-org repo + the four target files under orgs/<groupId>/`

Change: Replace "four" with "three".

---

**A-31. Line 89 — Says "the four files"** *(M-24)*

Current:
> `the four files at orgs/cultura/`

Change: Replace "four" with "three".

---

### `openspec/changes/auto-provision-org-resources-from-group-events/plan.md`

**A-32. Line 6 — Says "the four target manifests"** *(M-24)*

Current:
> `the four target manifests under orgs/<groupId>/`

Change: Replace "four" with "three".

---

### `openspec/changes/auto-provision-org-resources-from-group-events/brainstorm.md`

**A-33. Line 14 — Says "four target paths"** *(M-24)*

Current:
> `Idempotency via git-file-exists check at <workTree>/orgs/<groupId>/ against four target paths.`

Change: Replace "four" with "three".

---

**A-34. Line 42 — Says "four target paths"** *(M-24)*

Current:
> `git-file-exists check at the four target paths`

Change: Replace "four" with "three".

---

### `openspec/changes/auto-provision-org-resources-from-group-events/specs/camel-orchestrator-stack/spec.md`

**A-35. Line 49 — Says "four target paths"** *(M-24)*

Current:
> `5. Compute the four target paths under <workTree>/orgs/<groupId>/:`

Change: Replace "four" with "three".

---

**A-36. Line 64 — Scenario title says "writes all four files"** *(M-24)*

Current:
> `#### Scenario: First group event bootstraps both repos and writes all four files`

Change: Replace "four" with "three".

---

### `openspec/changes/auto-provision-org-resources-from-group-events/tasks.md`

**A-37. Line 41 — Test name says "WritesAllFour"** *(M-24)*

Current:
> `5.2 Test firstEvent_bootstrapsBothReposAndWritesAllFour`

Change: Update the test reference to `firstEvent_bootstrapsBothReposAndWritesAllThree`. The actual Java test class name must also be renamed to match.

---

**A-38. Line 47 — Task 5.8 marked `[x]` but DLQ test is unfulfilled** *(H-6)*

Current:
> `- [x] 5.8 Test helmRenderFailure_dlq: make HelmTemplateRunner throw; assert message lands on dlq.gdfkube.groups with the 9 mandatory headers.`

Change: Unmark and note the gap:
> `- [ ] 5.8 Test helmRenderFailure_dlq: ... (Currently only asserts render() was called; DLQ topic and headers are not verified -- see H-6.)`

---

### `openspec/changes/remove-deadcode-group-admin-controls/specs/itsm-admin-users/spec.md`

**A-39. Line 5 — Preview description includes Keycloak** *(H-1)*

Current:
> `plus a live preview of the Keycloak group, repo, AppProject, and ManagedClusterSetBinding to be created.`

Change: Remove "Keycloak group": `plus a live preview of the repo, AppProject, and ManagedClusterSetBinding to be created.`

---

**A-40. Line 24 — Says "four lines" and lists Keycloak** *(H-1 / M-24)*

Current:
> `The "Resources that will be created" preview block on the NewGroupPage MUST list four lines`
> followed by `- Keycloak group: gdf-{id}`

Change: Update count to "three lines" and remove the Keycloak bullet.

---

**A-41. Line 36 — Scenario asserts Keycloak text** *(H-1)*

Current:
> `- THEN an element with text Keycloak group: gdf-cultura is present`

Change: Remove this assertion line from the scenario.

---

### Amendment tally

| Decision | Amendments |
|----------|:----------:|
| C-2 (scale-patch -> scale-request) | 1 |
| C-3 (POST field _id -> id) | 7 |
| C-4 (groups topic missing from kafka-init) | 3 |
| H-1 (Keycloak removal) | 6 |
| H-6 (DLQ test marked complete but unfulfilled) | 1 |
| H-9 / CLAUDE.md (stale roles approver/service) | 5 |
| H-10 (CDC docs omit groups) | 4 |
| H-14 (audit-sink omits org-bootstrap) | 1 |
| M-24 (four -> three artifacts) | 10 |
| M-25 (Purpose: TBD) | 1 |
| **Total** | **39** |

Two decisions required no doc amendments beyond the audit findings already captured:

- **C-1 (repo naming):** Docs/specs consistently use `gdfkube-{groupId}`. The `<owner>-<org>` pattern exists only in `RepoBootstrapRoute.java` code -- no spec/doc drift.
- **H-2 / H-13 (verification tasks unchecked):** The `[ ]` marks in tasks.md are accurate -- the tasks genuinely have not been run. The decision is operational (run them), not a doc correction.
