## Design Summary

The `docs/` architecture reference has drifted from reality on three axes:

1. **Status badges are stale.** Every doc except `01-itsm-portal.md` claims `Implementation Status: Planned`, but `gdfkube-infra/{mongodb,kafka,debezium,gitea}/`, `gdfkube-camel/`, and `gdfkube-itsm/server/` are all populated, and the corresponding archived changes (`add-itsm-express-api`, `containerize-itsm-and-mongodb`, `kafka-broker-stack`, `add-local-gitea-compose`, etc.) have shipped.
2. **Specs are invisible from the docs.** All 24 entries under `openspec/specs/` are unreferenced from any `docs/*.md`. Future-self reading a doc cannot navigate to the spec that owns the requirement, and there is no signpost telling the reader where the contract lives.
3. **The "Last validated" date (2026-05-05) lies.** Multiple proposals have landed since (e.g., `auto-provision-org-resources-from-group-events` archived 2026-05-14), so the validation date is at minimum nine days stale and silently misleads any reader who treats it as a freshness signal.

The fix is a one-shot doc sweep: re-derive each component's status from `gdfkube-src/` + `openspec/specs/` + the archive, rewrite the badges, add a "Specs" backlink section to each component doc, refresh the `Last validated` line, and update `docs/README.md`'s status table.

This change is **documentation-only**. No code, no specs, no manifests change. Therefore no spec deltas are produced.

## Alternatives Considered

### Option A: One-shot manual sweep (chosen)
- **Approach**: A single change rewrites every `docs/*.md` header in one PR. Status badges are derived per-doc from `gdfkube-src/` contents and the matching specs. Each doc gets a "Specs" section listing the spec slugs that own its component. `docs/README.md` status table is regenerated. `Last validated` is set to today.
- **Pros**: Atomic — all docs reach a consistent state in one commit, easy to review as a single diff, no half-migrated state, no scripting overhead for a 14-file scope.
- **Cons**: Re-drifts immediately if no follow-up discipline is added. Mitigated by adding a doc-update step to the openspec retrospective rules in a follow-up.
- **Why chosen**: Smallest change that resolves the user-visible drift today; the scope (14 docs) does not justify automation.

### Option B: Generated docs from specs
- **Approach**: Treat `openspec/specs/` as source of truth and generate the per-component status table (and possibly the doc bodies) via a script run in CI. Docs become read-only artifacts.
- **Pros**: Eliminates drift permanently — the next archive cannot leave docs stale.
- **Cons**: Large up-front cost (template engine, CI wiring, doc rewrites to a generated-friendly shape), unclear how to encode the prose ("Role in the Pipeline", diagrams) in spec frontmatter without bloating the specs, and it conflicts with the docs' stated audience ("solo developer's future-self" — a generator's output is rarely as readable as hand-tuned prose).
- **Why not chosen**: Disproportionate to the size of the drift. The repo has 14 docs and one author; a generator earns its keep in a 100-doc multi-team repo, not here.

### Option C: Add a drift-detection check, fix nothing yet
- **Approach**: Write a script (e.g. `scripts/check-doc-drift.sh`) that diffs spec slugs against doc references and fails CI when they diverge. Leave the existing drift in place; let the check force the next change to fix what it touches.
- **Pros**: Forces discipline going forward without rewriting docs now.
- **Cons**: Leaves the user reading wrong "Planned" badges today. Punishes the next unrelated change with a cleanup obligation it didn't cause. Solves the wrong problem (mechanism vs. current state).
- **Why not chosen**: The user filed this change because the current state is wrong. Fix the state; address the mechanism separately if it recurs.

## Agreed Approach

**Option A**, with these specifics:

- Scope is `docs/00-architecture-overview.md` through `docs/13-observability.md` plus `docs/README.md`. No other files touched.
- Each component doc gets:
  - Updated `Implementation Status:` badge (`Implemented` / `Partially implemented` / `Planned` / `Deferred`) derived from concrete evidence in `gdfkube-src/` and `openspec/specs/`.
  - A new `## Specs` section near the top, listing the spec slugs (with relative path links to `openspec/specs/<slug>/spec.md`) that own contracts for the component.
  - Refreshed `Last validated:` set to **2026-05-14**.
- `docs/README.md`'s status table is regenerated from those per-doc badges so the index and the docs agree.
- No new docs are created. No specs are added, modified, or archived. No code changes.

## Key Decisions

- **Status vocabulary stays as documented in `docs/README.md`** (`Implemented`, `Planned`, `Deferred`). Add `Partially implemented` only where evidence demands it (e.g., container manifests exist but no operator yet) — do not invent other states.
- **Spec links are by relative path**, not by name only, so the badges work in both GitHub-rendered and local previews.
- **Truth source for status:** presence of code under `gdfkube-src/` AND presence of an archived change in `openspec/changes/archive/` for the relevant component. A spec alone is not "Implemented"; a folder with a stub Helm chart is not "Implemented" either. Both must hold.
- **Out of scope (for this change):** doc body rewrites, diagram updates, decision-log refreshes, any "Open Questions" curation. Those are content edits per component and belong in component-specific changes, not in a drift sweep.
- **Out of scope (for now, candidate follow-up):** adding a `docs:` step to `openspec/config.yaml`'s `retrospective` rules so future archives must update affected docs. Tracked as a note in retrospective; not part of this change.

## Open Questions

None blocking. The status badge classification per component is a judgment call but the evidence (folder contents + archived changes) is unambiguous enough for the author to decide during implementation without further input.
