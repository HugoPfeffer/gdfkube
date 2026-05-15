## Design Summary

Resolve the form-id ↔ chart-directory drift that breaks every "Cluster Scale Change" submission. `HelmValuesBuilder.getChartRef(event)` returns `event.formId` (`"scale-request"`), but the chart on disk is `gdfkube-infra/charts/scale-patch/`. `HelmRenderRoute` cannot resolve the chart and the pipeline silently dies after the SPA shows "Submitted".

The other two forms (`cluster-request`, `namespace-request`) already align with their chart directories — only `scale-request` diverges. The fix is a one-time alignment plus a regression test that enumerates every `forms.json` `_id` and asserts the chart directory exists.

## Alternatives Considered

### Option A: Rename chart directory `scale-patch` → `scale-request`
- **Approach**: `git mv` the chart dir, update `Chart.yaml` `name:` field, update the spec table, add a regression test.
- **Pros**:
  - Single rename; fewest surfaces touched.
  - Form id is referenced by SPA, `forms.json` seed, MongoDB live data, and audit log entries — leaving it untouched avoids any data migration.
  - Chart dir is referenced only by `HelmValuesBuilder.getChartRef` and `HelmRenderRoute`.
  - Aligns with the existing convention used by `cluster-request` / `namespace-request`.
- **Cons**:
  - Chart description ("…NodePool patch…") becomes slightly stale; flagged in audit I-14 to address separately.
- **Why not chosen**: ✅ Chosen.

### Option B: Rename form id `scale-request` → `scale-patch` (DB + seed + SPA)
- **Approach**: Update `forms.json` `_id`, run a live MongoDB rename of the corresponding `forms` doc, update SPA references, update audit log queries.
- **Pros**:
  - Keeps the chart name as-is.
- **Cons**:
  - Live `_id` rewrite on a primary key — Mongo requires delete+insert, with knock-on effects on referencing collections (audit log, request history).
  - SPA, seed, and DB must all change atomically.
  - Form id `scale-patch` is a worse user-facing label than `scale-request`.
- **Why not chosen**: Larger blast radius and worse naming. Migration risk is real.

### Option C: Introduce explicit `formId → chartName` map in `HelmValuesBuilder`
- **Approach**: Replace `getChartRef` with a lookup table; default to identity, override `scale-request → scale-patch`.
- **Pros**:
  - No filesystem or DB changes.
  - Future-proofs against further divergence.
- **Cons**:
  - Adds an indirection that must be kept in sync with disk anyway.
  - Premature abstraction — only one form diverges today.
  - Hides the drift instead of eliminating it.
- **Why not chosen**: Premature; reconsider when a fourth diverging chart appears.

## Agreed Approach

**Option A** — rename `gdfkube-infra/charts/scale-patch` to `scale-request`, update `Chart.yaml`, sync the OpenSpec chart table, and add a parameterized test that asserts every `forms.json` `_id` resolves to a real chart directory under `gdfkube-infra/charts/`.

## Key Decisions

- **Form id stays `scale-request`** — it's the primary key on the live `forms` doc and is referenced from many surfaces (SPA, audit log, history).
- **No explicit map** — eliminate the drift at its source rather than papering over it.
- **Regression test enumerates all `forms.json` ids** — single test prevents the next chart from drifting without anyone noticing.
- **Chart description rewording** (audit I-14, "…NodePool patch…" → "…NodePool manifest…") folded into this change since the file is already being touched.

## Open Questions

None — plan and verification steps are settled.
