# Auto-Slug Group + Form IDs — Implementation Plan

> **For agentic workers:** Use `superpowers:subagent-driven-development` to implement this plan task-by-task.

**Goal:** Make the Group and Form admin create forms render their ID as a read-only field derived live from the Display name via a shared `slugify()` utility that produces DNS-1123-compatible kebab-case IDs and folds Portuguese diacritics.

**Architecture:** Add one zero-dependency utility (`src/utils/slug.ts`) used by two existing SPA pages (`NewGroupPage.tsx`, `NewFormPage.tsx`). The edit forms are unchanged — `GroupEditor.tsx` is already read-only and `FormEditor` has no ID input. Server schema, routes, and downstream Camel/Helm/Argo consumers are untouched; this tightens what the SPA produces, not what the stack consumes.

**Tech Stack:** TypeScript + React 18 (SPA), Vitest + React Testing Library, Express + Mongoose (server, unchanged in this change).

---

## Task 1: slugify utility + tests

- [ ] **Step 1.1:** Create `gdfkube-src/gdfkube-itsm/src/utils/slug.ts` with:
  ```ts
  export const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

  export function slugify(input: string): string {
    return input
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  ```
- [ ] **Step 1.2:** Create `gdfkube-src/gdfkube-itsm/src/utils/__tests__/slug.test.ts` using Vitest. Cover, in order: `Min. da fazenda` → `min-da-fazenda`; `Educação` → `educacao`; `Sec. Educ.` → `sec-educ`; `'  -- Cultura --  '` → `cultura`; `__under_scored__` → `under-scored`; `''` → `''`; `'...'` → `''`; idempotence loop over the above; for each non-empty result, assert `SLUG_REGEX.test(result)` is `true`.
- [ ] **Step 1.3:** From `gdfkube-src/gdfkube-itsm/`, run `npm test -- slug` and confirm all cases pass.
- [ ] **Step 1.4:** Commit. Message: `feat(itsm): add slugify utility for kebab-case admin ids`.

---

## Task 2: NewGroupPage — derive ID from Display name

- [ ] **Step 2.1:** In `src/admin/NewGroupPage.tsx`, add `import { slugify } from '../utils/slug';`.
- [ ] **Step 2.2:** Delete `const [id, setId] = useState('')` and the entire `onIdChange` arrow function.
- [ ] **Step 2.3:** Add `const id = slugify(displayName);` after the remaining `useState` declarations.
- [ ] **Step 2.4:** Replace the repo-syncing branch inside the removed `onIdChange` with a `useEffect`:
  ```ts
  useEffect(() => {
    if (!repoDirty) setRepo(id === '' ? '' : `gdfkube-${id}`);
  }, [id, repoDirty]);
  ```
  Add `useEffect` to the React import.
- [ ] **Step 2.5:** Change the ID `<input>` to:
  ```tsx
  <input id="new-group-id" type="text" value={id} disabled readOnly />
  ```
  Remove `required`, the `onChange`, and the `placeholder`. Replace help text with: "Auto-derived from Display name. Used for Keycloak group, repo, and AppProject names."
- [ ] **Step 2.6:** Replace `const trimmedId = id.trim();` with nothing (the slug is already trimmed) and update `canCreate` to `id !== '' && displayName.trim() !== ''`.
- [ ] **Step 2.7:** In `handleCreate`, replace every `trimmedId` reference with `id`. The `_id: id` payload field and the `gdfkube-${id}` repo default both follow.
- [ ] **Step 2.8:** Replace `const idDisplay = trimmedId || '{id}';` with `const idDisplay = id || '{id}';`. Leave `repoDisplay` unchanged.
- [ ] **Step 2.9:** Run `npm run typecheck` and confirm clean.

---

## Task 3: NewGroupPage component tests

- [ ] **Step 3.1:** Open `src/admin/__tests__/NewGroupPage.test.tsx`. Add a helper at the top of `describe`: `const typeName = (v: string) => fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: v } });`.
- [ ] **Step 3.2:** Rewrite test "typing into id auto-populates Git repo as gdfkube-{id}" to: `typeName('cultura')` → assert `screen.getByLabelText(/^id$/i).value === 'cultura'` and `screen.getByLabelText(/git repo/i).value === 'gdfkube-cultura'`.
- [ ] **Step 3.3:** Rewrite test "manual edit of Git repo persists; later id changes do NOT overwrite": `typeName('cultura')`, assert repo `gdfkube-cultura`, `fireEvent.change(repoInput, {target:{value:'custom-repo'}})`, `typeName('turismo')`, assert repo still `custom-repo`.
- [ ] **Step 3.4:** Rewrite the preview-block test to `typeName('cultura')` instead of typing the ID input. All four preview lines should still match.
- [ ] **Step 3.5:** Replace "Create disabled until id and displayName are non-empty" with three sub-assertions in one test: (a) empty Display name → disabled; (b) `typeName('...')` → disabled because slug is empty; (c) `typeName('Cultura')` → enabled and ID input reads `cultura`.
- [ ] **Step 3.6:** Rewrite "Create dispatches ADD_GROUP and calls onClose" to drive Display name only: `typeName('Cultura')` then click. Assert `mockCreate` payload `_id === 'cultura'` and dispatched group id is `cultura`.
- [ ] **Step 3.7:** Add a new test "Display name with spaces and punctuation derives kebab-case ID": `typeName('Min. da fazenda')` → assert ID input is `min-da-fazenda`, repo is `gdfkube-min-da-fazenda`, preview line `Keycloak group: gdf-min-da-fazenda`.
- [ ] **Step 3.8:** Run `npm test -- NewGroupPage` and confirm all green.

---

## Task 4: NewFormPage — derive ID from Display name

- [ ] **Step 4.1:** In `src/admin/NewFormPage.tsx`, add `import { slugify } from '../utils/slug';`.
- [ ] **Step 4.2:** Delete the `const [id, setId] = useState('')` line.
- [ ] **Step 4.3:** Add `const id = slugify(name);` after the remaining `useState` declarations.
- [ ] **Step 4.4:** Replace `const trimmedId = id.trim();` with nothing; update `idCollision` to `id !== '' && forms.some((f) => f.id === id)` and `canCreate` to `id !== '' && name.trim() !== '' && !idCollision`.
- [ ] **Step 4.5:** Update every other `trimmedId` reference in the file to `id`. In particular, the POST body's `_id` and any preview/help string interpolations.
- [ ] **Step 4.6:** Change the Form ID `<input>` to:
  ```tsx
  <input
    id="new-form-id"
    type="text"
    value={id}
    disabled
    readOnly
    aria-invalid={idCollision || undefined}
  />
  ```
  Remove its `onChange`. Leave the existing help/error `<div data-testid="new-form-id-help">…</div>` block intact — it already keys off `idCollision`.
- [ ] **Step 4.7:** Run `npm run typecheck` and confirm clean.

---

## Task 5: NewFormPage component tests

- [ ] **Step 5.1:** Open `src/admin/__tests__/NewFormPage.test.tsx`. Add the same `typeName` helper but pointing at the form's Display name input (`/display name/i`).
- [ ] **Step 5.2:** Rewrite each assertion that previously typed into the Form ID input so it types into Display name instead, and reads the Form ID input as the assertion target.
- [ ] **Step 5.3:** Preserve the collision test. Seed the data state with a form whose id is `cultura`. `typeName('Cultura')` → assert Form ID input reads `cultura`, collision banner is visible, `Create` button disabled.
- [ ] **Step 5.4:** Add an empty-slug test: `typeName('...')` → assert Form ID input is empty, `Create` button disabled.
- [ ] **Step 5.5:** Run `npm test -- NewFormPage` and confirm all green.

---

## Task 6: Full verification

- [ ] **Step 6.1:** From `gdfkube-src/gdfkube-itsm/`, run `npm run typecheck`. Confirm clean.
- [ ] **Step 6.2:** From `gdfkube-src/gdfkube-itsm/`, run `npm test`. Confirm all suites green.
- [ ] **Step 6.3:** Start the SPA dev server. Open the Users admin tab → New group. Walk through the manual smoke cases (Min. da fazenda / Educação / `...` / form collision). Capture any UI regressions.
- [ ] **Step 6.4:** From `/workspace`, run `pre-commit run --all-files`. Resolve any hook failures.
- [ ] **Step 6.5:** Final commit. Message: `feat(itsm): read-only auto-slug ids on group + form create forms`.
