# Verification Report

> This file is produced by the `openspec-verify-change` skill after the apply phase
> completes, to confirm consistency between the implementation and specs / design / tasks.
> Failed checks must be fixed in the corresponding artifact before re-running verify.

**Change**: `<change-name>`
**Verified at**: `YYYY-MM-DD HH:mm`
**Verifier**: `<who / which agent>`

---

## 1. Structural Validation (`openspec validate --all --json`)

- [ ] All items returned `"valid": true`

**Result**:

```text
<paste summary of openspec validate --all output>
```

If any items failed, list id + issues:

| Item | Type | Issues |
|---|---|---|
| — | — | — |

---

## 2. Task Completion (`tasks.md`)

- [ ] All `- [ ]` have been changed to `- [x]`

**Incomplete tasks** (if any):

| Task | Reason for incompletion | Blocks archive? |
|---|---|---|
| — | — | — |

---

## 3. Delta Spec Sync State

For each capability directory under `openspec/changes/<name>/specs/`,
compare against `openspec/specs/<capability>/spec.md`:

| Capability | Sync status | Notes |
|---|---|---|
| — | ✓ Already synced / ✗ Needs sync / N/A | — |

---

## 4. Design / Specs Coherence Spot Check

Spot-check that `design.md` decisions are reflected in the Requirements
and Scenarios of `specs/*.md`:

| Sampled item | design description | specs counterpart | Gap |
|---|---|---|---|
| — | — | — | — |

**Drift warnings** (non-blocking):

- <list if any; otherwise "None">

---

## 5. Implementation Signal

- [ ] No unstaged files in the worktree
- [ ] All related commits have been pushed

**Commit range** (if known): `<from-sha>..<to-sha>`

---

## Overall Decision

- [ ] ✅ PASS — ready to proceed with finishing-a-development-branch and archive
- [ ] ⚠️ PASS WITH WARNINGS — can proceed but note: `<explanation>`
- [ ] ❌ FAIL — return to the failed artifact, fix, and re-run verify

**Next step**:

<describe the next action>
