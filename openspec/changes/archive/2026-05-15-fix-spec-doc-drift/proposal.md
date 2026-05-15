## Why

`docs/*.md` claims most pipeline components are `Planned`, but `gdfkube-infra/{mongodb,kafka,debezium,gitea}/`, `gdfkube-camel/`, and `gdfkube-itsm/server/` are populated and the corresponding archived changes have shipped. None of the 24 specs in `openspec/specs/` are referenced from any doc, so a future-self reading `docs/03-mongodb.md` cannot navigate to `mongodb-replica-set-stack` or know it owns the contract. `Last validated: 2026-05-05` lies — at least nine days of archives have landed since. Fix it now while the scope is 14 files; let it drift further and the cleanup turns into rewriting docs from scratch.

## What Changes

**Status badges in component docs**
- From: every component doc except `01-itsm-portal.md` carries `Implementation Status: Planned`.
- To: each badge is re-derived from `gdfkube-src/` contents AND the archived changes — `Implemented` only when both code and an archived enabling change exist; `Partially implemented` when one is present but the other is incomplete; `Planned` when neither; `Deferred` when explicitly out of scope.
- Reason: the docs misrepresent what is shipped, which corrupts every downstream decision based on them.
- Impact: non-breaking — documentation only; readers see accurate status.

**Spec backlinks**
- From: docs do not reference any spec under `openspec/specs/`; the 24 specs are unreachable from doc navigation.
- To: each component doc gains a `## Specs` section listing the spec slugs (with relative path links to `openspec/specs/<slug>/spec.md`) that own its contracts.
- Reason: contracts live in specs; docs are the human-facing entry point. Without the link the entry point is a dead end.
- Impact: non-breaking — additive section; existing prose untouched.

**Validation date**
- From: `Last validated: 2026-05-05` on every component doc.
- To: `Last validated: 2026-05-14` on every component doc actually re-checked in this change.
- Reason: stale freshness signals are worse than no signal — they invite false trust.
- Impact: non-breaking.

**`docs/README.md` index**
- From: status table mirrors the (stale) per-doc badges.
- To: status table is regenerated from the rewritten per-doc badges so the index and the docs agree.
- Impact: non-breaking.

**Out of scope**: doc bodies, diagrams, "Decisions Resolved" / "Open Questions" sections, any code, any spec, any manifest, any retrospective rule change. Those are deliberate non-goals — see brainstorm.md.

## Capabilities

### New Capabilities
- `gdfkube-architecture-docs`: codifies the contract for the `docs/` reference set — that each component doc carries an evidence-derived `Implementation Status` badge from a fixed vocabulary, lists the specs that own its contracts under a `## Specs` section, and refreshes its `Last validated` date when re-checked. This change introduces the capability *and* applies it across the existing 14 docs.

### Modified Capabilities
None. No existing spec's requirements change. The 24 specs under `openspec/specs/` are unchanged; only the docs that point at them are rewritten.

## Impact

- **Affected files**: `docs/README.md` and `docs/00-architecture-overview.md` through `docs/13-observability.md` — 15 files total.
- **Affected services**: none. No runtime, no deploy, no API.
- **Affected APIs / endpoints**: none.
- **Affected Kafka topics**: none.
- **Affected MongoDB collections**: none.
- **Affected Helm charts / manifests**: none.
- **Downstream consumers**: only human readers of `docs/`. No scripts, CI checks, or generators consume these docs today (verified — `grep -r "docs/0" .github/ scripts/ 2>/dev/null` returns nothing pipeline-relevant).
- **Dependency versions**: none added, removed, or pinned. No package.json, pom.xml, or Helm Chart.yaml is touched.
- **Testing strategy**:
  - *Unit / integration / contract*: not applicable — no code changes.
  - *Documentation verification*: per-doc manual review against `gdfkube-src/` evidence and the spec list (`ls openspec/specs/`). The verify artifact lists the exact evidence each badge rests on.
  - *Cross-link check*: every spec slug listed in a doc's `## Specs` section must resolve to an existing `openspec/specs/<slug>/spec.md`; this is checkable with a one-line shell loop and is part of the verify checklist.
- **Risk**: low. Worst case is a misclassified status badge, fixable in a follow-up edit. No production impact possible.
