## Design Summary

Restore the read-only ID pattern on the **create** flows for Groups and Forms (the edit flows already use it — see `GroupEditor.tsx:84`). Derive the ID from the **Display name** using a single shared `slugify()` utility that folds Portuguese diacritics, collapses any run of non-alphanumerics to a single hyphen, and trims edges — producing IDs that conform to the DNS-1123 label style already used across the stack (e.g. `sec-educ`, `sec-tes`, `sec-saude`, and Helm-built `hc-{org}-…` / `ns-{org}-…` names in `gdfkube-camel/src/main/java/gov/gdf/camel/bean/HelmValuesBuilder.java`).

Worked example: `Min. da fazenda` → `min-da-fazenda`. `Educação` → `educacao`. `Sec. Educ.` → `sec-educ`.

## Alternatives Considered

### Option A: Shared `slugify()` utility + read-only derived ID (Chosen)
- **Approach**: Add `src/utils/slug.ts` exporting `slugify(input)` (NFD-normalize, strip combining marks, lowercase, collapse `/[^a-z0-9]+/` to `-`, trim edges) and a `SLUG_REGEX` constant. In `NewGroupPage` and `NewFormPage`, drop the local `id` state and `<input onChange>`; compute `const id = slugify(displayName)` and render the ID input as `disabled readOnly`. `canCreate` requires the derived slug to be non-empty.
- **Pros**:
  - Eliminates ID/Display drift — IDs always reflect the visible label.
  - Matches the established read-only pattern on `GroupEditor.tsx:84`.
  - Single utility shared by both forms; idempotent and unit-testable in isolation.
  - Handles Portuguese diacritics correctly (no zero-width drops like `Educação → educao`).
- **Cons**:
  - Existing component tests that drive the ID input directly need rewriting to drive the Display name instead.
  - Power users lose the ability to type a manual ID that differs from the display name (deemed an anti-feature here).
- **Why chosen**: Aligns with `CLAUDE.md` fail-hard/no-drift principles, mirrors the existing edit-form pattern, and aligns generated IDs with the kebab-case convention already used by the seeded orgs and Camel builders.

### Option B: Keep ID editable, improve the cleaning regex
- **Approach**: Keep the ID input editable on create, but replace the strip-only regex `/[^a-z0-9-]/g` with a collapse-and-trim that also folds diacritics, so typing "Min. da fazenda" yields `min-da-fazenda` instead of `mindafazenda`.
- **Pros**: Minimal UI change; preserves manual override.
- **Cons**: Display and ID still drift independently. Users must remember to type the ID. Doesn't match `GroupEditor` (which is read-only). The original problem — ID silently mangling input — is partially fixed but the duplicated-state surface remains.
- **Why not chosen**: Fixes the regex but not the underlying coupling. User explicitly asked for the read-only pattern back.

### Option C: Server-side slugification
- **Approach**: SPA POSTs `{ name, fullName, ... }` only; `server/src/routes/groups.ts` and `server/src/routes/forms.ts` compute `_id` server-side.
- **Pros**: Single point of truth; SPA can't desync.
- **Cons**: Live preview ("Keycloak group: gdf-{idDisplay}", "AppProject: {id}-apps", "Git repo: gdfkube-{id}") still needs the slug *before* save, so the SPA would need to re-implement slugify anyway. Adds a round-trip just to preview. Doesn't change what the SPA must render.
- **Why not chosen**: Doesn't remove SPA-side work; doubles the implementation surface. Server-side enforcement is left as a future defense-in-depth concern (see Open Questions).

## Agreed Approach

Option A — shared `slugify()` utility in `src/utils/slug.ts`, applied uniformly to both `NewGroupPage` and `NewFormPage`. The ID input on each create page becomes `disabled readOnly` and renders `slugify(displayName)` live. `GroupEditor` is unchanged (already read-only). The existing form-ID collision check is preserved.

## Key Decisions

- **Slug grammar**: DNS-1123 label style (`^[a-z0-9]+(-[a-z0-9]+)*$`). Lowercase only, hyphen-separated, no leading/trailing/double hyphens, no underscores or dots.
- **Diacritics**: Folded via `String.prototype.normalize('NFD')` + strip combining marks (`̀-ͯ`). No external library.
- **Empty slug**: When the user has typed only punctuation (e.g. `...`), the derived slug is empty and the `Create` button stays disabled — no inline error banner. Consistent with the fail-hard convention in `CLAUDE.md`.
- **Scope**: Applies to `NewGroupPage` *and* `NewFormPage`. `NewUserPage` uses a different convention (`joao.silva` dot-separated usernames) and is intentionally out of scope.
- **No server changes** in this change. The SPA is the only client and now guarantees the format.
- **Utility location**: `src/utils/slug.ts` (alongside existing `src/utils/clipboard.ts`).

## Open Questions

- **Server-side enforcement** of `SLUG_REGEX` in `server/src/routes/groups.ts` and `server/src/routes/forms.ts` as a defense-in-depth check. Deferred — flagged as a follow-up change, not part of this proposal.
- **Backfill of pre-existing demo group/form IDs** that may not match the new regex: the seeded IDs in `adminSeeds.ts` (`saude`, `educacao`, etc.) already match. No migration needed for now.
