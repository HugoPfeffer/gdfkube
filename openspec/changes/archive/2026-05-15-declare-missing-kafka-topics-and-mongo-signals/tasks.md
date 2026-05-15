## 1. Declare missing Kafka topics in init-topics.sh

- [x] 1.1 Open `gdfkube-src/gdfkube-infra/kafka/init-topics.sh` and verify the current `create_topic` invocation count by `grep -c '^[[:space:]]*create_topic' init-topics.sh`; record the number for the echo update in 1.4.
- [x] 1.2 Insert `create_topic "dbz.gdfkube.groups"         1 3 604800000` immediately after the existing `dbz.gdfkube.forms` line, matching its column alignment.
- [x] 1.3 Insert `create_topic "dlq.gdfkube.groups"         1 3 2592000000` in the DLQ block alongside the other `dlq.gdfkube.*` entries, matching their column alignment.
- [x] 1.4 Re-derive the trailing echo's topic count: re-run `grep -c '^[[:space:]]*create_topic' init-topics.sh`; update the script's `echo "✅ Created N topics …"` (or equivalent) line so `N` matches the new count.

## 2. Declare debezium_signals collection in init-camel-collections.js

- [x] 2.1 Open `gdfkube-src/gdfkube-infra/mongodb/init-camel-collections.js` and confirm an `ensureCollection` helper exists (it is used for `audit_log` / `dlq_log`); reuse it rather than introducing a new helper.
- [x] 2.2 Insert `ensureCollection('debezium_signals');` immediately before the first `ensurePreImage('requests')` call so the collection is created before pre-image flags are applied.
- [x] 2.3 Confirm no index call is added — the implicit `_id` index is sufficient (see design D3).

## 3. Update OpenSpec specs (source-of-truth requirements)

- [x] 3.1 In `openspec/specs/itsm-groups-collection/spec.md`, delete the entire `### Requirement: Groups Not in CDC Include List` block (header, body, and its `#### Scenario: docs/04-debezium.md is unchanged by this collection` scenario, plus the trailing `---` separator if it leaves an orphan).
- [x] 3.2 In `openspec/specs/kafka-broker-stack/spec.md`, rename the requirement header `### Requirement: All 9 catalog topics SHALL exist with exact settings after kafka-init exits` to `### Requirement: All 11 catalog topics SHALL exist with exact settings after kafka-init exits`.
- [x] 3.3 In the same requirement, insert two new catalog rows into the topic table — `dbz.gdfkube.groups` (1 / 3 / 604800000 / 2) directly below the `dbz.gdfkube.forms` row, and `dlq.gdfkube.groups` (1 / 3 / 2592000000 / 2) directly below the `dlq.gdfkube.repo-bootstrap` row.
- [x] 3.4 In the same requirement, rename the scenario header `#### Scenario: All 9 topics exist after kafka-init` to `#### Scenario: All 11 topics exist after kafka-init` and update its body's `print all 9 topic names` → `print all 11 topic names`.

## 4. Sync drift in READMEs

- [x] 4.1 In `gdfkube-src/gdfkube-infra/mongodb/README.md`, flip the CDC-watched column for the `groups` row from `No` to `Yes` (audit amendment A-23).
- [x] 4.2 In the same file, restructure the CDC-watched / admin-only section so `groups` is listed under the CDC-watched group and only `users` remains in the admin-only section (audit amendment A-24).
- [x] 4.3 In `gdfkube-src/gdfkube-infra/debezium/README.md`, add `dbz.gdfkube.groups -- CDC events from the groups collection` to the topic-prefix mapping list, preserving the existing line ordering (audit amendment A-25).
- [x] 4.4 In `gdfkube-src/gdfkube-infra/kafka/README.md`, add `dbz.gdfkube.groups` to the `gdfkube-camel` consumer-group topic list, preserving alphabetical or shipping order matching its peers (audit amendment A-26).

## 5. Verify the change end-to-end

- [x] 5.1 Run `openspec validate "declare-missing-kafka-topics-and-mongo-signals"` and confirm it reports valid.
- [x] 5.2 Run `grep -n "Groups Not in CDC Include List" openspec/specs/itsm-groups-collection/spec.md` and confirm zero hits.
- [x] 5.3 Run `grep -c '^[[:space:]]*create_topic' gdfkube-src/gdfkube-infra/kafka/init-topics.sh` and confirm the number matches the trailing `echo` count edited in 1.4.
- [x] 5.4 From a clean stack, run `docker compose up kafka1 kafka2 kafka3 kafka-init` and confirm `kafka-init` exits 0 and `kafka-topics.sh --bootstrap-server kafka1:19092 --list` prints `dbz.gdfkube.groups` and `dlq.gdfkube.groups`.
- [x] 5.5 In the same clean stack, run `mongosh "$MONGO_URI" --eval 'use gdfkube; db.getCollectionNames()'` and confirm `debezium_signals` is in the output.
- [x] 5.6 Insert a synthetic ad-hoc snapshot signal document into `gdfkube.debezium_signals` via `mongosh` and confirm the Debezium connector logs the signal action (previously a silent no-op).
- [x] 5.7 Run `./mvnw -pl gdfkube-src/gdfkube-camel test` and confirm the integration profile asserts `dlq.gdfkube.groups` is the org-bootstrap DLQ destination; green required.
- [x] 5.8 Run `pre-commit run --all-files` and confirm the trufflehog hook is green (no new secret-shaped strings introduced by the README edits).
