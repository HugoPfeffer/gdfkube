# Verification Report

> Produced after the apply phase to confirm consistency between the implementation and specs / design / tasks.

**Change**: `org-provision-via-request-pipeline`
**Verified at**: `2026-06-01`
**Verifier**: Claude (opsx:apply, subagent-driven-development)

---

## 1. Structural Validation (`openspec validate --all`)

- [x] The change item `change/org-provision-via-request-pipeline` returned valid.

**Result**:

```text
✓ change/org-provision-via-request-pipeline
Totals: 16 passed, 17 failed (33 items)
```

The 17 failing items are all pre-existing `spec/*` baseline specs (e.g. `kafka-broker-stack`, `org-bootstrap-test-determinism`, several `itsm-*`) that fail a strictness rule ("Spec must have a Purpose section"). This is **pre-existing and unrelated**: the base commit `dfecf09` shows the identical `17 failed`, and these commits never touched `openspec/specs/` (`git diff --name-only dfecf09..HEAD -- openspec/specs/` is empty). This change's own deltas validate cleanly.

---

## 2. Task Completion (`tasks.md`)

- [x] All in-scope tasks for this `main`-based worktree are `- [x]`.

**Incomplete tasks**:

| Task | Reason for incompletion | Blocks archive? |
|---|---|---|
| 2.2, 3.2, 6.1 | `platform/manifests/init-jobs/configmaps.yaml` exists only on `main-openshift`; absent from this `main`-based worktree. The same edits (drop `gdfkube.groups` from the embedded `collection.include.list`, remove `ensurePreImage('groups')`, remove `create_topic "dbz.gdfkube.groups"`) must be applied there to avoid source/mirror drift. | No (cross-branch follow-up) |
| 5.4 | Cluster end-to-end verification requires a live OpenShift cluster (not available in this devcontainer). | No (manual) |

---

## 3. Delta Spec Sync State

Deltas remain unapplied (correct — application happens at archive). Headers were matched against the live base specs during authoring.

| Capability | Sync status | Notes |
|---|---|---|
| org-provisioning-trigger | ✗ Needs sync (new) | New capability; applied at archive |
| camel-orchestrator-stack | ✗ Needs sync | RENAMED+MODIFIED org-bootstrap reqs, MODIFIED route topology |
| debezium-connect-stack | ✗ Needs sync | RENAMED+MODIFIED CDC-collections requirement |
| kafka-broker-stack | ✗ Needs sync | RENAMED+MODIFIED catalog (drop `dbz.gdfkube.groups`) |
| org-bootstrap-test-determinism | ✗ Needs sync | MODIFIED route→`direct:` source + property input |

---

## 4. Design / Implementation Coherence

| Decision (design.md) | Implemented? | Evidence |
|---|---|---|
| D1 — re-point `org-bootstrap` to `direct:org-bootstrap`, read `org` property, drop op-filter | ✅ | `OrgBootstrapRoute.java` (commit `3e340be`); spec + quality review ✅ |
| D2 — invoke from `repo-bootstrap` before `git-push` | ✅ | `RepoBootstrapRoute.java` sets `org`, `.to("direct:org-bootstrap")`; `GitPushRoute` calls repo-bootstrap before workload write |
| D3 — drop `gdfkube.groups` CDC source + topic | ✅ (source files) / ⏳ (configmaps mirror) | `connector-config.json`, `init-topics.sh`, READMEs (commit `81b239a`); configmaps.yaml deferred to `main-openshift` |
| D4 — retain `dlq.gdfkube.groups` + group seeding | ✅ | `dlq.gdfkube.groups` kept in `init-topics.sh` and the route error handler; seeding untouched |

---

## 5. Test Evidence

- `./mvnw -o test` (JDK 21 at `/home/node/.local/jdk`): **`Tests run: 61, Failures: 0, Errors: 0, Skipped: 0` — BUILD SUCCESS.**
- Two op-filtering tests removed (behavior removed by spec); new `PipelineIntegrationTest.goldenPath_provisioningAlsoCreatesOrgScaffolding` asserts the request pipeline commits `orgs/{org}/{appproject,applicationset,{org}-clusterset}.yaml` to `gdfkube-orgs`.
- Two-stage review (spec compliance ✅, code quality ✅) passed per task.
- `pre-commit run --all-files` → TruffleHog **Passed**.

---

## 6. Blocking Issues

**None on this branch.** The change is complete and green for the `main`-based source-of-truth files. Before deploying to the cluster, complete the `main-openshift` configmaps.yaml mirror edit (task 6.1) and the cluster end-to-end check (5.4). Coordinate with the active `run-verification-gates-on-auto-provision` change (shared auto-provision path) and heed the OpenShift `targetRevision` pre-deploy note before any real bootstrap.
