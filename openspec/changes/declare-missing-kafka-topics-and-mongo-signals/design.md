## Context

The `auto-provision-org-resources-from-group-events` change wired `OrgBootstrapRoute.java` to:
- consume `kafka:dbz.gdfkube.groups` (CDC stream from the `groups` collection — added to Debezium's include list in that same change),
- publish failures to `kafka:dlq.gdfkube.groups`,
- and rely on `gdfkube.debezium_signals` for ad-hoc snapshot signalling (declared in `gdfkube-infra/debezium/connector-config.json:10` as `signal.data.collection`).

None of those three resources are declared by their source-of-truth bootstrap scripts (`gdfkube-infra/kafka/init-topics.sh` and `gdfkube-infra/mongodb/init-camel-collections.js`). They function today because:
1. The Kafka broker config has `auto.create.topics.enable=true`, so the two `dbz.gdfkube.groups` / `dlq.gdfkube.groups` topics are silently created on first publish/subscribe with the broker's default partitions/RF/retention — not the values the other catalog rows use.
2. Debezium's signal feature is a no-op when its target collection doesn't exist; it logs nothing fatal, so the gap is invisible.

Two specs are also out of sync:
- `openspec/specs/itsm-groups-collection/spec.md` (lines 85–92) still has a "Groups Not in CDC Include List" requirement — that statement is now false.
- `openspec/specs/kafka-broker-stack/spec.md` enumerates 9 catalog rows and asserts "All 9 catalog topics" in its catalog-coverage requirement (line 53 region) and scenarios (lines 71, 76). The catalog should be 11 once the two `groups` topics are declared.

The single source of truth for the full audit context is `tmp/unified-audit-findings.md` C-4 + C-5 ("Critical") and amendments A-12, A-20, A-21, A-23–A-26.

Constraints:
- The `dlq.gdfkube.groups` name must not change — `OrgBootstrapRoute.java:69` uses it, and `strengthen-org-bootstrap-tests` (blocked by this change) will assert against it.
- Broker config (`auto.create.topics.enable`) is out of scope; flipping it is operational hardening with its own rollout window.
- Renaming `dlq.gdfkube.groups` to follow the `dlq.gdfkube.<route-id>` pattern (L-4 in the unified findings) was *not* promoted to a decision; the canonical name stays `dlq.gdfkube.groups`.

Stakeholder: solo developer (Hugo Pfeffer). No external integrations need a heads-up.

## Goals / Non-Goals

**Goals:**
- Declare `dbz.gdfkube.groups` and `dlq.gdfkube.groups` with the same partition/RF/retention defaults as their peers in `init-topics.sh`.
- Declare `gdfkube.debezium_signals` in `init-camel-collections.js`, idempotently.
- Delete the stale `itsm-groups-collection` "Groups Not in CDC Include List" requirement.
- Update `kafka-broker-stack` spec catalog table (9 → 11 rows) and the matching count copy in the catalog-coverage requirement and its scenarios.
- Re-sync the three READMEs (`mongodb`, `debezium`, `kafka`) that enumerate CDC-watched collections, topic-prefix mappings, or consumer-group topic lists.

**Non-Goals:**
- Renaming `dlq.gdfkube.groups` to `dlq.gdfkube.org-bootstrap` (L-4 — naming consistency only, no decision made).
- Disabling `auto.create.topics.enable` on the broker (operational hardening, separate plan).
- Compaction / retention tuning beyond existing defaults.
- Adding indexes to `debezium_signals` (no app-level reads).
- Touching `OrgBootstrapRoute.java` (route is correct; only its declarations are missing).

## Decisions

**D1: Declare both topics explicitly with peer defaults rather than relying on auto-create.**
- Rationale: Auto-created topics inherit broker defaults, not the catalog defaults (`num.partitions`, `default.replication.factor`, retention). Hard declaration gives deterministic config and lets the catalog-coverage scenario in `kafka-broker-stack/spec.md` enforce drift detection.
- Alternative: leave auto-create as the mechanism. Rejected — it masks the C-4/C-5 findings and the two topics inherit potentially different defaults from their peers.

**D2: `dlq.gdfkube.groups` keeps its current name.**
- Rationale: `OrgBootstrapRoute.java:69` uses it; unified-findings A-20 canonicalises the current name; `strengthen-org-bootstrap-tests` (blocked by this change) will assert against it; renaming would also orphan any in-flight messages on the auto-created topic.
- Alternative: rename to `dlq.gdfkube.org-bootstrap` for pattern consistency (L-4). Rejected — L-4 was not promoted to a decision; conflating naming with declaration would scope-creep this change.

**D3: `debezium_signals` is created with no indexes.**
- Rationale: The collection is polled by the Debezium connector via its own driver; no app-level read path uses it. Implicit `_id` is enough for the connector's signal-message lookup pattern.
- Alternative: add a TTL index on a `created_at` field for housekeeping. Rejected — Debezium consumes and acknowledges signal documents itself; an external TTL would race with that. Out of scope.

**D4: Delete the stale spec requirement, do not rewrite it.**
- Rationale: "Groups Not in CDC Include List" is now false. Rewriting it to say the opposite ("Groups Are in the CDC Include List") would duplicate coverage that already lives in the `auto-provision-org-resources-from-group-events`-era requirements. Deletion keeps the spec minimal.
- Alternative: invert the requirement. Rejected — duplicate of existing coverage; would just be dead weight.

**D5: README sync ships with the code/spec edits in one change.**
- Rationale: Splitting docs into a follow-up would conflict with `align-chart-and-gitea-endpoint-drift.md`, which edits adjacent README hunks. Bundling here means docs, specs, and scripts move together; the audit's A-23–A-26 amendments all close in one shot.
- Alternative: separate docs change. Rejected — creates merge conflicts and leaves the catalog in a half-synced state in between.

**D6: Re-derive the `init-topics.sh` trailing echo count from actual `create_topic` invocations after editing.**
- Rationale: The plan suggests 12 → 14 but the script's exact count must be confirmed in the file. The verification step greps and counts to catch the off-by-one drift class.
- Alternative: trust the plan number. Rejected — that's how drift happens.

## Risks / Trade-offs

- **[Risk]** `init-topics.sh` re-run on an existing cluster may attempt to alter the auto-created topic's config to match the declared values, depending on the `kafka-topics --create --if-not-exists` semantics in use. → **Mitigation:** `--if-not-exists` only creates when absent; declared values diverge only if the auto-created topic was created with broker defaults that differ from the catalog. In dev, the topics get re-created on each clean-stack run; in prod, no live cluster is yet relying on auto-created defaults for these two names (this change is being made *because* the resources are missing from clean-stack bootstrap). Verification step #1 explicitly re-runs from a clean stack.
- **[Risk]** Adding `debezium_signals` could enable Debezium ad-hoc snapshots that nobody expected to fire. → **Mitigation:** The collection is empty after `ensureCollection`. No signal documents are inserted by this change. Ad-hoc snapshots only run when a developer/operator inserts a signal document.
- **[Trade-off]** Keeping `dlq.gdfkube.groups` perpetuates the L-4 naming inconsistency. → Accepted by D2's rationale. If L-4 is later promoted to a decision, it becomes a follow-up with its own migration plan.
- **[Risk]** Spec count drift between catalog table rows and the catalog-coverage scenario assertion. → **Mitigation:** Verification step counts both and fails the change if they disagree.

## Migration Plan

1. Edit `gdfkube-infra/kafka/init-topics.sh` to add the two `create_topic` lines; re-derive the trailing echo count.
2. Edit `gdfkube-infra/mongodb/init-camel-collections.js` to add `ensureCollection('debezium_signals')`.
3. Edit `openspec/specs/itsm-groups-collection/spec.md` to delete the "Groups Not in CDC Include List" requirement (lines 85–92 region).
4. Edit `openspec/specs/kafka-broker-stack/spec.md` to add two catalog rows, bump "All 9 catalog topics" → "All 11 catalog topics", and bump the two `9` → `11` scenario references.
5. Edit the three READMEs as enumerated in the proposal.
6. Run verification steps (clean-stack bootstrap, `kafka-topics --list`, `mongosh` collection list, `./mvnw test` for the Camel module, `openspec validate`, and the stale-requirement grep).
7. **Rollback:** revert the commit. `init-topics.sh` and `init-camel-collections.js` re-running on the reverted state is idempotent (the existing `--if-not-exists` and JS guards). No DLQ message migration is required because the topic name does not change.

## Open Questions

- None. All facts verified against the codebase on 2026-05-14; all amendments trace to `tmp/unified-audit-findings.md`.
