## 1. Project scaffolding

- [x] 1.1 Create `gdfkube-src/gdfkube-itsm/` and initialize a Vite + React 18 + TypeScript app (`npm create vite@latest gdfkube-itsm -- --template react-ts`).
- [x] 1.2 Pin dependencies: `react@18.3.1`, `react-dom@18.3.1`, `vite@^5`, `@vitejs/plugin-react@^4`, `typescript@^5`.
- [x] 1.3 Add dev dependencies: `vitest@^1`, `@testing-library/react@^14`, `@testing-library/jest-dom@^6`, `jsdom@^24`, `eslint@^9`, `prettier@^3`.
- [x] 1.4 Add npm scripts: `dev`, `build`, `preview`, `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `test:watch` (`vitest`), `lint` (`eslint src --ext .ts,.tsx`).
- [x] 1.5 Configure `tsconfig.json` with `strict: true`, `jsx: react-jsx`, `paths` for `@/*` → `src/*`.
- [x] 1.6 Add Google Fonts link tags for Inter Tight, JetBrains Mono, Source Serif 4 to `index.html`.
- [x] 1.7 Copy the bundle's `styles.css` into `src/styles.css` and import it from `src/main.tsx`.
- [x] 1.8 Add a path-filtered GitHub Actions workflow `.github/workflows/gdfkube-itsm-ci.yml` that runs `npm ci && npm run typecheck && npm run test && npm run build` on changes under `gdfkube-src/gdfkube-itsm/**`.

## 2. Type definitions and core helpers

- [x] 2.1 In `src/types.ts`, define `Role`, `User`, `RouteName`, `RouteParams`, `Org`, `Env`, `Request`, `RequestStatus`, `PolicyCheck`, `PipelineStage`, `KPI`, `ActivityEntry`, `CatalogItem`, `FieldType`, `FieldBucket`, `FieldDisplayAs`, `Field`, `FormDef`, `TemplateFile`, `Tweaks`.
- [x] 2.2 Implement `parseSelectOptions(input: string): SelectOption[]` in `src/forms/parseSelectOptions.ts` (split on `;` if present, else `,`; pipe-separated `value | label | description | dotColor`).
- [x] 2.3 Implement `interpolateTokens(input: string, values: Record<string, string>): string` in `src/forms/interpolateTokens.ts`.
- [x] 2.4 Implement `validateField(field: Field, value: unknown): string | null` in `src/forms/validate.ts` (regex on text, min/max on number, required check).
- [x] 2.5 Implement `copyToClipboard(text: string): Promise<void>` in `src/utils/clipboard.ts` with the textarea + `execCommand` fallback.
- [x] 2.6 Implement `useTweaks(defaults: Tweaks)` in `src/tweaks/useTweaks.ts` reading/writing `localStorage["gdfkube.tweaks"]`.
- [x] 2.7 Add unit tests in `src/forms/__tests__/parseSelectOptions.test.ts`, `interpolateTokens.test.ts`, `validate.test.ts`, `src/utils/__tests__/clipboard.test.ts` covering grammar fallbacks, sandboxed clipboard rejection, regex validation edge cases.

## 3. Seed data

- [x] 3.1 Port `data.jsx` to `src/data/seeds.ts`: `ORGS`, `ENVS`, `REQUESTS`, `PIPELINE_STAGES`, `ACTIVITY_LOG`, `KPIS`, `RECENT_ACTIVITY`, `CATALOG_ITEMS`, `CLUSTERS`. Export a typed `GDF_DATA`.
- [x] 3.2 Port admin seeds from `admin.jsx` to `src/data/adminSeeds.ts`: forms (`cluster-request`, `namespace-request`, `scale-request` only), fields keyed by form id, users, groups. Export typed `GDF_ADMIN_DATA`.
- [x] 3.3 Port `DEFAULT_TEMPLATES` to `src/data/defaultTemplates.ts` as a map from form id to `TemplateFile[]` (cluster-request → hostedcluster.yaml + applicationset.yaml + managedcluster.yaml; namespace-request → namespace.yaml + resourcequota.yaml; scale-request → nodepool.yaml).
- [x] 3.4 Wrap `GDF_DATA` and `GDF_ADMIN_DATA` in a `useReducer`-backed context in `src/state/dataContext.tsx` so admin edits propagate to consumer pages.

## 4. Icons

- [x] 4.1 Port `icons.jsx` to `src/icons/Icons.tsx` preserving all 30 icon names; export as a typed `Icons` object with `ComponentType<{size?: number; className?: string}>` values.

## 5. App shell

- [x] 5.1 Build `src/shell/UtilityBand.tsx` (status dot + version pill).
- [x] 5.2 Build `src/shell/Sidebar.tsx` enforcing role-gated items, badge logic, collapsed-mode tooltips.
- [x] 5.3 Build `src/shell/Topbar.tsx` with breadcrumbs, search input + ⌘K hint, refresh + notifications buttons, role switcher menu (close-on-outside-click).
- [x] 5.4 Build `src/shell/ToastStack.tsx` displaying a single active toast with auto-dismiss after 5s.
- [x] 5.5 Component tests for Sidebar (role gating, badge math), Topbar (role switch), ToastStack (auto-dismiss).

## 6. Routing and App root

- [x] 6.1 Implement `useRouter()` hook in `src/router.ts` exposing `route`, `routeParams`, and `navigate(route, params)` over a `useReducer`.
- [x] 6.2 Build `src/App.tsx` switching on `route`: `home`, `catalog`, `new-request`, `requests`, `request-detail`, `approvals`, `admin-forms`, `admin-users`.
- [x] 6.3 Implement the role-route guard `useEffect` redirecting operators away from admin/approval routes.
- [x] 6.4 Implement breadcrumb derivation for every route (parameterized by `routeParams.formId` for new-request and `routeParams.id` for request-detail).
- [x] 6.5 Wire the Tweaks panel to App state, including persisted defaults.

## 7. Dashboard page

- [x] 7.1 Build `src/pages/Dashboard.tsx`: page head (role-aware title), banner, KPI grid (3 cards), Recent Requests table, Activity Stream card.
- [x] 7.2 Implement `StatusPill` in `src/components/StatusPill.tsx`.
- [x] 7.3 Component tests covering title swap on role change, KPI card count, row click navigation.

## 8. Service Catalog page

- [x] 8.1 Build `src/pages/Catalog.tsx` reading active forms from `GDF_ADMIN_DATA.forms` via context.
- [x] 8.2 Implement an icon/description lookup keyed by form id with a generic fallback.
- [x] 8.3 Mark `cluster-request` as featured.
- [x] 8.4 Component tests: disabled form is hidden; new form id renders with generic chrome; tile click navigates with `formId`.

## 9. Generic form runner (NewRequest)

- [x] 9.1 Build `src/forms/GenericRequest.tsx` reading `GDF_ADMIN_DATA.fields[formId]`, rendering each field per `type` and `displayAs`.
- [x] 9.2 Implement the Radio-cards display variant in `src/forms/RadioCards.tsx`.
- [x] 9.3 Implement the prefix chrome with token interpolation in `src/forms/PrefixedInput.tsx`.
- [x] 9.4 Implement the live `meta` + `vars` payload preview pane.
- [x] 9.5 Implement the Submit handler that builds the new request, sets `status: "approval"`, populates `policyChecks`, dispatches a new entry into `GDF_DATA.REQUESTS`, navigates to `request-detail`, and triggers the info toast.
- [x] 9.6 Wire `src/pages/NewRequest.tsx` to delegate to `GenericRequest` for every form id (no bespoke ClusterRequest component).
- [x] 9.7 Component tests: required-field disables submit; pipe-grammar parses values + descriptions + dot colors; prefix interpolates against sibling field; submit creates `status: "approval"` and triggers toast.

## 10. Requests list page

- [x] 10.1 Build `src/pages/RequestsList.tsx` with role-scoped data (operator: own; admin: all), title swap.
- [x] 10.2 Implement status filter chips (All / Approval / Provisioning / Ready / Failed) with single-active state.
- [x] 10.3 Implement inline progress indicator on `provisioning` rows.
- [x] 10.4 Component tests: operator scope, admin scope, chip filtering, progress indicator presence.

## 11. Request detail page

- [x] 11.1 Build `src/pages/RequestDetail.tsx` with the 7-stage pipeline visualization in `src/components/Pipeline.tsx`.
- [x] 11.2 Wire `pipelineSpeed` tweak to the active stage's animation duration.
- [x] 11.3 Add Request Details, Approvals, and Cluster Access side panels.
- [x] 11.4 Disable kubeconfig download until `status === "ready"`.
- [x] 11.5 Confirm via test that no "Generated Manifests" or "Pipeline Activity" cards are rendered.

## 12. Approvals page

- [x] 12.1 Build `src/pages/Approvals.tsx` with the pending queue (left) + decision detail (right) layout.
- [x] 12.2 Implement filter chips (All / Production / Scale) on the queue.
- [x] 12.3 Implement the decided-this-session log section.
- [x] 12.4 Build `src/pages/approvals/DecisionPanel.tsx` with payload, justification quote, policy checks, comment textarea, Approve/Reject + Reassign / Request changes buttons, and the 3-step approval-chain visualization.
- [x] 12.5 Implement the override modal triggered when approving a request with at least one failing policy check.
- [x] 12.6 Wire Approve to set `status: "provisioning"`, `stage: 1` and append to the chain. Wire Reject to set `status: "failed"`.
- [x] 12.7 Component tests: chip filtering, Approve transitions request, override modal blocks until confirmed, Reject marks failed.

## 13. Admin → Forms

- [x] 13.1 Build `src/pages/admin/Forms.tsx` with top-level Forms / Form Fields tabs and ensure the Form Fields tab has no "New field" button.
- [x] 13.2 Build `src/admin/FormEditor.tsx` with Definition / Fields / Template sub-tabs.
- [x] 13.3 Implement the editable Fields table with the type-aware Validation/options control and the advanced sub-row exposing `displayAs`, `prefix`, `help`.
- [x] 13.4 Implement HTML5 drag-and-drop reordering with the `⋮⋮` handle and the dim-and-border visual feedback.
- [x] 13.5 Build `src/admin/TemplateEditor.tsx` with multi-file inner tabs (switch / rename / add / remove), YAML textarea, Rendered preview toggle.
- [x] 13.6 Build the Available variables panel with the System group at the top + From form fields group below; click-to-copy each token using the clipboard helper.
- [x] 13.7 Build `src/admin/NewFormPage.tsx` for creating a new form; Create button disabled until id and name are set and id does not collide; show inline collision error.
- [x] 13.8 Component tests: drag reorder, type-aware control switch, multi-file add/rename/remove, copy via fallback path, id collision blocks Create, persist new form into context.

## 14. Admin → Users

- [x] 14.1 Build `src/pages/admin/Users.tsx` with Users / Groups tabs.
- [x] 14.2 Implement search + role filter on the Users table.
- [x] 14.3 Build `src/admin/UserEditor.tsx` with name, username, email, group, role, status, password (set/change), MFA, recent sessions list.
- [x] 14.4 Build `src/admin/NewUserPage.tsx`; Create disabled until name, username, email, group, role are non-empty.
- [x] 14.5 Build `src/admin/GroupEditor.tsx` with id, display name, full name, Git repo (auto-suggest from id), ManagedClusterSet binding, auto-provision toggle.
- [x] 14.6 Build `src/admin/NewGroupPage.tsx` with the live preview of Keycloak group, repo, AppProject, binding.
- [x] 14.7 Component tests: role filter, repo auto-suggest, missing-fields disables Create.

## 15. Tweaks panel

- [x] 15.1 Build `src/tweaks/TweaksPanel.tsx` with Appearance (theme, density, sidebar collapse), Demo (pipeline speed slider, demo banner toggle), Quick actions (role toggle, open new-request flow).
- [x] 15.2 Apply theme via `document.documentElement.setAttribute("data-theme", ...)` from a `useEffect`.
- [x] 15.3 Persist via `useTweaks(defaults)`; cover the load-from-localStorage path in a Vitest test.

## 16. End-to-end flow

- [ ] 16.1 Add `@playwright/test@^1` (optional, gated by CI label `e2e`).
- [ ] 16.2 Author one Playwright test: operator submits OpenShift Cluster → role-switches to admin → opens Approvals → Approve → confirms request appears in admin "All requests" with `status === "provisioning"`.

## 17. Documentation

- [ ] 17.1 Write `gdfkube-src/gdfkube-itsm/README.md` covering: dev/build commands, role switcher, persistence caveat (in-memory only), Tweaks panel keys, link back to the originating proposal.
- [ ] 17.2 Add a top-level pointer in `docs/` (only if the docs index exists) referencing the new module.
