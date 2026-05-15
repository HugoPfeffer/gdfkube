## Context

`docs/` is a 14-file aspirational architecture reference. It was originally lifted from a handoff (`.tmp/handoff/.../app.jsx`) on 2026-05-05. Since then:

- `gdfkube-src/gdfkube-itsm/server/` was added (express API, Vitest tests).
- `gdfkube-src/gdfkube-infra/{mongodb,kafka,debezium,gitea}/` were populated with init scripts, connector configs, and bootstrap shells.
- `gdfkube-src/gdfkube-infra/charts/{cluster-request,infra,namespace-request,scale-patch}/` Helm charts were added.
- `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/{routes,git,bean,model}/` was added (Quarkus Camel).
- 12 changes were archived (oldest 2026-05-06, newest 2026-05-14).
- 24 specs were added under `openspec/specs/`.

The docs do not reflect any of this. `01-itsm-portal.md` is partially correct; everything else still says `Planned` and points only at the handoff for its source. The `## Specs` connection between human-facing docs and machine-checkable contracts has never existed.

The author is the sole consumer of these docs. They are not read by CI, scripts, or generators (`grep -r "docs/0" .github/ scripts/ 2>/dev/null` returns nothing pipeline-relevant), so accuracy is the only constraint — there is no downstream contract to break.

## Goals / Non-Goals

**Goals:**
- Every component doc badge reflects what is actually in `gdfkube-src/` and what is archived.
- Every component doc lists the specs that own its contracts, with a working relative link.
- `docs/README.md`'s status table matches the per-doc badges after the sweep.
- `Last validated:` reads `2026-05-14` on every component doc that was re-checked.
- Atomic: one commit, one diff, one PR.

**Non-Goals:**
- No body rewrites (prose, diagrams, "Decisions Resolved", "Open Questions").
- No new docs.
- No spec edits, additions, or archives.
- No code, manifests, or Helm values touched.
- No drift-detection script, CI check, or generator. (Candidate follow-up; see Risks.)
- No edit to `openspec/config.yaml` `retrospective` rules to require future doc updates. (Same — candidate follow-up.)

## Decisions

### D1. Status vocabulary stays as `docs/README.md` already declares it

`Implemented` / `Planned` / `Deferred` are the documented states. We add **`Partially implemented`** as a fourth state where evidence demands it (e.g., Helm charts exist but no operator wraps them; Camel routes exist but the spec lists requirements not yet satisfied by code). We do **not** invent further states like `In progress`, `Stub`, or `Spec-only` — those obscure rather than clarify, and the trade-off (slightly coarser bucket) is worth the simpler vocabulary.

**Alternatives considered:** add a `Spec-only` state for components with a spec but no code (e.g., `gdfkube-audit-log-collection`). Rejected because the only such cases live inside ITSM where the parent doc is already `Implemented` — splitting hairs at the sub-spec level adds noise without informing any decision.

### D2. Status is derived from BOTH code presence AND an archived enabling change

A folder under `gdfkube-src/` alone is not "Implemented" — it could be a stub. An archived change alone is not "Implemented" — it could have shipped a doc-only or scaffolding-only delta. A component is `Implemented` only when both hold. When one holds and the other does not, it is `Partially implemented`. When neither holds, it is `Planned`.

**Alternatives considered:** rely solely on archived changes (rejected — opaque to a reader who hasn't read the archive); rely solely on folder presence (rejected — folders can be skeletons).

### D3. Per-doc status classification (this is the source of truth for the implementation)

| Doc | Code evidence under `gdfkube-src/` | Archived change(s) | New badge |
|---|---|---|---|
| `00-architecture-overview.md` | n/a (reference doc) | n/a | `Reference` (unchanged label, refresh date only) |
| `01-itsm-portal.md` | `gdfkube-itsm/{src,server,Dockerfile,nginx.conf}` | `build-itsm-portal`, `containerize-itsm-and-mongodb`, `fix-itsm-portal-bug-batch`, `fix-itsm-portal-design-drift` | `Implemented` |
| `02-express-api.md` | `gdfkube-itsm/server/{src,__tests__,Dockerfile,vitest.config.ts}` | `add-itsm-express-api`, `auto-provision-org-resources-from-group-events` | `Implemented` |
| `03-mongodb.md` | `gdfkube-infra/mongodb/{init-rs.js,init-camel-collections.js,seed-collections.js,seed-data}` | `containerize-itsm-and-mongodb` | `Implemented` |
| `04-debezium.md` | `gdfkube-infra/debezium/{connector-config.json,register-connector.sh,init-connect-topics.sh}` | none (config exists, no end-to-end archive yet) | `Partially implemented` |
| `05-kafka.md` | `gdfkube-infra/kafka/{init-topics.sh}` | `kafka-broker-stack`, `pipeline-end-to-end` | `Implemented` |
| `06-camel.md` | `gdfkube-camel/src/main/java/gov/gdf/camel/{routes,git,bean,model}/`, `pom.xml` | `harden-camel-build-verification`, `auto-provision-org-resources-from-group-events` | `Partially implemented` (routes exist; spec `camel-orchestrator-stack` has requirements still unmet) |
| `07-helm.md` | `gdfkube-infra/charts/{cluster-request,infra,namespace-request,scale-patch}/` | `auto-provision-org-resources-from-group-events` | `Partially implemented` (charts exist; no helm-specific spec) |
| `08-git.md` | `gdfkube-infra/gitea/{bootstrap.sh,seed-repos.sh,sync-token.sh}` | `add-local-gitea-compose`, `add-gitea-settings`, `fix-gitea-settings-review`, `auto-provision-org-resources-from-group-events` | `Implemented` |
| `09-argocd.md` | none | `pipeline-end-to-end` (mentions only) | `Planned` |
| `10-rhacm.md` | none | none | `Planned` |
| `11-hypershift.md` | none | none | `Planned` |
| `12-security-rbac.md` | none | none | `Planned` |
| `13-observability.md` | none | none | `Deferred` (unchanged) |

Implementation MUST follow this table exactly. If a contributor disagrees with a row at implementation time, they update the row in this design doc and explain why in the commit message — not silently in the doc edit.

### D4. Spec → doc mapping (also source of truth)

| Doc | Specs to list under `## Specs` |
|---|---|
| `00-architecture-overview.md` | (none — overview points to the index, not individual specs) |
| `01-itsm-portal.md` | `itsm-portal-shell`, `itsm-dashboard`, `itsm-service-catalog`, `itsm-request-submission`, `itsm-request-detail`, `itsm-requests-list`, `itsm-approvals-queue`, `itsm-admin-forms`, `itsm-admin-settings`, `itsm-admin-users`, `itsm-container-image` |
| `02-express-api.md` | `itsm-express-api` |
| `03-mongodb.md` | `mongodb-replica-set-stack`, `itsm-forms-collection`, `itsm-groups-collection`, `itsm-requests-collection`, `itsm-settings-collection`, `itsm-users-collection`, `gdfkube-audit-log-collection`, `gdfkube-dlq-log-collection` |
| `04-debezium.md` | `debezium-connect-stack` |
| `05-kafka.md` | `kafka-broker-stack` |
| `06-camel.md` | `camel-orchestrator-stack` |
| `07-helm.md` | (none today — no spec exists for the Helm template-only model) |
| `08-git.md` | `gitea-stack` |
| `09-argocd.md` | (none) |
| `10-rhacm.md` | (none) |
| `11-hypershift.md` | (none) |
| `12-security-rbac.md` | (none) |
| `13-observability.md` | (none) |

A doc with no specs gets the section anyway, with body text `_No specs yet — this component is not contracted._`. This is a deliberate signal that a future change introducing the contract should backfill the link.

### D5. Spec link format

Use relative paths from each component doc to the spec markdown:

```markdown
## Specs

- [`itsm-express-api`](../openspec/specs/itsm-express-api/spec.md)
```

The slug is in backticks (it is an identifier, not prose); the link target is the full path so the link works in GitHub, in `mdcat`, and in IDE preview without ambiguity. Listed alphabetically per doc.

### D6. `Last validated` is set to today only on docs actually re-checked

Every doc except `13-observability.md` is re-checked in this change, so all of them get `Last validated: 2026-05-14`. `13-observability.md` is `Deferred` — the badge moves but the validation date stays empty or absent (it was never validated against code; advancing it would be the same lie we're fixing).

### D7. `docs/README.md` table regeneration is mechanical

The status column for each row in `docs/README.md`'s index table is overwritten with the new badge value verbatim. No prose around the table changes. The "Conventions" section is updated only if `Partially implemented` is introduced (it is) — append one bullet defining it.

## Risks / Trade-offs

- **[Risk] Misclassification of borderline components (debezium, camel, helm).** → Mitigation: D3 commits the exact mapping in this design doc. Disagreements are resolved by editing this table and explaining the change, not by quietly rewriting the doc badge.
- **[Risk] Re-drift the next time a change archives without updating docs.** → Mitigation: out of scope here. Tracked as a candidate follow-up to add a `docs:` rule under `openspec/config.yaml`'s `retrospective` block. The retrospective for *this* change must mention it explicitly so the follow-up isn't forgotten.
- **[Risk] Dead spec links if a spec is renamed or archived after this change lands.** → Mitigation: relative-path links surface as 404 in any rendered view; the verify checklist includes a one-shot link-existence check (`for s in $(grep -oE 'openspec/specs/[a-z0-9-]+/spec.md' docs/*.md); do test -f "$s" || echo "MISSING: $s"; done`).
- **[Trade-off] No automated drift check.** Choosing not to build the check leaves the same failure mode in place for the next change to trip on. Accepted because the cost of the check (CI wiring + a script the author has to maintain) exceeds the cost of one more manual sweep, and Option C in `brainstorm.md` argued it solves the wrong problem (mechanism vs. state).
- **[Trade-off] No docs body refresh.** Diagrams and prose may still reflect the handoff, not current code (e.g., `04-debezium.md`'s SMT description may be outdated). Accepted because per-component body audits are large enough to deserve their own changes; this sweep is about navigation and freshness signals, not content.

## Migration Plan

No deploy. No rollback story needed beyond `git revert` of the single commit. No MongoDB schema, no Kafka consumer group, no Helm value changes — the migration concerns the rules call out are all N/A.

Steps:
1. Apply edits per D3, D4, D5, D6, D7. Single commit.
2. Verify (per verify.md): every spec slug listed resolves to an existing file; every badge listed in D3 matches what landed in the doc; `docs/README.md` index matches the per-doc badges.
3. Open PR. Reviewer checks the diff against this design's tables.

If any row in D3 or D4 is wrong, fix it in this design first, commit that fix, then update the doc(s) — never the other way around.

## Open Questions

None. The status mapping (D3) and spec mapping (D4) are committed; any future disagreement is handled by editing those tables in a follow-up commit, not by ad-hoc divergence.
