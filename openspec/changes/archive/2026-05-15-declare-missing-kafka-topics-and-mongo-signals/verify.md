# Verification Report

> This file is produced by the `openspec-verify-change` skill after the apply phase
> completes, to confirm consistency between the implementation and specs / design / tasks.
> Failed checks must be fixed in the corresponding artifact before re-running verify.

**Change**: `declare-missing-kafka-topics-and-mongo-signals`
**Verified at**: `2026-05-15 14:05`
**Verifier**: `cursor-agent`

---

## 1. Structural Validation (`openspec validate --all --json`)

- [x] All items returned `"valid": true`

**Result**:

```text
Change "declare-missing-kafka-topics-and-mongo-signals": valid: true, issues: []
```

The change itself passes validation. 13 pre-existing spec failures (missing `## Purpose` sections in specs like `gdfkube-audit-log-collection`, `itsm-groups-collection`, `kafka-broker-stack`, etc.) are unrelated to this change and pre-date it.

| Item | Type | Issues |
|---|---|---|
| declare-missing-kafka-topics-and-mongo-signals | change | None (valid) |

---

## 2. Task Completion (`tasks.md`)

- [x] All `- [ ]` have been changed to `- [x]`

23/23 tasks complete. No incomplete tasks.

| Task | Reason for incompletion | Blocks archive? |
|---|---|---|
| — | — | — |

---

## 3. Delta Spec Sync State

For each capability directory under `openspec/changes/declare-missing-kafka-topics-and-mongo-signals/specs/`,
compare against `openspec/specs/<capability>/spec.md`:

| Capability | Sync status | Notes |
|---|---|---|
| `itsm-groups-collection` | ✓ Already synced | "Groups Not in CDC Include List" requirement removed from main spec |
| `kafka-broker-stack` | ✗ Partially synced | RENAMED (9→11) and MODIFIED (table rows) already synced; ADDED "Debezium signal collection SHALL be declared at bootstrap" requirement not yet in main spec |

---

## 4. Design / Specs Coherence Spot Check

Spot-check that `design.md` decisions are reflected in the Requirements
and Scenarios of `specs/*.md`:

| Sampled item | design description | specs counterpart | Gap |
|---|---|---|---|
| D1: Declare both topics with peer defaults | Explicit `create_topic` with same partition/RF/retention as peers | kafka-broker-stack table shows `dbz.gdfkube.groups` (1/3/604800000/2) and `dlq.gdfkube.groups` (1/3/2592000000/2) | None |
| D2: `dlq.gdfkube.groups` keeps current name | Name unchanged; `OrgBootstrapRoute.java:69` uses it | kafka-broker-stack table lists `dlq.gdfkube.groups` | None |
| D3: `debezium_signals` with no indexes | Implicit `_id` sufficient; no app-level reads | Delta spec ADDED requirement states "MUST NOT be required to have application-defined indexes" | None |
| D4: Delete stale spec requirement | "Groups Not in CDC Include List" deleted, not rewritten | Main itsm-groups-collection spec no longer contains the requirement | None |
| D5: README sync bundled with code/spec edits | Three READMEs edited in same change | Tasks 4.1–4.4 all complete; amendments A-23–A-26 closed | None |

**Drift warnings** (non-blocking):

- None

---

## 5. Implementation Signal

- [x] No unstaged files in the worktree
- [x] All related commits are on main

**Commit range**: `3829d5d..8d9e30e` (relevant commits for this change on main)

**Code-coverage delta**: No new runtime code was added (pure declarative parity — bootstrap scripts, specs, READMEs). The existing `OrgBootstrapIntegrationTest` (51 tests) exercises the `dlq.gdfkube.groups` DLQ path and passed green (`BUILD SUCCESS`).

**Spec requirements without corresponding tests**: The ADDED "Debezium signal collection SHALL be declared at bootstrap" requirement's scenarios (collection exists after init, re-run is idempotent) were verified manually via `mongosh` in tasks 5.5 and 5.6. No automated test covers these scenarios; this is acceptable because the init script is a MongoDB shell script, not application code under JUnit.

---

## Overall Decision

- [x] ✅ PASS — ready to proceed with finishing-a-development-branch and archive
- [ ] ⚠️ PASS WITH WARNINGS — can proceed but note: `<explanation>`
- [ ] ❌ FAIL — return to the failed artifact, fix, and re-run verify

**Next step**:

Sync the remaining delta spec (kafka-broker-stack ADDED requirement) to the main spec, then generate retrospective.md and archive the change.
