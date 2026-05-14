# Declare missing Kafka topics + Mongo debezium_signals — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task. Each step is small enough to commit independently; commit points are explicit at the end of each task group.

**Goal:** Declare `dbz.gdfkube.groups`, `dlq.gdfkube.groups`, and `gdfkube.debezium_signals` explicitly in their source-of-truth bootstrap scripts; remove the stale `itsm-groups-collection` requirement; bump `kafka-broker-stack`'s catalog from 9 to 11 rows; re-sync three READMEs.

**Architecture:** Pure declarative parity. No runtime code changes. `init-topics.sh` gains two `create_topic` lines (idempotent via `--if-not-exists`). `init-camel-collections.js` gains one `ensureCollection` call (idempotent via the existing helper). Two OpenSpec specs and three READMEs are edited to match shipped behaviour.

**Tech Stack:** Bash (init-topics.sh), MongoDB shell JS (init-camel-collections.js), OpenSpec markdown specs, plain Markdown READMEs.

---

## Task 1: Declare missing Kafka topics in init-topics.sh

Source file: `gdfkube-src/gdfkube-infra/kafka/init-topics.sh` (12 `create_topic` lines today; trailing echo says "All 12 topics created successfully").

- [ ] **Step 1.1:** Run `grep -c '^[[:space:]]*create_topic' gdfkube-src/gdfkube-infra/kafka/init-topics.sh` and record the result (expected: `12`). This is the pre-edit baseline.
- [ ] **Step 1.2:** Edit `gdfkube-src/gdfkube-infra/kafka/init-topics.sh`. Insert a new line directly after the existing `create_topic "dbz.gdfkube.forms"          1 3 604800000` line:
  ```bash
  create_topic "dbz.gdfkube.groups"         1 3 604800000
  ```
  Match the column alignment of the `dbz.*` rows so the file scans cleanly.
- [ ] **Step 1.3:** In the same file, insert a new line directly after `create_topic "dlq.gdfkube.repo-bootstrap" 1 3 2592000000` (or any peer line in the DLQ block — order does not affect runtime semantics, but keep it adjacent to its peers):
  ```bash
  create_topic "dlq.gdfkube.groups"         1 3 2592000000
  ```
  Match the column alignment of the `dlq.gdfkube.*` rows.
- [ ] **Step 1.4:** Re-run `grep -c '^[[:space:]]*create_topic' gdfkube-src/gdfkube-infra/kafka/init-topics.sh`. Expected: `14`. If the number differs from 14, stop and inspect — something is off.
- [ ] **Step 1.5:** Update the final echo in the same file from `echo "=== All 12 topics created successfully ==="` to `echo "=== All 14 topics created successfully ==="`. Use the number returned by Step 1.4 verbatim.
- [ ] **Step 1.6:** `git diff gdfkube-src/gdfkube-infra/kafka/init-topics.sh` — sanity-check that exactly three lines changed (two added, one echo updated). Commit with message `add dbz.gdfkube.groups and dlq.gdfkube.groups to init-topics.sh`.

---

## Task 2: Declare debezium_signals in init-camel-collections.js

Source file: `gdfkube-src/gdfkube-infra/mongodb/init-camel-collections.js` (lines 21–25 currently call `ensureCollection('audit_log')`, `ensureCollection('dlq_log')`, then `ensurePreImage('requests'|'forms'|'groups')`).

- [ ] **Step 2.1:** Confirm the `ensureCollection` helper is defined at the top of the file (`function ensureCollection(name, options)` — observed at line 3). Do NOT add a new helper.
- [ ] **Step 2.2:** Edit the script: insert `ensureCollection('debezium_signals');` immediately *before* the first `ensurePreImage('requests');` call (so the new collection is created before pre-image flags are applied to peers). Keep it adjacent to the other `ensureCollection` invocations for grouping.
- [ ] **Step 2.3:** Verify no `createIndex` call has been added — `debezium_signals` is polled by Debezium via its own driver; the implicit `_id` is sufficient (see design D3).
- [ ] **Step 2.4:** `git diff gdfkube-src/gdfkube-infra/mongodb/init-camel-collections.js` — sanity-check that exactly one line was added. Commit with message `ensure gdfkube.debezium_signals collection in init-camel-collections.js`.

---

## Task 3: Remove the stale itsm-groups-collection requirement

Source file: `openspec/specs/itsm-groups-collection/spec.md` (lines 85–92 hold the `### Requirement: Groups Not in CDC Include List` block and its single scenario).

- [ ] **Step 3.1:** Edit `openspec/specs/itsm-groups-collection/spec.md`. Delete the block starting at `### Requirement: Groups Not in CDC Include List` through (and including) the `**THEN** its \`collection.include.list\` remains \`gdfkube.requests,gdfkube.forms\` (no \`gdfkube.groups\`)` scenario line.
- [ ] **Step 3.2:** Verify the preceding `---` separator at the end of the prior requirement (`Groups Indexes`) is still in place; if the deletion left a dangling `---` at end-of-file, remove it.
- [ ] **Step 3.3:** Run `grep -n "Groups Not in CDC Include List" openspec/specs/itsm-groups-collection/spec.md` — confirm zero hits.
- [ ] **Step 3.4:** Commit with message `remove stale Groups Not in CDC Include List requirement`.

---

## Task 4: Bump kafka-broker-stack catalog from 9 to 11 topics

Source file: `openspec/specs/kafka-broker-stack/spec.md` (the requirement at lines ~53–90 with header `### Requirement: All 9 catalog topics SHALL exist with exact settings after kafka-init exits`).

- [ ] **Step 4.1:** Edit `openspec/specs/kafka-broker-stack/spec.md`. Rename the requirement header to `### Requirement: All 11 catalog topics SHALL exist with exact settings after kafka-init exits`.
- [ ] **Step 4.2:** In the catalog table inside that requirement, insert a row directly below `| \`dbz.gdfkube.forms\` | 1 | 3 | 604800000 | 2 |`:
  ```markdown
  | `dbz.gdfkube.groups` | 1 | 3 | 604800000 | 2 |
  ```
- [ ] **Step 4.3:** In the same table, insert a row directly below `| \`dlq.gdfkube.repo-bootstrap\` | 1 | 3 | 2592000000 | 2 |`:
  ```markdown
  | `dlq.gdfkube.groups` | 1 | 3 | 2592000000 | 2 |
  ```
- [ ] **Step 4.4:** Rename the scenario header `#### Scenario: All 9 topics exist after kafka-init` to `#### Scenario: All 11 topics exist after kafka-init`.
- [ ] **Step 4.5:** Inside that same scenario body, change the line `**AND** \`kafka-topics.sh --bootstrap-server kafka1:19092 --list\` SHALL print all 9 topic names` so it reads `print all 11 topic names`.
- [ ] **Step 4.6:** Commit with message `bump kafka-broker-stack catalog to 11 topics with dbz/dlq.gdfkube.groups`.

---

## Task 5: Sync drift in mongodb / debezium / kafka READMEs

Source files: `gdfkube-src/gdfkube-infra/mongodb/README.md`, `gdfkube-src/gdfkube-infra/debezium/README.md`, `gdfkube-src/gdfkube-infra/kafka/README.md`.

- [ ] **Step 5.1:** Open `gdfkube-src/gdfkube-infra/mongodb/README.md`. In the collections table, flip the CDC-watched column for the `groups` row from `No` to `Yes` (audit amendment A-23). If the table header is "CDC watched" or similar, treat that as the same column.
- [ ] **Step 5.2:** In the same file's narrative section that lists CDC-watched vs. admin-only collections, move `groups` from the admin-only list to the CDC-watched list. After the edit, only `users` should remain in the admin-only group (audit amendment A-24).
- [ ] **Step 5.3:** Open `gdfkube-src/gdfkube-infra/debezium/README.md`. In the topic-prefix mapping list (near the line that maps `dbz.gdfkube.requests` and `dbz.gdfkube.forms` to their collections), add a new row/line:
  ```
  dbz.gdfkube.groups -- CDC events from the groups collection
  ```
  Preserve the existing list's separator/format (whether it's a table row or a bullet) (audit amendment A-25).
- [ ] **Step 5.4:** Open `gdfkube-src/gdfkube-infra/kafka/README.md`. In the section listing the `gdfkube-camel` consumer-group's subscribed topics, add `dbz.gdfkube.groups` to the list. Maintain whatever ordering the surrounding entries use (alphabetic or shipping order) (audit amendment A-26).
- [ ] **Step 5.5:** `git diff gdfkube-src/gdfkube-infra/{mongodb,debezium,kafka}/README.md` — sanity-check that each file has exactly the edits described in 5.1–5.4 and nothing else. Commit with message `sync mongodb/debezium/kafka READMEs to declare groups CDC`.

---

## Task 6: End-to-end verification

- [ ] **Step 6.1:** Run `openspec validate "declare-missing-kafka-topics-and-mongo-signals"` and confirm it prints `Change 'declare-missing-kafka-topics-and-mongo-signals' is valid`.
- [ ] **Step 6.2:** Run `grep -n "Groups Not in CDC Include List" openspec/specs/itsm-groups-collection/spec.md` — must return zero hits.
- [ ] **Step 6.3:** Run `grep -c '^[[:space:]]*create_topic' gdfkube-src/gdfkube-infra/kafka/init-topics.sh` and `grep -n 'All [0-9]\+ topics created' gdfkube-src/gdfkube-infra/kafka/init-topics.sh` — confirm both numbers are `14`.
- [ ] **Step 6.4:** From a clean stack (`docker compose down -v && docker compose up -d kafka1 kafka2 kafka3 && docker compose up kafka-init`), confirm `kafka-init` exits 0 and that `docker compose exec kafka1 kafka-topics.sh --bootstrap-server kafka1:19092 --list` includes `dbz.gdfkube.groups` and `dlq.gdfkube.groups`.
- [ ] **Step 6.5:** Bring up the Mongo replica set, run `init-rs.js` then `init-camel-collections.js`, and run `mongosh "$MONGO_URI" --eval 'use gdfkube; db.getCollectionNames()'` — confirm `debezium_signals` is in the output.
- [ ] **Step 6.6:** Insert a synthetic ad-hoc snapshot signal document into `gdfkube.debezium_signals` via `mongosh` and tail the Debezium connector logs — confirm a `signal` action is logged (previously a silent no-op).
- [ ] **Step 6.7:** Run `./mvnw -pl gdfkube-src/gdfkube-camel test` — green required, including the integration profile that asserts `dlq.gdfkube.groups` is the org-bootstrap DLQ destination.
- [ ] **Step 6.8:** Run `pre-commit run --all-files` and confirm trufflehog is green (no new secret-shaped strings introduced by the README edits).
- [ ] **Step 6.9:** Final commit/PR: if commits from Tasks 1–5 were already created, push the branch. Otherwise create a final commit covering any verification fixups. PR title: `declare missing kafka topics and mongo debezium_signals collection`.
