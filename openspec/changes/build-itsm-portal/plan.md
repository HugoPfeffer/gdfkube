# gdfkube ITSM Portal Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Stand up `gdfkube-src/gdfkube-itsm/` as a buildable Vite + React 18 + TypeScript app reproducing every screen, behavior, and pruning decision captured in the Claude Design handoff bundle (`UM8oI594JuuCpxaNBVoITA`).

**Architecture:** A single-page React app with an in-app reducer router, role-gated shell (Sidebar / Topbar / Tweaks panel), seven screens (Dashboard, Catalog, NewRequest, RequestsList, RequestDetail, Approvals, Admin Forms+Users), and a single dynamic form runner that consumes a typed `Field` schema for every form including OpenShift Cluster. Admin-mutable seeds live in a `useReducer`-backed context so Catalog and NewRequest stay in lockstep with the Forms registry. Approval is a hard gate before provisioning.

**Tech Stack:** React 18.3.1, TypeScript 5, Vite 5, Vitest 1 + Testing Library 14, Playwright 1 (optional), HTML5 drag-and-drop, CSS variables for theming. No state-management library, no router library.

---

## Task 1: Scaffold the project

- [ ] **Step 1:** From `/workspace/gdfkube-src/`, run `npm create vite@latest gdfkube-itsm -- --template react-ts` and accept the default scaffolding.
- [ ] **Step 2:** Inside `gdfkube-src/gdfkube-itsm/`, pin React versions: `npm install react@18.3.1 react-dom@18.3.1` and add `@types/react@^18` and `@types/react-dom@^18`.
- [ ] **Step 3:** Add dev deps: `npm install -D vitest@^1 @testing-library/react@^14 @testing-library/jest-dom@^6 jsdom@^24 eslint@^9 prettier@^3`.
- [ ] **Step 4:** Edit `package.json` scripts to add `dev`, `build`, `preview`, `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `test:watch`, `lint` (`eslint src --ext .ts,.tsx`).
- [ ] **Step 5:** Configure `tsconfig.json` with `strict: true`, `jsx: react-jsx`, `baseUrl: "."`, `paths: {"@/*": ["src/*"]}`.
- [ ] **Step 6:** Configure `vite.config.ts` to alias `@` → `src` and configure `vitest` with `environment: 'jsdom'` and `setupFiles: './src/test/setup.ts'` (creating that file with `import '@testing-library/jest-dom';`).
- [ ] **Step 7:** Replace `index.html` body markup with `<div id="root"></div>` and add the three Google Fonts links from `gdfkube ITSM Portal.html`.
- [ ] **Step 8:** Copy the bundle's `styles.css` into `src/styles.css` verbatim and import it from `src/main.tsx`.
- [ ] **Step 9:** Commit: `init gdfkube-itsm scaffold`.
- [ ] **Step 10:** Add `.github/workflows/gdfkube-itsm-ci.yml` running `npm ci && npm run typecheck && npm run test && npm run build` on changes under `gdfkube-src/gdfkube-itsm/**`. Commit.

## Task 2: Type definitions and pure helpers (TDD)

- [ ] **Step 1:** Write `src/types.ts` with the union types listed in tasks.md §2.1.
- [ ] **Step 2 (TEST FIRST):** Write `src/forms/__tests__/parseSelectOptions.test.ts` covering: pipe-grammar with all 4 fields; description-with-comma using `;` separator; comma fallback for plain lists; empty input returns `[]`; only-value defaults `label = value`.
- [ ] **Step 3:** Implement `src/forms/parseSelectOptions.ts` until tests pass.
- [ ] **Step 4 (TEST FIRST):** Write `interpolateTokens.test.ts`: replaces `{key}` with provided value; missing key keeps the literal `{key}`; multiple tokens in same string.
- [ ] **Step 5:** Implement `src/forms/interpolateTokens.ts`.
- [ ] **Step 6 (TEST FIRST):** Write `validate.test.ts`: required + empty → error; regex match/no-match; number min/max boundaries; null/undefined treated as empty.
- [ ] **Step 7:** Implement `src/forms/validate.ts`.
- [ ] **Step 8 (TEST FIRST):** Write `src/utils/__tests__/clipboard.test.ts` mocking `navigator.clipboard.writeText` rejection and asserting the textarea-fallback path runs. Mock `document.execCommand`.
- [ ] **Step 9:** Implement `src/utils/clipboard.ts` with the textarea fallback.
- [ ] **Step 10 (TEST FIRST):** Write `src/tweaks/__tests__/useTweaks.test.tsx` checking localStorage round-trip and that defaults apply on first mount.
- [ ] **Step 11:** Implement `src/tweaks/useTweaks.ts`.
- [ ] **Step 12:** Run `npm run typecheck && npm run test`; commit.

## Task 3: Seed data + data context

- [ ] **Step 1:** Port `data.jsx` arrays into `src/data/seeds.ts` typed against `src/types.ts`.
- [ ] **Step 2:** Port admin forms / fields / users / groups arrays from `admin.jsx` into `src/data/adminSeeds.ts`. Only include `cluster-request`, `namespace-request`, `scale-request`.
- [ ] **Step 3:** Port `DEFAULT_TEMPLATES` into `src/data/defaultTemplates.ts`.
- [ ] **Step 4:** Build `src/state/dataContext.tsx` with a `useReducer` over `{requests, forms, fields, users, groups, templates}` plus action types `ADD_REQUEST`, `UPDATE_REQUEST_STATUS`, `ADD_FORM`, `UPDATE_FORM`, `REORDER_FIELDS`, `UPDATE_FIELD`, `ADD_USER`, `UPDATE_USER`, etc.
- [ ] **Step 5:** Wrap `App` in the data provider.
- [ ] **Step 6:** Commit `seed data + data context`.

## Task 4: Icons

- [ ] **Step 1:** Port `icons.jsx` to `src/icons/Icons.tsx` keeping every icon name. Each icon is a typed `FC<{size?: number; className?: string}>`.
- [ ] **Step 2:** Add a smoke test in `src/icons/__tests__/Icons.test.tsx` rendering each icon and asserting an `svg` is present.
- [ ] **Step 3:** Commit.

## Task 5: App shell

- [ ] **Step 1:** Build `src/shell/UtilityBand.tsx` (status dot + version label).
- [ ] **Step 2 (TEST FIRST):** `Sidebar.test.tsx` — operator does not see admin sections; admin sees Approvals badge equal to `approval`-status request count; collapsed mode hides labels and sets tooltips.
- [ ] **Step 3:** Implement `src/shell/Sidebar.tsx`.
- [ ] **Step 4 (TEST FIRST):** `Topbar.test.tsx` — breadcrumbs come from a prop; clicking role menu toggles role and updates user identity.
- [ ] **Step 5:** Implement `src/shell/Topbar.tsx` with outside-click closing.
- [ ] **Step 6 (TEST FIRST):** `ToastStack.test.tsx` — auto-dismisses after 5s (use fake timers); close-icon click dismisses.
- [ ] **Step 7:** Implement `src/shell/ToastStack.tsx`.
- [ ] **Step 8:** Commit `app shell`.

## Task 6: Router + App root

- [ ] **Step 1:** Implement `src/router.ts` exporting `useRouter()` and a `RouteContext`.
- [ ] **Step 2:** Build `src/App.tsx` selecting the page component by route. Render Utility band + Sidebar + Topbar + main + ToastStack.
- [ ] **Step 3 (TEST FIRST):** `App.test.tsx` — switching role to operator while on `approvals` route redirects to `home`.
- [ ] **Step 4:** Implement the role-route guard `useEffect`.
- [ ] **Step 5:** Implement breadcrumb derivation matching the prototype exactly (depend on `routeParams.formId` and form display name from context).
- [ ] **Step 6:** Wire `useTweaks` and apply `data-theme` via effect.
- [ ] **Step 7:** Commit `router + App`.

## Task 7: Dashboard

- [ ] **Step 1 (TEST FIRST):** `Dashboard.test.tsx` — title swap on role; KPI count = 3; clicking a recent-request row navigates with the correct id.
- [ ] **Step 2:** Build `src/pages/Dashboard.tsx` and `src/components/StatusPill.tsx`.
- [ ] **Step 3:** Visual check: navigate to `/` and confirm match against the bundle's screen.
- [ ] **Step 4:** Commit.

## Task 8: Service Catalog

- [ ] **Step 1 (TEST FIRST):** `Catalog.test.tsx` — only `active` forms render; `cluster-request` is featured; tile click dispatches `navigate("new-request", {formId})`; unknown id renders generic icon.
- [ ] **Step 2:** Build `src/pages/Catalog.tsx` with the per-id icon/description lookup and generic fallback.
- [ ] **Step 3:** Confirm no "Knowledge Base" or filter-chip elements are rendered.
- [ ] **Step 4:** Commit.

## Task 9: Generic form runner (NewRequest)

- [ ] **Step 1 (TEST FIRST):** `GenericRequest.test.tsx` covering the eight requirements in `specs/itsm-request-submission/spec.md`. Use a synthetic `cluster-request` field set in tests rather than depending on seed mutation.
- [ ] **Step 2:** Build `src/forms/GenericRequest.tsx` reading from data context.
- [ ] **Step 3:** Build `src/forms/RadioCards.tsx`, `src/forms/PrefixedInput.tsx`, `src/forms/PayloadPreview.tsx`.
- [ ] **Step 4:** Implement Submit handler dispatching `ADD_REQUEST` with `status: "approval"`, populated `meta`, `vars`, `policyChecks`, then `navigate("request-detail", {id, submitted: true})`.
- [ ] **Step 5:** Build `src/pages/NewRequest.tsx` as a thin wrapper that picks the formId from `routeParams` and delegates to `GenericRequest`.
- [ ] **Step 6:** Verify there is no `ClusterRequest` component in `src/`.
- [ ] **Step 7:** Commit.

## Task 10: Requests list

- [ ] **Step 1 (TEST FIRST):** `RequestsList.test.tsx` — operator scope shows only own; admin scope shows all; chip filtering; provisioning row shows progress; title swap.
- [ ] **Step 2:** Build `src/pages/RequestsList.tsx`.
- [ ] **Step 3:** Commit.

## Task 11: Request detail

- [ ] **Step 1 (TEST FIRST):** `RequestDetail.test.tsx` — stage class mapping; `pipelineSpeed` doubles → animation duration halves (test by reading inline style/CSS variable); kubeconfig disabled until `ready`; no "Generated Manifests" or "Pipeline Activity" elements.
- [ ] **Step 2:** Build `src/components/Pipeline.tsx`.
- [ ] **Step 3:** Build `src/pages/RequestDetail.tsx` with Request Details / Approvals chain / Cluster Access side panels.
- [ ] **Step 4:** Commit.

## Task 12: Approvals

- [ ] **Step 1 (TEST FIRST):** `Approvals.test.tsx` covering every requirement in `specs/itsm-approvals-queue/spec.md` including override-modal flow.
- [ ] **Step 2:** Build `src/pages/Approvals.tsx` with queue + filter chips + decided log.
- [ ] **Step 3:** Build `src/pages/approvals/DecisionPanel.tsx` and `src/pages/approvals/OverrideModal.tsx`.
- [ ] **Step 4:** Wire Approve and Reject to dispatch `UPDATE_REQUEST_STATUS`.
- [ ] **Step 5:** Commit.

## Task 13: Admin → Forms

- [ ] **Step 1 (TEST FIRST):** `Forms.test.tsx` — Forms tab lists all forms; Form Fields tab is global; no "New field" button on the global tab.
- [ ] **Step 2:** Build `src/pages/admin/Forms.tsx`.
- [ ] **Step 3 (TEST FIRST):** `FormEditor.test.tsx` — sub-tab navigation; type-aware Validation/options control switches per type; advanced sub-row exposes displayAs/prefix/help.
- [ ] **Step 4:** Build `src/admin/FormEditor.tsx` with Definition / Fields / Template sub-tabs.
- [ ] **Step 5 (TEST FIRST):** `FieldsTable.test.tsx` — drag from index N to M reorders; visual feedback classes applied during drag.
- [ ] **Step 6:** Build `src/admin/FieldsTable.tsx` with HTML5 DnD.
- [ ] **Step 7 (TEST FIRST):** `TemplateEditor.test.tsx` — add / rename / remove file; copy variable token lands in clipboard via fallback.
- [ ] **Step 8:** Build `src/admin/TemplateEditor.tsx` and `src/admin/AvailableVariablesPanel.tsx`.
- [ ] **Step 9 (TEST FIRST):** `NewFormPage.test.tsx` — id collision blocks Create with inline error; persisting Create dispatches `ADD_FORM` and navigates back.
- [ ] **Step 10:** Build `src/admin/NewFormPage.tsx`.
- [ ] **Step 11:** Commit `admin forms`.

## Task 14: Admin → Users

- [ ] **Step 1 (TEST FIRST):** `Users.test.tsx` — search and role filter narrow the table; Groups tab lists every department.
- [ ] **Step 2:** Build `src/pages/admin/Users.tsx`.
- [ ] **Step 3:** Build `src/admin/UserEditor.tsx`, `src/admin/GroupEditor.tsx`.
- [ ] **Step 4 (TEST FIRST):** `NewGroupPage.test.tsx` — typing into `id` auto-suggests `gdfkube-{id}` into Git repo; manual edit overrides auto-suggest.
- [ ] **Step 5:** Build `src/admin/NewUserPage.tsx`, `src/admin/NewGroupPage.tsx` with the live preview block on NewGroupPage.
- [ ] **Step 6:** Commit `admin users`.

## Task 15: Tweaks panel

- [ ] **Step 1:** Build `src/tweaks/TweaksPanel.tsx` rendering Appearance / Demo / Quick actions sections.
- [ ] **Step 2:** Wire to `useTweaks` and apply theme via `useEffect`.
- [ ] **Step 3:** Commit.

## Task 16: End-to-end

- [ ] **Step 1:** `npm install -D @playwright/test@^1 && npx playwright install --with-deps chromium`.
- [ ] **Step 2:** Add `e2e/` folder with `playwright.config.ts` (baseURL = preview server) and `e2e/approval-flow.spec.ts` exercising operator-submit → admin-approve → admin sees provisioning.
- [ ] **Step 3:** Add an `e2e` npm script and gate the CI job behind a `e2e` PR label.
- [ ] **Step 4:** Commit.

## Task 17: Documentation + polish

- [ ] **Step 1:** Write `gdfkube-src/gdfkube-itsm/README.md` covering setup, dev, build, role switcher, Tweaks panel keys, persistence caveat (in-memory only), and the link back to OpenSpec change `build-itsm-portal`.
- [ ] **Step 2:** Run `npm run typecheck && npm run test && npm run build` and confirm all pass.
- [ ] **Step 3:** Run a manual visual check against each screen of the bundle's HTML prototype; capture diffs as follow-up issues if anything material drifts.
- [ ] **Step 4:** Commit `docs + final polish`. Branch is now ready for review.

---

**Verification before merge:** every spec scenario in `specs/**/spec.md` is exercised by at least one Vitest or Playwright test (cross-check during `verify` artifact). Coverage target: ≥ 80% lines on `src/**` excluding `src/data/**`.
