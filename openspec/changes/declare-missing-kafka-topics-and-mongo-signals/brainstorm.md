## Design Summary

Two infra declarations were skipped when `auto-provision-org-resources-from-group-events` landed; both currently work only because the Kafka broker has `auto.create.topics.enable=true` and Debezium's signal feature is silently inert when its target collection does not exist. A stale `itsm-groups-collection` spec requirement also still claims the `groups` collection is excluded from the CDC include list, even though `auto-provision-org-resources-from-group-events` added it.

The agreed approach is the smallest, idempotent set of edits that declares both missing resources explicitly, removes the stale spec rule, and re-syncs every catalog/README that enumerates topics or CDC-watched collections — without renaming `dlq.gdfkube.groups` or touching broker config.

## Alternatives Considered

### Option A: Declare topics + collection explicitly, keep current names (CHOSEN)
- **Approach**: Add `dbz.gdfkube.groups` and `dlq.gdfkube.groups` to `gdfkube-infra/kafka/init-topics.sh`. Add `ensureCollection('debezium_signals')` to `gdfkube-infra/mongodb/init-camel-collections.js`. Update specs and READMEs to reflect the now-watched `groups` collection and the expanded topic catalog. Leave `OrgBootstrapRoute.java` and broker config untouched.
- **Pros**: Idempotent (script guards already exist). No producer/consumer code change. No DLQ migration. Audit findings A-12, A-20, A-21, A-23–A-26 all close in one change. Restores hard-declaration parity with peer topics.
- **Cons**: Keeps the `dlq.gdfkube.groups` name that arguably violates the `dlq.gdfkube.<route-id>` pattern (L-4 in unified audit). Leaves broker `auto.create.topics.enable=true` (operational hardening deferred).
- **Why chosen**: Closes the two C-rated audit findings with zero blast on running code and unblocks `strengthen-org-bootstrap-tests`. The naming and broker-hardening concerns are explicitly out of scope per the unified findings (L-4 not promoted; broker hardening is a separate operational plan).

### Option B: Rename `dlq.gdfkube.groups` → `dlq.gdfkube.org-bootstrap` as part of this change
- **Approach**: Declare both topics, but also edit `OrgBootstrapRoute.java:69` to publish to the renamed DLQ and update catalog/specs accordingly.
- **Pros**: DLQ naming becomes consistent with the `dlq.gdfkube.<route-id>` convention used elsewhere.
- **Cons**: Forces a code change in Camel, breaks any in-flight DLQ assertions in `strengthen-org-bootstrap-tests`, and contradicts unified-findings amendment A-20 which explicitly canonicalises the *current* name. Adds migration risk (in-flight messages on the old topic would be orphaned).
- **Why not chosen**: L-4 was *not* promoted to a decision. The single source of truth (unified audit) adds the current name to the catalog. Renaming would re-open settled scope.

### Option C: Disable broker `auto.create.topics.enable` and declare everything
- **Approach**: Same edits as Option A, plus flip the broker config so undeclared topics fail loudly going forward.
- **Pros**: Eliminates the class of "works only because auto-create masks the omission" bugs.
- **Cons**: Operational risk — any other consumer that has been silently relying on auto-create will start erroring. Belongs in a hardening plan with its own rollout window and rollback path.
- **Why not chosen**: Out of scope per the source plan. The two C-rated findings can be closed without touching broker config; conflating the two would delay this change.

## Agreed Approach

Option A. Declarative parity with the smallest surface: two `create_topic` lines, one `ensureCollection` line, one spec deletion, one broker-stack catalog bump, three README touch-ups. The DLQ name stays `dlq.gdfkube.groups` (canonical per A-20), the route is untouched, and broker hardening is left to a future operational change.

## Key Decisions

- **Canonical DLQ name for org-bootstrap is `dlq.gdfkube.groups`.** Confirmed via unified-findings A-20 and the existing `OrgBootstrapRoute.java:69` usage. No rename.
- **`debezium_signals` needs no index.** It has no app-level reads — Debezium polls it via the connector. Implicit `_id` is sufficient.
- **`init-topics.sh` echo count must match reality.** The plan calls out two new `create_topic` invocations; the trailing echo must be re-derived from the actual count after editing (the plan says 12 → 14, but a verification step will confirm).
- **Stale spec requirement gets deleted, not amended.** "Groups Not in CDC Include List" is now false; rewriting it would be misleading. Delete the entire requirement.
- **README parity is part of this change, not a follow-up.** The unified-findings amendments A-23 through A-26 are bundled here so docs and code land in the same commit and `align-chart-and-gitea-endpoint-drift.md` doesn't collide on README hunks.

## Open Questions

- None. The plan is verified against the codebase as of 2026-05-14 and all amendments trace to a single source-of-truth (`tmp/unified-audit-findings.md` C-4/C-5 + A-12, A-20, A-21, A-23–A-26).
