# Retrospective: kafka-broker-stack

> Written: 2026-05-11 (after verify passed with warnings)
> Commit range: `978930f` (single implementation commit on main)
> Worktree: `/workspace` (main branch)

---

## 1. Wins

- [evidence: `978930f`, all 17 tasks `[x]` in `tasks.md`] All spec requirements implemented in a single commit covering 3 new compose services, 1 init service, the init script, and the connection contract README. No back-and-forth revisions needed during apply phase.
- [evidence: verification tests 5.1–5.7 all passed] Every acceptance scenario from the spec passed on first full run: brokers healthy in ~10s, all 9 topics created, configs verified, idempotent re-run clean, produce/consume worked, broker-loss tolerated, cold-start recovery succeeded.
- [evidence: `brainstorm.md` → `design.md` → `spec.md` structural alignment] The mongo-stack pattern (named volumes, healthchecks, init container, loopback binding) transferred cleanly to Kafka with minimal adaptation. The established compose conventions made design decisions near-automatic.
- [evidence: `init-topics.sh` uses `--if-not-exists` + `kafka-configs.sh --alter`] Idempotency worked exactly as designed — re-run produced exit 0 with no "Created topic" output lines, matching the spec's "re-running is a no-op" scenario.

## 2. Misses

- 🟡 [painful | evidence: `plan.md` line 9 says `apache/kafka:3.7`, actual image is `apache/kafka:3.7.2`] The brainstorm, design, and plan all specified `apache/kafka:3.7` as the image tag. This tag does not exist on Docker Hub — the correct tag for the latest 3.7.x release is `3.7.2`. Required a runtime fix during the implementation session. The spec was corrected but `design.md` and `brainstorm.md` still reference `:3.7`.
- 🟡 [painful | evidence: Docker socket access failure during verification] Docker socket permissions in the devcontainer initially blocked all Docker commands during verification. Required `.devcontainer/Dockerfile` and `devcontainer.json` changes to enable Docker-in-Docker access. This was environment setup friction unrelated to the Kafka change itself.
- 📌 [nit | evidence: verification test 5.5] The HOST listener design means only kafka1 is host-reachable, so host-side produce/consume only works for partitions led by kafka1. The verification plan (step 5.6 in `plan.md`) originally used `127.0.0.1:9092` for the produce/consume test. Had to switch to the PLAINTEXT listener (`localhost:19092` inside the container) for reliable cross-partition coverage. The spec acknowledged this limitation but the plan didn't account for it.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| Task 1 (generate cluster ID) | Cluster ID generation used `kafka-storage.sh random-uuid` from within the `apache/kafka:3.7.2` image instead of `:3.7` | Tag `:3.7` does not exist; had to use the concrete patch version |
| Task 2–5 (all service definitions) | Image tag `apache/kafka:3.7` → `apache/kafka:3.7.2` everywhere | Docker Hub only publishes concrete patch versions (e.g. `3.7.2`), not minor-only tags |
| Task 7 Step 6 (host-side produce/consume) | Used PLAINTEXT listener (`localhost:19092` inside kafka1 exec) instead of HOST listener (`127.0.0.1:9092`) | HOST listener only reaches kafka1 partitions; PLAINTEXT gives reliable full-cluster access |
| All tasks | Implemented as a single commit instead of per-task commits as outlined in the plan | Simpler and cleaner for an infrastructure-only change with no intermediate testable states |

## 4. Skill / workflow compliance

| Skill                                            | Used | Reason if skipped |
|--------------------------------------------------|------|-------------------|
| superpowers:brainstorming                        | ✅    | `brainstorm.md` produced with 3 alternatives evaluated |
| superpowers:writing-plans                        | ✅    | `plan.md` produced with 7 tasks, 20 steps |
| superpowers:using-git-worktrees                  | ❌    | Infrastructure-only change, no risk of conflicting with in-progress application work; worked directly on main |
| superpowers:subagent-driven-development          | ❌    | Single implementation session, tasks were sequential (compose file → script → docs → verify) |
| (transitive) superpowers:test-driven-development | ❌    | No application code — infrastructure is verified via Docker integration tests, not unit tests |
| (transitive) superpowers:requesting-code-review  | ❌    | Solo developer, single-commit infrastructure change |
| superpowers:finishing-a-development-branch       | ❌    | No feature branch created; committed directly to main |

## 5. Surprises

- **`apache/kafka:3.7` tag does not exist.** The Apache Kafka Docker Hub repository only publishes concrete patch version tags (e.g., `3.7.0`, `3.7.1`, `3.7.2`) — not minor-version-only tags like `:3.7`. The `docs/05-kafka.md` spec says "Apache Kafka 3.7+" which was interpreted as tag `:3.7` throughout brainstorm, design, and plan artifacts. This only surfaced at docker pull time.
- **Docker socket access was not pre-configured in the devcontainer.** The `.devcontainer/` setup did not grant Docker socket access, which meant `docker compose` commands failed until the Dockerfile and devcontainer.json were patched. This is an environment concern, not a Kafka concern, but it blocked the entire verification phase.
- **HOST listener partition affinity was underestimated.** The single-host-port design (`127.0.0.1:9092` → kafka1 only) means that when producing via the HOST listener, only partitions whose leader is kafka1 can be written to directly. This is architecturally correct (compose services use the 3-broker PLAINTEXT bootstrap) but it made the verification plan's host-side produce/consume step unreliable until switched to the internal listener.

## 6. Promote candidates

| Learning | Promote to | Notes |
|----------|------------|-------|
| Always verify Docker image tags exist before committing them to specs — Docker Hub may not publish minor-only tags | CLAUDE.md | Add a coding standard: "When specifying Docker image tags, verify the exact tag exists on the registry before using it in specs or compose files" |
| The mongo-stack compose pattern (named volumes, healthchecks, `restart: "no"` init container, loopback binding, `gdfkube-net`) is a proven template for adding new infrastructure services | long-term memory | Record as a reusable pattern: "gdfkube compose infrastructure service template" |
| Devcontainer must have Docker socket access for infrastructure changes — check `.devcontainer/` setup before starting compose-dependent work | CLAUDE.md | Add to environment section: "Docker socket access required for infrastructure verification" |
