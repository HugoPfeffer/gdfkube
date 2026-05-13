## Context

The Users admin tab in the ITSM SPA (`gdfkube-src/gdfkube-itsm/`) has two create pages — `NewGroupPage` and `NewFormPage` — where users type both a Display name and an ID. The current ID input uses a strip-only regex (`/[^a-z0-9-]/g`) that drops disallowed characters instead of converting them to word boundaries. Typing "Min. da fazenda" produces `mindafazenda`; "Educação" produces `educao` (because the accented `ã` is stripped, taking the following `o` along when combined with the lowercase). The corresponding edit pages have already moved to a read-only ID pattern (`GroupEditor.tsx:84`: `<input … disabled readOnly />`); the create pages drifted.

Downstream consumers expect kebab-case DNS-1123-compatible IDs:
- `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/bean/HelmValuesBuilder.java:98-103` builds `hc-{org}-{cluster}` and `ns-{org}-{namespace}` directly from the group ID.
- The seeded orgs `sec-educ`, `sec-tes`, `sec-saude` (`gdfkube-src/gdfkube-orgs/orgs/`) are already in this style.
- ArgoCD `AppProject` names (`{id}-apps`) and Keycloak group names (`gdf-{id}`) inherit the same constraint.

Constraints from `CLAUDE.md`:
- Prefer modifying existing functions over adding new ones (we add exactly one small utility module).
- Eliminate drift between source-of-truth and generated artifacts (slug is now derived, not duplicated state).
- No fallback/papering over — empty slug → fail-hard (`Create` disabled).

Stakeholders: solo developer (Hugo). No external SLA. The SPA is the only producer of these IDs.

## Goals / Non-Goals

**Goals:**
- Single shared `slugify()` utility used by both create pages.
- ID input is `disabled readOnly`, value live-derived from Display name.
- Slug grammar matches `^[a-z0-9]+(-[a-z0-9]+)*$` (DNS-1123 label).
- Portuguese diacritics fold correctly (`ã→a`, `ç→c`, `õ→o`, `é→e`, etc.).
- Existing live-preview ("Keycloak group", "AppProject", "Git repo") and form-id collision check both continue to work.
- All unit and component tests pass after rewriting the existing tests to drive the Display name input.

**Non-Goals:**
- Server-side validation of `_id` against `SLUG_REGEX` in `server/src/routes/groups.ts` / `forms.ts`. Deferred as a defense-in-depth follow-up; the SPA is the only client.
- Changing the username convention on `NewUserPage` (intentionally distinct dot-separated form: `joao.silva`).
- Migrating existing seeded IDs in `adminSeeds.ts` (they already conform).
- Renaming or re-keying existing groups/forms in MongoDB.
- Internationalization beyond Latin-script diacritics (no transliteration of Cyrillic, CJK, etc. — those characters get stripped, which is acceptable for an internal demo stack).

## Decisions

### D1: One shared utility module at `src/utils/slug.ts`
Co-located with `src/utils/clipboard.ts`. Single public function `slugify(input: string): string` plus exported `SLUG_REGEX`. No external dependency — `String.prototype.normalize('NFD')` is ES2015 and supported in every browser/Node version the SPA targets.

**Alternative considered:** Inline the slug logic in each create page. **Rejected** — guaranteed drift between two implementations of the same regex, and we want one testable surface.

**Alternative considered:** Pull in `slugify` or `@sindresorhus/slugify` from npm. **Rejected** — the implementation is ~5 lines, the diacritic-folding approach is well-known, and we already have a zero-dependency project value (`CLAUDE.md` simplicity rule).

### D2: NFD normalize + strip combining marks
```ts
input
  .normalize('NFD')                  // "ç" → "c" + U+0327 (combining cedilla)
  .replace(/[̀-ͯ]/g, '')   // strip combining marks
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')        // collapse runs of non-alphanumerics
  .replace(/^-+|-+$/g, '');           // trim edges
```

**Alternative considered:** Hard-coded substitution map (`ã→a`, `ç→c`, …). **Rejected** — has to enumerate every accented character; misses ones we don't anticipate; NFD handles them all.

**Alternative considered:** Build a hand-rolled tokenizer that splits on word boundaries. **Rejected** — overkill; the regex pipeline is 4 lines and handles every observed case.

### D3: Read-only ID input (mirror `GroupEditor.tsx:84`)
Render the ID input as `<input id="…" type="text" value={derivedId} disabled readOnly />`. No `onChange`. The user types into Display name; the ID input shows what will be persisted.

**Alternative considered:** Hide the ID input entirely and show it only in the preview block. **Rejected** — the user explicitly asked for the read-only-field pattern, which is the convention in `GroupEditor`. Removing the field would be a UX regression for users who scan the form for "ID".

### D4: Empty-slug → `Create` disabled, no inline error
`canCreate = id !== '' && displayName.trim() !== '' && !idCollision (forms only)`. If the user types only punctuation, the slug is empty and the button stays disabled.

**Alternative considered:** Inline validation message ("ID could not be derived from this name"). **Rejected** — disabled button + the visibly empty ID input already communicate the state; an extra error banner adds noise. Aligns with the fail-hard convention in `CLAUDE.md`.

### D5: Preserve repo `dirty` flag on `NewGroupPage`
Repo auto-suggest already tracks the ID via a `repoDirty` flag. Switch repo's effective value to follow the **derived** ID (not the removed manual ID state), but keep the dirty flag so manual repo edits still stick. Implementation: a small `useEffect` setting `repo` to `\`gdfkube-${id}\`` whenever `id` changes and `!repoDirty`. The existing test "manual edit of Git repo persists; later id changes do NOT overwrite" must continue to pass.

### D6: Preserve form-id collision check on `NewFormPage`
`forms.some((f) => f.id === id)` and its inline error remain. Now the collision input is the derived slug, not the user-typed string.

## Risks / Trade-offs

- [Risk] **Existing tests break loudly when they drive the ID input directly.** → Mitigation: rewrite the test assertions in the same PR (covered in tasks). The breakage is an intended detector that the contract changed.
- [Risk] **A user expects to type a custom ID different from the Display name.** → Mitigation: this is an intentional removal. The user explicitly asked for the read-only-derived pattern. If a custom override is ever needed, it would be a separate change.
- [Risk] **Server accepts an empty `_id` if the SPA ever bypasses `canCreate`.** → Mitigation: `canCreate` enforcement plus server-side defense-in-depth left as a follow-up (Non-Goal). MongoDB's `_id` constraint will reject an empty string anyway.
- [Risk] **Non-Latin characters (e.g. Cyrillic, CJK) get stripped to empty.** → Mitigation: acceptable for this internal demo stack; documented in Non-Goals. A future migration could add transliteration via a library.
- [Trade-off] **No manual override** simplifies the contract but removes flexibility. Net positive given the drift problem we're solving.

## Migration Plan

No data migration. Pure SPA change.

1. Land the utility and the two component updates together in a single PR.
2. CI runs `npm test` + `npm run typecheck` in `gdfkube-src/gdfkube-itsm/`.
3. Manual smoke per the verify artifact.
4. No rollback complexity — revert the commit if the change is rejected; no schema or data shape changed.

Existing groups and forms in MongoDB are untouched. IDs that were created with the old buggy regex (if any) remain as-is; they simply can't be re-created with the same buggy ID via the UI.

## Open Questions

- Server-side `SLUG_REGEX` enforcement in `routes/groups.ts` and `routes/forms.ts` — deferred. Worth a follow-up if any non-SPA client is ever added.
- Whether to extract a shared `useDerivedId(displayName)` hook if a third admin create page ever needs the same pattern. Premature today (only two callers); revisit on the third use.
