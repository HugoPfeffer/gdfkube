## 1. Shared slug utility

- [x] 1.1 Create `gdfkube-src/gdfkube-itsm/src/utils/slug.ts` exporting `slugify(input: string): string` (NFD-normalize → strip combining marks → lowercase → collapse non-alphanumerics to `-` → trim edges) and `SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/`.
- [x] 1.2 Create `gdfkube-src/gdfkube-itsm/src/utils/__tests__/slug.test.ts` with Vitest cases: `Min. da fazenda` → `min-da-fazenda`; `Educação` → `educacao`; `Sec. Educ.` → `sec-educ`; `'  -- Cultura --  '` → `cultura`; `__under_scored__` → `under-scored`; empty input → `''`; `'...'` → `''`; idempotence (`slugify(slugify(x)) === slugify(x)`); every non-empty result passes `SLUG_REGEX`.
- [x] 1.3 Run `npm test -- slug` from `gdfkube-src/gdfkube-itsm/` and confirm new tests pass before touching consumers.

## 2. NewGroupPage — read-only derived ID

- [x] 2.1 In `src/admin/NewGroupPage.tsx`, remove `const [id, setId] = useState('')` and the `onIdChange` handler.
- [x] 2.2 Import `slugify` from `../utils/slug` and compute `const id = slugify(displayName)` inline.
- [x] 2.3 Change the ID `<input>` to `disabled readOnly value={id}`, drop its `onChange` and placeholder, and rewrite the help text to "Auto-derived from Display name. Used for Keycloak group, repo, and AppProject names."
- [x] 2.4 Track repo via `useEffect` so `!repoDirty` causes `setRepo(id ? \`gdfkube-${id}\` : '')` on every `id` change, preserving the existing manual-edit-wins semantics.
- [x] 2.5 Update `canCreate` to `id !== '' && displayName.trim() !== ''` and `handleCreate` to use `id` (no more `trimmedId` from a separate state).
- [x] 2.6 Repoint the preview block (`idDisplay`) and `handleCreate` body's `_id`/repo defaults at the derived `id`.

## 3. NewGroupPage tests

- [x] 3.1 In `src/admin/__tests__/NewGroupPage.test.tsx`, rewrite the existing tests that currently `fireEvent.change(idInput, ...)` so they drive Display name instead and assert on the read-only ID input as an output.
- [x] 3.2 Update "typing into id auto-populates Git repo" → "typing into Display name auto-populates ID and Git repo": type `Cultura` → assert ID is `cultura`, repo is `gdfkube-cultura`.
- [x] 3.3 Update "manual edit of Git repo persists; later id changes do NOT overwrite" to drive Display name changes; the manual repo override must still stick across Display name retypes.
- [x] 3.4 Update the preview-block test to drive Display name `Cultura` instead of typing the ID.
- [x] 3.5 Replace "Create disabled until id and displayName are non-empty" with: (a) disabled when Display name empty, (b) disabled when Display name is `...` (empty derived slug), (c) enabled when Display name is `Cultura` and the ID input reads `cultura`.
- [x] 3.6 Update "Create dispatches ADD_GROUP and calls onClose" to drive Display name only; assert the dispatched group's id is `cultura`.
- [x] 3.7 Add one new test: typing Display name `Min. da fazenda` → ID input reads `min-da-fazenda`, repo input reads `gdfkube-min-da-fazenda`, preview block reflects the same.

## 4. NewFormPage — read-only derived ID

- [x] 4.1 In `src/admin/NewFormPage.tsx`, remove the manual `id` `useState` and its `onChange` cleaning logic.
- [x] 4.2 Import `slugify` and compute `const id = slugify(name)` inline.
- [x] 4.3 Change the Form ID `<input>` to `disabled readOnly value={id}`, drop the `aria-invalid` toggle's dependence on raw input (it should still flip on `idCollision`).
- [x] 4.4 Recompute `idCollision = id !== '' && forms.some((f) => f.id === id)` and `canCreate = id !== '' && name.trim() !== '' && !idCollision`.
- [x] 4.5 Update the inline help/error text logic so the collision banner ("A form with id 'X' already exists.") still appears when the derived slug clashes.

## 5. NewFormPage tests

- [x] 5.1 In `src/admin/__tests__/NewFormPage.test.tsx`, rewrite any assertion that drives the Form ID input directly so it drives the Display name input instead.
- [x] 5.2 Preserve the form-id collision test: seed a form with id `cultura`, type Display name `Cultura`, assert the derived ID is `cultura`, the collision banner is shown, and Create is disabled.
- [x] 5.3 Add an empty-slug test: type Display name `...`, assert ID input is empty and Create is disabled.

## 6. Verification

- [x] 6.1 From `gdfkube-src/gdfkube-itsm/`, run `npm run typecheck` — must pass clean.
- [x] 6.2 From `gdfkube-src/gdfkube-itsm/`, run `npm test` — all suites must pass.
- [ ] 6.3 Start the SPA dev server, open the Users admin tab, exercise the manual smoke cases listed in `verify.md` (Min. da fazenda / Educação / `...` / form collision).
- [x] 6.4 From `/workspace`, run `pre-commit run --all-files`.
