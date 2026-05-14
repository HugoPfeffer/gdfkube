## ADDED Requirements

### Requirement: Evidence Directory Layout
The change `auto-provision-org-resources-from-group-events` SHALL gain an `evidence/` subdirectory inside its archived folder at `openspec/changes/archive/2026-05-14-auto-provision-org-resources-from-group-events/evidence/`, containing exactly one verbatim log file per executed verification gate. Filenames MUST be: `maven-test.txt` (covering 2.5 and 7.1), `app-startup-it.txt` (7.2), `itsm-server-test.txt` (7.3), `debezium-snapshot-replay.txt` (7.4), `spa-e2e-cultura.txt` (7.5), and `spa-e2e-noop.txt` (7.6).

#### Scenario: All six evidence files present after run
- **GIVEN** the six gates have all been executed and passed
- **WHEN** the operator lists `openspec/changes/archive/2026-05-14-auto-provision-org-resources-from-group-events/evidence/`
- **THEN** the directory MUST contain exactly the six files named above
- **AND** no other files (no `.DS_Store`, no editor swap, no screenshot binaries unless explicitly committed for 7.5/7.6)

#### Scenario: Gate executed but failing — no evidence written
- **GIVEN** a gate (e.g., 7.3) was executed and the command exited non-zero
- **WHEN** the operator commits the work
- **THEN** the corresponding evidence file MUST NOT be present in `evidence/`
- **AND** the gate's checkbox in `tasks.md` MUST remain `[ ]`
- **AND** a new openspec change MUST exist describing the failure

---

### Requirement: Maven Test Acceptance (Gates 2.5 + 7.1)
Running `./mvnw test` from `gdfkube-src/gdfkube-camel/` MUST exit with `BUILD SUCCESS`, and the test report MUST include `OrgBootstrapIntegrationTest` and `PipelineIntegrationTest` (specifically `goldenPath_existingRepoIsNotRecreated`) among the passing tests. The captured `evidence/maven-test.txt` MUST contain the final Maven tally line (a `Tests run: N, Failures: 0, Errors: 0, Skipped: M` form) and the `BUILD SUCCESS` line.

#### Scenario: Maven suite green
- **GIVEN** all three predecessor plans (`harden-org-bootstrap-route`, `strengthen-org-bootstrap-tests`, `declare-missing-kafka-topics-and-mongo-signals`) are landed
- **WHEN** the operator runs `cd gdfkube-src/gdfkube-camel && ./mvnw test`
- **THEN** the build MUST report `BUILD SUCCESS`
- **AND** both `OrgBootstrapIntegrationTest` and `PipelineIntegrationTest` MUST appear in the passing section
- **AND** the tally line and `BUILD SUCCESS` line are written to `evidence/maven-test.txt`
- **AND** gates 2.5 and 7.1 in `tasks.md` are flipped to `[x]`

#### Scenario: Maven suite has a failing test
- **WHEN** `./mvnw test` exits non-zero or any of the two named tests is in the failures section
- **THEN** `evidence/maven-test.txt` MUST NOT be committed for this run
- **AND** a follow-up openspec change MUST be filed with the failing test name and the failing log attached
- **AND** a `[ ] 2.5-blocked-by-<id>` and/or `[ ] 7.1-blocked-by-<id>` line MUST be appended in `tasks.md`

---

### Requirement: AppStartupIT Acceptance (Gate 7.2)
Running `./mvnw -DskipITs=false verify` from `gdfkube-src/gdfkube-camel/` MUST result in `AppStartupIT` passing with exactly nine Camel routes reported as `Started`: `request-router`, `repo-bootstrap`, `helm-render`, `git-push`, `status-emitter`, `audit-sink`, `dlq-handler`, `config-reload`, `org-bootstrap`. The captured `evidence/app-startup-it.txt` MUST contain the matched log lines naming all nine routes.

#### Scenario: All nine routes started
- **WHEN** `./mvnw -DskipITs=false verify` is executed against the post-predecessor codebase
- **THEN** `AppStartupIT` MUST pass
- **AND** `grep -E 'AppStartupIT|route.*Started'` on the build log MUST yield lines mentioning each of the nine named routes exactly once
- **AND** those matched lines are written to `evidence/app-startup-it.txt`
- **AND** gate 7.2 in `tasks.md` is flipped to `[x]`

#### Scenario: Route count drift
- **WHEN** the started-route count differs from nine (either by a new route being added or one being missing)
- **THEN** the assertion MUST NOT be loosened in this change to make the gate green
- **AND** a follow-up openspec change MUST be filed referencing the route delta
- **AND** a `[ ] 7.2-blocked-by-<id>` line MUST be appended in `tasks.md`

---

### Requirement: ITSM Server Test Acceptance (Gate 7.3)
Running `npm test` from `gdfkube-src/gdfkube-itsm/server/` MUST exit with code 0. The test source MUST contain zero `it.todo(` and zero `it.skip(` occurrences at the time of execution. The captured `evidence/itsm-server-test.txt` MUST contain the final vitest tally line.

#### Scenario: ITSM server tests green and tight
- **GIVEN** `grep -rn 'it\.\(todo\|skip\)(' gdfkube-src/gdfkube-itsm/server/src` returns no matches
- **WHEN** the operator runs `cd gdfkube-src/gdfkube-itsm/server && npm test`
- **THEN** the exit code MUST be 0
- **AND** the final vitest tally (e.g., `Test Files  N passed (N)` / `Tests  M passed (M)`) is written to `evidence/itsm-server-test.txt`
- **AND** gate 7.3 in `tasks.md` is flipped to `[x]`

#### Scenario: Latent skipped or todo tests
- **WHEN** the pre-check grep finds any `it.todo(` or `it.skip(` in the server tests
- **THEN** the gate MUST NOT be ticked
- **AND** the operator MUST either delete the skipped test or implement it before retrying
- **AND** no evidence file is committed until the pre-check is clean and `npm test` is green

---

### Requirement: Debezium Snapshot Replay Acceptance (Gate 7.4)
Restarting the `gdfkube` Debezium connector with `?includeTasks=true` against a MongoDB instance containing at least one pre-seeded group document MUST emit at least one Kafka record on topic `dbz.gdfkube.groups` carrying the header `__op:r` whose key matches the pre-seeded group's `_id`. The captured `evidence/debezium-snapshot-replay.txt` MUST contain at least one matched line including the `__op:r` marker and the group identifier.

#### Scenario: Snapshot replays a pre-existing group
- **GIVEN** `db.groups.insertOne({_id:"culturapre", ...})` has been executed before the connector restart
- **WHEN** the operator POSTs to `http://connect:8083/connectors/gdfkube/restart?includeTasks=true` and then consumes `dbz.gdfkube.groups` from the beginning with `--property print.headers=true --timeout-ms 30000`
- **THEN** at least one record MUST appear with header `__op:r` and key `culturapre`
- **AND** that matched line is written to `evidence/debezium-snapshot-replay.txt`
- **AND** gate 7.4 in `tasks.md` is flipped to `[x]`

#### Scenario: No snapshot emission within 30s
- **WHEN** the consumer times out without producing an `__op:r` record for the seeded group
- **THEN** gate 7.4 MUST remain unticked
- **AND** a follow-up openspec change is filed
- **AND** a `[ ] 7.4-blocked-by-<id>` line is appended in `tasks.md`

---

### Requirement: SPA Create-Group E2E Acceptance (Gate 7.5)
Creating a group "Cultura" from the SPA Admin → Groups → New flow MUST, within 30 seconds, produce: (a) a `groups` document in MongoDB with `_id: "cultura"`, (b) Gitea repositories `gdfkube/gdfkube-cultura` and `gdfkube/gdfkube-orgs`, the latter containing `orgs/cultura/{appproject.yaml, applicationset.yaml, cultura-clusterset.yaml}`, and (c) `gdfkube.audit_log` rows for `create-repo` (×2) and `bootstrap`, all tagged `groupId: "cultura"`. The captured `evidence/spa-e2e-cultura.txt` MUST contain the mongosh output for the group doc AND the audit_log query result.

#### Scenario: Cultura creation produces all three signals
- **WHEN** the operator submits the SPA form with Display name `Cultura`, Full name `Department of Culture`, repo auto-suggested
- **AND** waits at most 30 seconds
- **AND** runs `mongosh gdfkube --eval 'db.groups.findOne({_id:"cultura"})'`
- **AND** inspects Gitea for `gdfkube-cultura` and the three manifest files
- **AND** runs `mongosh gdfkube --eval 'db.audit_log.find({groupId:"cultura"}).pretty()'`
- **THEN** the group doc MUST exist with `_id: "cultura"`
- **AND** the Gitea repos and three manifest paths MUST exist
- **AND** the audit_log MUST contain `create-repo` twice and `bootstrap` once for `groupId:"cultura"`
- **AND** the mongosh outputs are written to `evidence/spa-e2e-cultura.txt`
- **AND** gate 7.5 in `tasks.md` is flipped to `[x]`

#### Scenario: Slug not normalized to lowercase
- **WHEN** `db.groups.findOne({_id:"cultura"})` returns null AND `db.groups.findOne({_id:"Cultura"})` (or similar) returns the doc
- **THEN** gate 7.5 MUST remain unticked
- **AND** a follow-up openspec change MUST reference the underlying slugging defect (audit D-6)
- **AND** a `[ ] 7.5-blocked-by-<id>` line is appended in `tasks.md`

---

### Requirement: SPA Edit-Noop E2E Acceptance (Gate 7.6)
Editing and saving the `fullName` field of the "Cultura" group from the SPA Admin → Groups detail view (after the 7.5 create has completed) MUST produce: (a) a most-recent `audit_log` row with `groupId: "cultura"` and action `noop`, and (b) no new commits in the `gdfkube-orgs` Gitea repo since gate 7.5 completed. The captured `evidence/spa-e2e-noop.txt` MUST contain both the audit_log query output AND the Gitea commit-log evidence (either the unchanged HEAD hash or a screenshot/log snippet).

#### Scenario: Edit-save is a noop
- **GIVEN** gate 7.5 has been completed and the operator has noted the `gdfkube-orgs` HEAD hash `H1`
- **WHEN** the operator changes Cultura's Full name in the SPA and clicks Save
- **AND** runs `mongosh gdfkube --eval 'db.audit_log.find({groupId:"cultura"}).sort({at:-1}).limit(3)'`
- **AND** checks `gdfkube-orgs` HEAD
- **THEN** the top audit row MUST have action `noop`
- **AND** the `gdfkube-orgs` HEAD MUST still equal `H1`
- **AND** the audit lines and HEAD comparison are written to `evidence/spa-e2e-noop.txt`
- **AND** gate 7.6 in `tasks.md` is flipped to `[x]`

#### Scenario: Edit-save produced a second commit
- **WHEN** the `gdfkube-orgs` HEAD has advanced past `H1` after the noop edit
- **THEN** gate 7.6 MUST remain unticked
- **AND** a follow-up openspec change is filed against the bootstrap-route idempotency defect
- **AND** a `[ ] 7.6-blocked-by-<id>` line is appended in `tasks.md`

---

### Requirement: Failing-Gate Routing
For any verification gate that fails, the operator SHALL NOT tick its checkbox; instead a NEW openspec change MUST be filed describing the failure with a link to the (uncommitted-to-the-archive) failing log, and a `[ ] <gate-number>-blocked-by-<change-id>` line MUST be appended to `openspec/changes/archive/2026-05-14-auto-provision-org-resources-from-group-events/tasks.md` immediately below the failing gate's existing `[ ]` line. Silent re-runs without filing a follow-up are forbidden.

#### Scenario: Maven gate fails — follow-up is filed
- **GIVEN** gate 7.1 exits with `BUILD FAILURE`
- **WHEN** the operator processes the failure
- **THEN** a new openspec change MUST exist in `openspec/changes/` with a name describing the failure
- **AND** a `[ ] 7.1-blocked-by-<that-change-id>` line MUST appear directly below the existing `[ ] 7.1 …` line in the archived tasks file
- **AND** the existing `[ ] 7.1 …` line MUST still be unticked
- **AND** no `evidence/maven-test.txt` from this run is committed

---

### Requirement: Pre-Commit Cleanliness
Before committing the evidence directory, `pre-commit run --all-files` MUST exit zero. If trufflehog flags any captured log line, the operator MUST sanitise the line (or mark it `# trufflehog:ignore` only when the flagged value is intentionally non-sensitive) before the commit lands. Skipping pre-commit (`--no-verify`) is forbidden.

#### Scenario: Clean pre-commit
- **GIVEN** the six evidence files are staged
- **WHEN** the operator runs `pre-commit run --all-files`
- **THEN** the exit code MUST be 0
- **AND** the commit proceeds

#### Scenario: Trufflehog flag in a captured log
- **WHEN** `pre-commit run --all-files` exits non-zero due to a trufflehog detection in `evidence/*.txt`
- **THEN** the offending line MUST be scrubbed or annotated with `# trufflehog:ignore` (only if the value is provably non-sensitive, e.g., a known dummy in a test fixture)
- **AND** the commit MUST be retried; `--no-verify` MUST NOT be used
