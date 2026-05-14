## 1. Sequencing pre-check

- [ ] 1.1 Confirm `harden-org-bootstrap-route` is landed (merged or archived); abort otherwise.
- [ ] 1.2 Confirm `strengthen-org-bootstrap-tests` is landed; abort otherwise.
- [ ] 1.3 Confirm `declare-missing-kafka-topics-and-mongo-signals` is landed; abort otherwise.
- [ ] 1.4 Create the directory `openspec/changes/archive/2026-05-14-auto-provision-org-resources-from-group-events/evidence/` (idempotent `mkdir -p`).

## 2. Maven gates (2.5 + 7.1)

- [ ] 2.1 From `gdfkube-src/gdfkube-camel/`, run `./mvnw test 2>&1 | tee /tmp/maven-test.log`.
- [ ] 2.2 Verify `BUILD SUCCESS` and that `OrgBootstrapIntegrationTest` + `PipelineIntegrationTest.goldenPath_existingRepoIsNotRecreated` are in the green section.
- [ ] 2.3 If green: extract the final `Tests run:` tally line and the `BUILD SUCCESS` line into `…/evidence/maven-test.txt`.
- [ ] 2.4 If green: flip `[ ] 2.5` and `[ ] 7.1` to `[x]` in the archived `tasks.md`.
- [ ] 2.5 If red: file follow-up openspec change; append `[ ] 2.5-blocked-by-<id>` and/or `[ ] 7.1-blocked-by-<id>` below the existing lines; do NOT commit any partial evidence file.

## 3. AppStartupIT gate (7.2)

- [ ] 3.1 From `gdfkube-src/gdfkube-camel/`, run `./mvnw -DskipITs=false verify 2>&1 | tee /tmp/maven-verify.log`.
- [ ] 3.2 Run `grep -E 'AppStartupIT|route.*Started' /tmp/maven-verify.log` and confirm the 9 named routes (`request-router`, `repo-bootstrap`, `helm-render`, `git-push`, `status-emitter`, `audit-sink`, `dlq-handler`, `config-reload`, `org-bootstrap`) each appear in a Started line.
- [ ] 3.3 If green: write the matched lines into `…/evidence/app-startup-it.txt`; flip `[ ] 7.2` → `[x]`.
- [ ] 3.4 If red: file follow-up openspec change; append `[ ] 7.2-blocked-by-<id>` and stop. Do NOT loosen the 9-route assertion in this change.

## 4. ITSM server gate (7.3)

- [ ] 4.1 From `gdfkube-src/gdfkube-itsm/server/`, pre-check `grep -rn 'it\.\(todo\|skip\)(' src` returns no matches; if any exist, delete or implement them before continuing.
- [ ] 4.2 Run `npm test 2>&1 | tee /tmp/itsm-server.log`.
- [ ] 4.3 If exit code 0: write the final vitest tally line into `…/evidence/itsm-server-test.txt`; flip `[ ] 7.3` → `[x]`.
- [ ] 4.4 If non-zero: file follow-up openspec change; append `[ ] 7.3-blocked-by-<id>`.

## 5. Debezium snapshot replay (7.4)

- [ ] 5.1 Bring the devcontainer stack up (mongo + kafka + connect).
- [ ] 5.2 Seed a pre-existing group: `mongosh gdfkube --eval 'db.groups.insertOne({_id:"culturapre",name:"CulturaPre",fullName:"Pre-existing",repo:"gdfkube-culturapre",users:0,forms:0,clusters:0})'`.
- [ ] 5.3 Restart the connector: `curl -X POST http://connect:8083/connectors/gdfkube/restart?includeTasks=true`.
- [ ] 5.4 Consume the topic for ≤30s: `kafka-console-consumer --bootstrap-server kafka1:19092 --topic dbz.gdfkube.groups --property print.headers=true --from-beginning --timeout-ms 30000 | grep '__op:r'`.
- [ ] 5.5 If at least one record with `__op:r` and key `culturapre` is observed: write the matched line into `…/evidence/debezium-snapshot-replay.txt`; flip `[ ] 7.4` → `[x]`.
- [ ] 5.6 If no matching record within 30s: file follow-up openspec change; append `[ ] 7.4-blocked-by-<id>`.
- [ ] 5.7 Clean up the seeded `culturapre` document and any derived audit rows before retrying or before gate 7.5.

## 6. SPA Create-group (7.5)

- [ ] 6.1 Open the SPA → Admin → Groups → New group. Fill: Display name `Cultura`, Full name `Department of Culture`, leave repo auto-suggested. Click Create.
- [ ] 6.2 Wait ≤30s.
- [ ] 6.3 Run `mongosh gdfkube --eval 'db.groups.findOne({_id:"cultura"})'`. Confirm `_id: "cultura"` (lowercase).
- [ ] 6.4 In Gitea UI: confirm `gdfkube/gdfkube-cultura` exists and `gdfkube/gdfkube-orgs` contains `orgs/cultura/{appproject.yaml, applicationset.yaml, cultura-clusterset.yaml}`.
- [ ] 6.5 Run `mongosh gdfkube --eval 'db.audit_log.find({groupId:"cultura"}).pretty()'`. Confirm 2× `create-repo` rows and 1× `bootstrap` row.
- [ ] 6.6 If all three sub-checks pass: write the mongosh outputs (group doc + audit_log query) into `…/evidence/spa-e2e-cultura.txt`; flip `[ ] 7.5` → `[x]`.
- [ ] 6.7 If any check fails (including the `_id` casing — audit D-6): file follow-up openspec change; append `[ ] 7.5-blocked-by-<id>`.
- [ ] 6.8 Record the current `gdfkube-orgs` HEAD hash (`H1`) for use in gate 7.6.

## 7. SPA Edit-noop (7.6)

- [ ] 7.1 In the SPA, navigate to Groups → Cultura → edit Full name to a new value → Save.
- [ ] 7.2 Run `mongosh gdfkube --eval 'db.audit_log.find({groupId:"cultura"}).sort({at:-1}).limit(3)'`; confirm the top row's action is `noop`.
- [ ] 7.3 In Gitea, confirm `gdfkube-orgs` HEAD still equals `H1` (no new commit).
- [ ] 7.4 If both checks pass: write the audit lines + the HEAD-equality observation into `…/evidence/spa-e2e-noop.txt`; flip `[ ] 7.6` → `[x]`.
- [ ] 7.5 If a new commit appeared or the top audit row is not `noop`: file follow-up openspec change; append `[ ] 7.6-blocked-by-<id>`.

## 8. Commit + pre-commit

- [ ] 8.1 Stage `…/evidence/*.txt` and the modified archived `tasks.md`.
- [ ] 8.2 Run `pre-commit run --all-files`; resolve any trufflehog flags by scrubbing or adding `# trufflehog:ignore` only where the flagged value is provably non-sensitive. Do NOT use `--no-verify`.
- [ ] 8.3 Commit with message in imperative form: `openspec: record verification evidence for auto-provision-org-resources-from-group-events`.

## 9. Verification-of-the-verification

- [ ] 9.1 `git diff openspec/changes/archive/2026-05-14-auto-provision-org-resources-from-group-events/tasks.md` shows exactly the intended checkbox flips (0–6 boxes) and any blocked-by lines, nothing else.
- [ ] 9.2 `ls openspec/changes/archive/2026-05-14-auto-provision-org-resources-from-group-events/evidence/` lists exactly the evidence files for gates that passed.
- [ ] 9.3 `pre-commit run --all-files` is green.
- [ ] 9.4 Update this change's `verify.md` (created during apply) noting which gates passed, which were routed to follow-ups, and the resulting state of the archived tasks file.
