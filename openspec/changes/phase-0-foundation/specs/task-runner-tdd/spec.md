<!-- SPEC: task-runner-tdd | CAP-004 -->

## ADDED Requirements

### Requirement: REQ-004-01 `task test` runs the full Phase 0 suite

The file `gdfkube-src/Taskfile.yaml` SHALL declare a `test` task whose `deps:` enumerate exactly `test:unit`, `test:parity`, `test:chart-lint`, `test:helm-dry-run`. Running `task test` from `gdfkube-src/` MUST execute each dependency and exit 0 if and only if every dependency exits 0. The aggregate runtime MUST be ≤120 seconds on the project devcontainer with a warm Docker cache.

#### Scenario: SCN-004-01-01 Full suite passes on green checkout

- **GIVEN** the working tree is at the Phase 0 acceptance commit and the compose stack is up
- **WHEN** `task test` runs from `gdfkube-src/`
- **THEN** the command MUST exit 0, stdout MUST list each dependency target as completed, and total wall-clock time MUST be ≤120 seconds

#### Scenario: SCN-004-01-02 Single subtask failure surfaces

- **GIVEN** `./scripts/score-parity.sh` is patched to exit 1
- **WHEN** `task test` runs
- **THEN** the command MUST exit non-zero, stdout MUST identify `test:parity` as the failed task, and the remaining subtasks MUST NOT mask the failure (`task test` exit code MUST be the parity exit code)

### Requirement: REQ-004-02 `task test:watch` re-runs on file change

The `test:watch` task SHALL invoke `watchexec -e go,js,yaml,json -- task test:unit`. A save to any file matching those extensions under `gdfkube-src/` MUST cause `test:unit` to re-execute within 2 seconds of the inotify event.

#### Scenario: SCN-004-02-01 Save triggers re-run

- **GIVEN** `task test:watch` is running in one terminal
- **WHEN** a contributor saves a `.yaml` file under `gdfkube-src/tests/unit/`
- **THEN** the watcher MUST emit a "running task test:unit" line within 2 seconds, and `task test:unit` MUST execute to completion

#### Scenario: SCN-004-02-02 Watcher exits cleanly on interrupt

- **GIVEN** `task test:watch` is running
- **WHEN** the user sends `SIGINT` to the watcher process
- **THEN** the watcher MUST terminate within 1 second with exit code 130 and MUST NOT leave any orphaned `watchexec` or `task` child processes

### Requirement: REQ-004-03 `task dev:up` reaches healthy state in ≤2 min

The `dev:up` task SHALL invoke `docker compose up -d --wait`. On the project devcontainer with a warm image cache, `task dev:up` MUST exit 0 within 120 seconds against the Phase 0 `compose.yaml`.

#### Scenario: SCN-004-03-01 Warm-cache convergence

- **GIVEN** all compose-stack images are present in the local Docker cache and no stack is running
- **WHEN** `task dev:up` runs
- **THEN** the command MUST exit 0 within 120 seconds and `docker compose ls` MUST report the `gdfkube-dev` project as `running`

#### Scenario: SCN-004-03-02 Cold-start exceeding budget reports clearly

- **GIVEN** the local Docker cache is empty
- **WHEN** `task dev:up` runs and image pulls exceed the 120-second budget
- **THEN** `task dev:up` MUST exit non-zero with the underlying `docker compose` exit code, stderr MUST surface the `--wait` timeout error, and the partial stack MUST remain inspectable via `docker compose ps`

### Requirement: REQ-004-04 `task score:gen` regenerates compose and Helm

The `score:gen` task SHALL run `score-compose generate -f score.node.yaml -f score.camel.yaml -f score-compose.yaml -o compose.yaml` followed by `score-helm generate -f score.node.yaml -f score.camel.yaml -o /tmp/gdfkube-helm`. After the task exits 0, `git diff --quiet gdfkube-src/compose.yaml` MUST exit 0 if the inputs were unchanged.

#### Scenario: SCN-004-04-01 Idempotent regeneration leaves clean tree

- **GIVEN** the working tree is clean and Score inputs are unchanged
- **WHEN** `task score:gen` runs
- **THEN** the command MUST exit 0 and `git status --porcelain gdfkube-src/compose.yaml` MUST produce no output

#### Scenario: SCN-004-04-02 Score input drift surfaces in diff

- **GIVEN** a contributor edits `score.node.yaml` to change the Node container port from `8080` to `8081`
- **WHEN** `task score:gen` runs
- **THEN** the command MUST exit 0 and `git diff gdfkube-src/compose.yaml` MUST show the port change reflected in the rendered service definition
