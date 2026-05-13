## Why

The ID input on the Group and Form create pages is currently editable with a strip-only regex (`/[^a-z0-9-]/g`) that silently drops word boundaries — so "Min. da fazenda" collapses to `mindafazenda` and Portuguese diacritics like `Educação` yield `educao`. Meanwhile, the edit forms (`GroupEditor.tsx:84`) already render the ID as `disabled readOnly`. The create flow drifted from that pattern and now produces IDs that don't match the DNS-1123 convention used by every downstream consumer (`sec-educ` orgs, Helm-built `hc-{org}-…` / `ns-{org}-…`, Keycloak groups, ArgoCD AppProjects).

## What Changes

**Group ID input on `NewGroupPage`**
- From: editable `<input onChange={onIdChange}>` with cleaning regex that strips non-`[a-z0-9-]` characters.
- To: `<input disabled readOnly value={slugify(displayName)}>`. ID derived live from Display name via a shared utility that folds diacritics and collapses non-alphanumeric runs to a single hyphen.
- Reason: Restore the read-only pattern used in `GroupEditor`; eliminate ID/Display drift; align with the DNS-1123 grammar already used by `sec-educ`/`sec-tes`/`sec-saude` orgs and the Camel `HelmValuesBuilder`.
- Impact: Non-breaking on the wire (server schema unchanged, payload shape identical). Existing component tests on `NewGroupPage` that drive the ID input directly must be rewritten to drive the Display name input.

**Form ID input on `NewFormPage`**
- From: editable `<input onChange={…toLowerCase().replace(/[^a-z0-9-]/g, '')}>`.
- To: `<input disabled readOnly value={slugify(name)}>`. Existing collision-detection (`forms.some((f) => f.id === id)`) is preserved.
- Reason: Same as Groups — consistency across admin create flows.
- Impact: Same shape as the Groups change; `NewFormPage.test.tsx` requires the same test rewrite.

**New shared utility `src/utils/slug.ts`**
- Exports `slugify(input: string): string` — `normalize('NFD')` + strip combining marks (`̀-ͯ`) + lowercase + collapse `/[^a-z0-9]+/` to `-` + trim leading/trailing hyphens.
- Exports `SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/` for validation in tests and future server-side enforcement.

**Empty-slug handling**
- When the user has typed only punctuation/whitespace and the derived slug is empty, `Create` stays disabled. No inline error banner — consistent with `CLAUDE.md` fail-hard convention.

## Capabilities

### New Capabilities
- `itsm-admin-slug-id`: rules for how the SPA derives read-only, DNS-1123-compatible IDs from Display names on admin create forms.

### Modified Capabilities
<!-- No spec-level requirements are being changed elsewhere; the existing `itsm-admin-users` spec describes the broader Users admin tab but its requirements don't constrain the slug behavior. The new capability owns the slug rules. -->

## Impact

**Code (SPA only — `gdfkube-src/gdfkube-itsm/`)**
- New: `src/utils/slug.ts`, `src/utils/__tests__/slug.test.ts`.
- Modified: `src/admin/NewGroupPage.tsx`, `src/admin/NewFormPage.tsx`.
- Modified tests: `src/admin/__tests__/NewGroupPage.test.tsx`, `src/admin/__tests__/NewFormPage.test.tsx` (rewrite assertions to drive Display name input).
- Unchanged: `src/admin/GroupEditor.tsx` (already read-only), `src/admin/FormEditor.tsx` (no ID input), `src/admin/NewUserPage.tsx` (different dot-separated convention — out of scope).

**Server (no changes in this change)**
- `server/src/models/Group.ts`, `server/src/models/Form.ts` schemas unchanged.
- `server/src/routes/groups.ts`, `server/src/routes/forms.ts` unchanged.
- Server-side `SLUG_REGEX` enforcement deferred as a future defense-in-depth follow-up.

**APIs / contracts**
- `POST /api/itsm/groups` and `POST /api/itsm/forms` — payload shape unchanged. SPA now guarantees `_id` matches `SLUG_REGEX`.

**Kafka / Debezium / Camel / Helm**
- No impact. Downstream consumers already assume DNS-1123 IDs; this change tightens what the SPA produces, not what they consume.

**Dependencies**
- No new runtime or test dependencies. `String.prototype.normalize('NFD')` is standard ES2015.

**Testing strategy**
- **Unit**: `slug.test.ts` covers the slugify utility (diacritics, run-collapse, empty input, idempotence, `SLUG_REGEX` conformance).
- **Component (Vitest + Testing Library)**: rewrite `NewGroupPage.test.tsx` and `NewFormPage.test.tsx` to drive Display name and assert the read-only ID input renders the expected slug. Preserve the form-id collision test.
- **Contract / integration**: none required — wire format unchanged.
- **Manual**: SPA smoke-test the three cases (`Min. da fazenda`, `Educação`, `...`).
