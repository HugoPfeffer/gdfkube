## Why

The `auto-provision-org-resources-from-group-events` change was archived on 2026-05-14 with all six verification tasks (2.5, 7.1–7.6) still unchecked. CLAUDE.md mandates *"verification before completion."* The audit (`CODEBASE-AUDIT-2026-05-14.md`, X-1) and the placeholder report (§4, "High") flag this as a high-severity gap: the implementation is code-complete but evidence-pending, which is exactly the failure mode the verification step exists to prevent. Closing this gap unblocks the archive entry's credibility and re-anchors the spec-driven workflow.

## What Changes

**Verification evidence for archived change**
- From: `openspec/changes/archive/2026-05-14-auto-provision-org-resources-from-group-events/tasks.md` has 6 unchecked `[ ]` items under §2.5 and §7.1–7.6; no `evidence/` directory exists.
- To: All 6 items are ticked `[x]`, each backed by a verbatim log file under a new `evidence/` directory inside the archived change folder.
- Reason: Audit finding X-1 — code-complete, evidence-pending — must close before the archived change can be considered fully landed.
- Impact: Non-breaking; documentation-only on the openspec side; the gates themselves are read-only against the running stack.

**Failure routing**
- From: No defined procedure for a failing verification gate.
- To: Failing gate triggers a new openspec change capturing the failure, plus a `[ ] 7.x-blocked-by-<change-id>` follow-up line appended to the original tasks file. Silent re-runs are forbidden.
- Reason: Preserves the audit trail; prevents the "rerun until green" anti-pattern.
- Impact: Adds a process expectation; no code impact.

## Capabilities

### New Capabilities
- `auto-provision-verification-evidence`: Defines the evidence artifacts, acceptance criteria, and failure-routing rules for the six post-archive verification gates of the `auto-provision-org-resources-from-group-events` change.

### Modified Capabilities
<!-- None. This change records evidence against existing requirements; it does not modify any spec. -->

## Impact

- **Affected files (write)**:
  - New: `openspec/changes/archive/2026-05-14-auto-provision-org-resources-from-group-events/evidence/{maven-test,app-startup-it,itsm-server-test,debezium-snapshot-replay,spa-e2e-cultura,spa-e2e-noop}.txt`
  - Edited: `openspec/changes/archive/2026-05-14-auto-provision-org-resources-from-group-events/tasks.md` (6 boxes flipped; possibly 0–6 follow-up lines appended)
- **Affected systems (read-only exercise)**:
  - `camel-orchestrator-stack` — `./mvnw test` and `./mvnw -DskipITs=false verify` against `gdfkube-src/gdfkube-camel`, exercising `PipelineIntegrationTest`, `OrgBootstrapIntegrationTest`, `AppStartupIT` (9 routes: request-router, repo-bootstrap, helm-render, git-push, status-emitter, audit-sink, dlq-handler, config-reload, org-bootstrap).
  - `itsm-express-api` — `npm test` against `gdfkube-src/gdfkube-itsm/server`.
  - `debezium-connect-stack` — connector restart via Connect REST API + Kafka topic inspection on `dbz.gdfkube.groups`.
  - `gitea-stack` — repo + manifest existence check (`gdfkube-cultura`, `gdfkube-orgs/orgs/cultura/*`).
  - `gdfkube-audit-log-collection` — row presence query for `create-repo`/`bootstrap`/`noop`.
- **Dependencies / version pinning**: No new dependencies. Uses already-pinned tools (mvnw wrapper, npm in itsm server, mongosh, kafka-console-consumer, curl) shipped in the devcontainer.
- **Testing strategy**:
  - Unit + integration: covered by 2.5, 7.1, 7.3 (existing Maven + npm suites).
  - System / IT: 7.2 (`AppStartupIT`).
  - End-to-end (manual): 7.4 (Debezium snapshot replay), 7.5 (SPA create), 7.6 (SPA edit-noop).
  - Pre-commit `trufflehog` runs against the new `evidence/` files to ensure no secret leakage from captured logs.
- **Sequencing constraints**: Blocked by `harden-org-bootstrap-route`, `strengthen-org-bootstrap-tests`, `declare-missing-kafka-topics-and-mongo-signals`. Blocks: nothing in-flight; closes audit finding X-1.
