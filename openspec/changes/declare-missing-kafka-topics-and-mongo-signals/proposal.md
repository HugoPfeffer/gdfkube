## Why

`auto-provision-org-resources-from-group-events` shipped consuming `dbz.gdfkube.groups` and producing to `dlq.gdfkube.groups`, and assumed Debezium ad-hoc signals would work — but neither topic is declared in `init-topics.sh` and `gdfkube.debezium_signals` is never created. It only works because the broker has `auto.create.topics.enable=true` and Debezium silently no-ops when its signal collection is absent. The `itsm-groups-collection` spec also still asserts `groups` is excluded from the CDC include list, which is now false. Closing these unifies infra declarations with running code before `strengthen-org-bootstrap-tests` adds DLQ assertions that depend on the topic existing.

## What Changes

**Kafka topic catalog**
- From: `init-topics.sh` declares 12 topics; `dbz.gdfkube.groups` and `dlq.gdfkube.groups` rely on broker auto-create.
- To: `init-topics.sh` declares both topics explicitly with the same replication/retention defaults as their peers.
- Reason: Removes silent dependency on `auto.create.topics.enable=true`; required for `strengthen-org-bootstrap-tests` DLQ assertions.
- Impact: Non-breaking — idempotent `--if-not-exists` re-runs; no producer/consumer change.

**MongoDB collection bootstrap**
- From: `init-camel-collections.js` ensures `audit_log`, `dlq_log`, and pre-image on `requests`/`forms`/`groups`. `debezium_signals` is never created.
- To: Add `ensureCollection('debezium_signals')` so the Debezium connector's `signal.data.collection` target exists from the first run.
- Reason: Debezium ad-hoc snapshots and incremental signals are inert until this collection exists.
- Impact: Non-breaking — idempotent guard.

**`itsm-groups-collection` spec**
- From: A "Groups Not in CDC Include List" requirement asserting `groups` is excluded from Debezium's include list.
- To: Requirement deleted. `groups` IS in the CDC include list as of `auto-provision-org-resources-from-group-events`.
- Reason: Spec contradicts shipped behaviour.
- Impact: Spec-only correction; no code touched in this requirement removal.

**`kafka-broker-stack` spec**
- From: Catalog table has 9 rows; the catalog-coverage requirement reads "All 9 catalog topics".
- To: Catalog table has 11 rows including `dbz.gdfkube.groups` and `dlq.gdfkube.groups`; requirement reads "All 11 catalog topics"; matching scenario assertions bumped from 9 to 11.
- Reason: Spec must enumerate every declared topic so drift can be detected.
- Impact: Spec-only; verification tooling that counts rows will see two new rows.

**READMEs (drift sync, not spec-bearing)**
- `gdfkube-infra/mongodb/README.md`: flip `groups` CDC-watched column to `Yes`; move `groups` into the CDC-watched list and leave only `users` admin-only.
- `gdfkube-infra/debezium/README.md`: add `dbz.gdfkube.groups` to the topic-prefix mapping.
- `gdfkube-infra/kafka/README.md`: add `dbz.gdfkube.groups` to the `gdfkube-camel` consumer-group topic list.

## Capabilities

### New Capabilities
- (none — this change touches existing capabilities only)

### Modified Capabilities
- `kafka-broker-stack`: Adds `dbz.gdfkube.groups` and `dlq.gdfkube.groups` to the declared topic catalog; bumps catalog-coverage count from 9 to 11.
- `itsm-groups-collection`: Removes the stale requirement asserting `groups` is excluded from the CDC include list.

## Impact

**Code (source-of-truth files)**
- `gdfkube-infra/kafka/init-topics.sh` — two new `create_topic` invocations; trailing echo count re-derived from actual lines.
- `gdfkube-infra/mongodb/init-camel-collections.js` — one new `ensureCollection('debezium_signals')` call.

**Specs**
- `openspec/specs/itsm-groups-collection/spec.md` — delete "Groups Not in CDC Include List" requirement (lines 85–92 as of 2026-05-14).
- `openspec/specs/kafka-broker-stack/spec.md` — add 2 catalog rows (lines 53–69 region); update count from 9 → 11 in the requirement title (line 53 region) and in 2 scenario references (lines 71 and 76).

**Docs (drift sync)**
- `gdfkube-infra/mongodb/README.md` — flip `groups` CDC column; restructure CDC-watched section.
- `gdfkube-infra/debezium/README.md` — add `dbz.gdfkube.groups` topic-prefix mapping row.
- `gdfkube-infra/kafka/README.md` — add `dbz.gdfkube.groups` to `gdfkube-camel` consumer-group topic list.

**Kafka topics**
- New (explicitly declared, previously auto-created): `dbz.gdfkube.groups` (partitions=1, RF=3, retention=604800000ms), `dlq.gdfkube.groups` (partitions=1, RF=3, retention=2592000000ms).

**MongoDB collections**
- New (explicitly bootstrapped): `gdfkube.debezium_signals` — no indexes beyond implicit `_id`.

**Downstream consumers**
- `OrgBootstrapRoute` (Camel) — unchanged. Continues consuming `kafka:dbz.gdfkube.groups` and producing to `kafka:dlq.gdfkube.groups`.
- Debezium MongoDB connector — `signal.data.collection: gdfkube.debezium_signals` becomes active (previously inert).

**Dependencies**
- No version bumps. No new libraries. No Helm value changes outside the listed files.

**Blast radius**
- Re-running `init-topics.sh` is idempotent (`--if-not-exists`). Re-running `init-camel-collections.js` is idempotent (existing guard). No in-flight DLQ messages migrated — the topic name is unchanged, only its declaration is hardened.

**Testing strategy**
- Unit: none required (no logic change).
- Integration: `./mvnw -pl gdfkube-src/gdfkube-camel test` — assert `dlq.gdfkube.groups` is the DLQ destination for org-bootstrap; assert `dbz.gdfkube.groups` is consumed.
- Contract / infra: from a clean stack, re-run `bash kafka/init-topics.sh` and confirm `kafka-topics --list` includes both new topics with the script's echoed count matching reality; `mongosh gdfkube --eval 'db.getCollectionNames()'` includes `debezium_signals`; Debezium ad-hoc snapshot via signal collection succeeds (previously a no-op).
- Spec drift: `grep -n "Groups Not in CDC Include List" openspec/specs/itsm-groups-collection/spec.md` returns zero hits; `openspec validate` passes.
