# Run Verification Gates on Auto-Provision — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Execute the six unchecked verification gates (`2.5`, `7.1`–`7.6`) of the archived `auto-provision-org-resources-from-group-events` change, capture verbatim evidence into a new `evidence/` directory inside the archive folder, flip the corresponding checkboxes, and route any failure to a new openspec change.

**Architecture:** A six-gate capstone runbook. Gates 2.1–4.4 are automated test/build commands; gates 5.1–7.5 are operator-driven against the devcontainer stack and SPA. Evidence is committed alongside the archived change; failures fan out to dedicated follow-up changes. No production code is modified.

**Tech Stack:** Apache Camel/Quarkus (Maven), Apache Kafka, MongoDB, Debezium Connect, NodeJS (Vitest), Gitea, pre-commit (trufflehog).

---

## Task 1: Sequencing pre-check (tasks.md §1)

- [ ] **Step 1:** Read `openspec/changes/archive/` listing; confirm `harden-org-bootstrap-route`, `strengthen-org-bootstrap-tests`, and `declare-missing-kafka-topics-and-mongo-signals` each appear as `YYYY-MM-DD-<name>` directories. If any are still in `openspec/changes/<name>/` (unarchived) **or** absent from `archive/`, STOP and surface a `needs input` message: this plan is the capstone and must not run before its predecessors.
- [ ] **Step 2:** Capture the archive resolution in a scratch note (the three confirmed archive dates) so the operator can include them in the eventual commit body.
- [ ] **Step 3:** `mkdir -p openspec/changes/archive/2026-05-14-auto-provision-org-resources-from-group-events/evidence`. The command is idempotent; safe to re-run.
- [ ] **Commit point:** None yet — pre-check only.

---

## Task 2: Maven gates 2.5 + 7.1 (tasks.md §2)

- [ ] **Step 1:** `cd gdfkube-src/gdfkube-camel`.
- [ ] **Step 2:** Run `./mvnw test 2>&1 | tee /tmp/maven-test.log`.
- [ ] **Step 3:** `grep -E '(Tests run|BUILD SUCCESS|BUILD FAILURE)' /tmp/maven-test.log | tail -5` and inspect:
  - There MUST be a `BUILD SUCCESS` line.
  - The tail tally line MUST show `Failures: 0, Errors: 0`.
- [ ] **Step 4 (green path):** `grep -E 'OrgBootstrapIntegrationTest|PipelineIntegrationTest' /tmp/maven-test.log | grep -v FAIL` to confirm both class names appear in passing context.
- [ ] **Step 5 (green path):** Write tail tally + `BUILD SUCCESS` line into `…/evidence/maven-test.txt` (use `Write` tool, not shell redirection — preserves readable diffs).
- [ ] **Step 6 (green path):** Edit the archived `tasks.md`: flip `- [ ] 2.5 …` → `- [x] 2.5 …` and `- [ ] 7.1 …` → `- [x] 7.1 …` using `Edit` tool with exact-string replacement.
- [ ] **Step 7 (red path):** Do NOT write `evidence/maven-test.txt`. Instead:
  - Run `/opsx:propose` (or note the requirement) for a new change capturing the failure; the change name should reflect the failing test (e.g., `fix-pipeline-integration-test-regression`).
  - Append the line `- [ ] 7.1-blocked-by-<new-change-id>` directly below the existing `- [ ] 7.1 …` line in the archived tasks file (and same for 2.5 if both fail). The existing `[ ]` lines stay unticked.
  - STOP the plan here and return to the operator.
- [ ] **Commit point:** Defer commit until Task 8 (single commit for all evidence).

---

## Task 3: AppStartupIT gate 7.2 (tasks.md §3)

- [ ] **Step 1:** Still in `gdfkube-src/gdfkube-camel`, run `./mvnw -DskipITs=false verify 2>&1 | tee /tmp/maven-verify.log`.
- [ ] **Step 2:** Run `grep -E 'AppStartupIT|route.*Started' /tmp/maven-verify.log > /tmp/maven-verify.routes`.
- [ ] **Step 3:** Verify each of the nine route names — `request-router`, `repo-bootstrap`, `helm-render`, `git-push`, `status-emitter`, `audit-sink`, `dlq-handler`, `config-reload`, `org-bootstrap` — appears in `/tmp/maven-verify.routes` with a `Started` marker. Programmatic check: `for r in request-router repo-bootstrap helm-render git-push status-emitter audit-sink dlq-handler config-reload org-bootstrap; do grep -q "$r.*Started" /tmp/maven-verify.routes || echo "MISSING: $r"; done`.
- [ ] **Step 4 (green path):** Write `/tmp/maven-verify.routes` contents into `…/evidence/app-startup-it.txt`.
- [ ] **Step 5 (green path):** Edit the archived `tasks.md`: flip `- [ ] 7.2 …` → `- [x] 7.2 …`.
- [ ] **Step 6 (red path):** If the route count is off (drift) OR `AppStartupIT` failed: do NOT loosen the assertion in this change. File a new openspec change and append `- [ ] 7.2-blocked-by-<id>` below the existing 7.2 line. STOP.
- [ ] **Commit point:** Defer.

---

## Task 4: ITSM server gate 7.3 (tasks.md §4)

- [ ] **Step 1:** `cd gdfkube-src/gdfkube-itsm/server`.
- [ ] **Step 2:** Pre-check: `grep -rn 'it\.\(todo\|skip\)(' src` — MUST return no matches. If any do exist, surface them; the operator either deletes the dead test or implements it before proceeding. Do not silently ignore.
- [ ] **Step 3:** Run `npm test 2>&1 | tee /tmp/itsm-server.log`. Confirm exit code 0 (`echo $?`).
- [ ] **Step 4 (green path):** Extract the final vitest summary block (the `Test Files` + `Tests` + `Duration` trio) from `/tmp/itsm-server.log` and write to `…/evidence/itsm-server-test.txt`.
- [ ] **Step 5 (green path):** Edit archived `tasks.md`: flip `- [ ] 7.3 …` → `- [x] 7.3 …`.
- [ ] **Step 6 (red path):** File a follow-up openspec change; append `- [ ] 7.3-blocked-by-<id>`. STOP.
- [ ] **Commit point:** Defer.

---

## Task 5: Debezium snapshot replay gate 7.4 (tasks.md §5)

> Operator-driven. Requires the devcontainer stack (mongo + kafka + connect).

- [ ] **Step 1:** Bring up the stack per existing devcontainer instructions. Confirm `connect` is reachable on port 8083 and `kafka1:19092` is broker-listening.
- [ ] **Step 2:** Seed a group: `mongosh gdfkube --eval 'db.groups.insertOne({_id:"culturapre",name:"CulturaPre",fullName:"Pre-existing",repo:"gdfkube-culturapre",users:0,forms:0,clusters:0})'`. Confirm the insert returns `acknowledged: true`.
- [ ] **Step 3:** Restart the connector: `curl -sf -X POST 'http://connect:8083/connectors/gdfkube/restart?includeTasks=true' -o /dev/null -w '%{http_code}\n'`. Expect `200` (or `202`).
- [ ] **Step 4:** Consume the topic: `kafka-console-consumer --bootstrap-server kafka1:19092 --topic dbz.gdfkube.groups --property print.headers=true --from-beginning --timeout-ms 30000 2>&1 | tee /tmp/debezium-replay.log`.
- [ ] **Step 5:** `grep '__op:r.*culturapre' /tmp/debezium-replay.log | head -1` — MUST return exactly one matching line.
- [ ] **Step 6 (green path):** Write that matched line into `…/evidence/debezium-snapshot-replay.txt`. Edit archived `tasks.md`: flip `- [ ] 7.4 …` → `- [x] 7.4 …`.
- [ ] **Step 7 (red path):** File a follow-up openspec change; append `- [ ] 7.4-blocked-by-<id>`. STOP.
- [ ] **Step 8 (cleanup, runs in both paths):** `mongosh gdfkube --eval 'db.groups.deleteOne({_id:"culturapre"}); db.audit_log.deleteMany({groupId:"culturapre"})'` so subsequent gate 7.5 starts from a clean fixture.
- [ ] **Commit point:** Defer.

---

## Task 6: SPA Create-group gate 7.5 (tasks.md §6)

> Operator-driven (browser).

- [ ] **Step 1:** Open the SPA in a browser. Authenticate as an admin demo user. Navigate to Admin → Groups → New group.
- [ ] **Step 2:** Fill the form exactly: Display name `Cultura`, Full name `Department of Culture`, leave repo auto-suggested. Click Create.
- [ ] **Step 3:** Start a stopwatch. Wait up to 30 seconds.
- [ ] **Step 4:** Confirm Mongo state: `mongosh gdfkube --eval 'db.groups.findOne({_id:"cultura"})'`. The output MUST be non-null AND `_id` MUST be the lowercase `cultura`. If `_id` is uppercased or differently slugged → this is audit D-6; treat as red path.
- [ ] **Step 5:** Confirm Gitea state: in the Gitea UI, browse to `gdfkube/gdfkube-cultura` (MUST exist) and `gdfkube/gdfkube-orgs/orgs/cultura/` (MUST contain `appproject.yaml`, `applicationset.yaml`, `cultura-clusterset.yaml`).
- [ ] **Step 6:** Confirm audit state: `mongosh gdfkube --eval 'db.audit_log.find({groupId:"cultura"}).pretty()'`. MUST show 2× `action: "create-repo"` rows and 1× `action: "bootstrap"` row.
- [ ] **Step 7 (green path):** Write the outputs of Step 4 and Step 6 into `…/evidence/spa-e2e-cultura.txt`. For Step 5, capture either a one-line listing (e.g., copy-paste from the Gitea tree view) or a small screenshot saved at `…/evidence/spa-e2e-cultura-gitea.png` (only if textual listing is impractical). Edit archived `tasks.md`: flip `- [ ] 7.5 …` → `- [x] 7.5 …`.
- [ ] **Step 8 (red path):** File a follow-up openspec change naming the specific failure mode (slugging, missing manifest, missing audit row). Append `- [ ] 7.5-blocked-by-<id>`. STOP.
- [ ] **Step 9:** Record the current `gdfkube-orgs` HEAD hash `H1` from the Gitea UI commit view; store it locally (e.g., `echo $H1 > /tmp/h1.txt`) for use in Task 7. Do not commit this scratch file.
- [ ] **Commit point:** Defer.

---

## Task 7: SPA Edit-noop gate 7.6 (tasks.md §7)

> Operator-driven (browser). Prerequisite: Task 6 succeeded.

- [ ] **Step 1:** In the SPA, navigate to Groups → Cultura. Open the detail view.
- [ ] **Step 2:** Change Full name to a new value (e.g., `Department of Culture (rev)`). Click Save.
- [ ] **Step 3:** Run `mongosh gdfkube --eval 'db.audit_log.find({groupId:"cultura"}).sort({at:-1}).limit(3)'`. The top row's `action` MUST be `noop`.
- [ ] **Step 4:** In Gitea UI, view `gdfkube-orgs` commit history. The HEAD MUST equal `H1` (the value captured in Task 6, Step 9). No new commit since 7.5.
- [ ] **Step 5 (green path):** Write the Step 3 output AND a one-line `HEAD == H1 (no new commit)` note (with the hash) into `…/evidence/spa-e2e-noop.txt`. Edit archived `tasks.md`: flip `- [ ] 7.6 …` → `- [x] 7.6 …`.
- [ ] **Step 6 (red path):** If top audit row is not `noop` OR a new commit appeared in `gdfkube-orgs`: file a follow-up openspec change (bootstrap-route idempotency defect). Append `- [ ] 7.6-blocked-by-<id>`. STOP.
- [ ] **Commit point:** Defer.

---

## Task 8: Commit (tasks.md §8)

- [ ] **Step 1:** `git status` and confirm only the expected paths are touched:
  - `openspec/changes/archive/2026-05-14-auto-provision-org-resources-from-group-events/evidence/*.txt` (one file per green gate)
  - `openspec/changes/archive/2026-05-14-auto-provision-org-resources-from-group-events/tasks.md` (flipped boxes + any blocked-by lines)
  - This change's own folder is unchanged at commit time (it will be updated in Task 9).
- [ ] **Step 2:** `git add` the listed paths by exact name (do NOT use `git add -A`).
- [ ] **Step 3:** Run `pre-commit run --all-files`. Expect green. If trufflehog flags any captured line:
  - Inspect the line. If it is a build/test path or a placeholder, sanitise the value (replace with `<redacted>`) or add `# trufflehog:ignore` on that specific line only if the value is provably non-sensitive.
  - Do NOT use `--no-verify` or `git commit -n`.
- [ ] **Step 4:** Commit: `git commit -m "openspec: record verification evidence for auto-provision-org-resources-from-group-events"` (imperative form, matches recent commit style).
- [ ] **Commit point:** ✅ This is the evidence-landing commit.

---

## Task 9: Verification of the verification (tasks.md §9)

- [ ] **Step 1:** `git diff HEAD~1 -- openspec/changes/archive/2026-05-14-auto-provision-org-resources-from-group-events/tasks.md` — confirm the diff is exactly the intended box flips (0–6) and the blocked-by appendages (0–6). Nothing extraneous.
- [ ] **Step 2:** `ls openspec/changes/archive/2026-05-14-auto-provision-org-resources-from-group-events/evidence/` — confirm exactly the files for gates that passed; absent files correspond 1:1 with `[ ]` lines that have a blocked-by follow-up.
- [ ] **Step 3:** `pre-commit run --all-files` — green.
- [ ] **Step 4:** Update this change's `verify.md` (created in the apply phase) with:
  - The list of gates that passed (and their evidence file paths).
  - The list of gates that failed and the follow-up change IDs they were routed to.
  - The final state of the archived `tasks.md` (e.g., "6/6 ticked" or "4/6 ticked, 7.4 + 7.5 deferred to <ids>").
- [ ] **Commit point:** Either roll the `verify.md` into the Task 8 commit (preferred if available pre-commit) or a second commit `openspec: record verify.md for run-verification-gates-on-auto-provision`.

---

## Notes

- **`writing-plans` skill availability**: this plan was authored in-line because the brainstorming output already produced an actionable runbook (the input plan file). If a deeper micro-step decomposition is needed during apply, re-invoke `superpowers:writing-plans` with this file as input.
- **Stop conditions**: any red path STOPs the plan after filing the follow-up. The remaining gates do NOT auto-run; the operator decides whether to continue with later gates that don't depend on the failed one. Tasks 5, 6, 7 are loosely coupled (6→7 has a hard dependency on H1; 5 is independent of 6/7).
- **No production code paths are modified.** If any task suggests editing under `gdfkube-src/`, that is a red flag — stop and re-read the runbook.
