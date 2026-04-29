---
name: phase-status
description: Audit the active gdfkube v2 phase doc's `## 7. Acceptance criteria` checklist against the current repo state. Reads the phase markdown, runs the corresponding grep / task / file-existence checks, and reports which boxes are objectively green vs which still need hand-verification. Use this when checking phase progress, deciding whether to gate to the next phase, or before writing a status update.
user-invocable: false
---

# phase-status

Each phase doc under `.claude/plans/phased/phase-*.md` ends with a `## 7. Acceptance criteria (gate to Phase N+1)` checklist. The checklist mixes objective gates (CI workflows pass, files exist, grep gates) with subjective ones (the README documents X, the working-project demo runs). This skill mechanises the objective subset so you don't have to re-scan the doc every session.

## How to use

1. Determine the active phase. Default heuristic: latest-modified `phase-*.md` under `/workspace/.claude/plans/phased/`. If that's ambiguous, ask the user once.
2. Read its `## 7. Acceptance criteria` section.
3. For each bullet, classify it:
   - **mechanical** — can be verified with a deterministic command (grep, file existence, `task <target>` exit code, CI workflow file presence, `kubectl --dry-run`). Run the check.
   - **judgmental** — needs human sign-off (README quality, demo recording, "documents how to inspect each running service"). Mark as `needs review` and surface what evidence to look for.
4. Report.

## Phase 0 mechanical checks (concrete recipe)

```bash
cd /workspace
# Acceptance: no `gdfkube.gov/group` in deliverables (G3)
grep -RInE 'gdfkube\.gov/group' gdfkube-src/ .github/ 2>/dev/null || echo "G3: clean"
# Acceptance: no kubectl/oc apply outside tests/ scripts/ (G4)
grep -RInE '\b(kubectl|oc)[[:space:]]+apply\b' gdfkube-src/ \
  --exclude-dir=tests --exclude-dir=scripts 2>/dev/null || echo "G4: clean"
# Acceptance: required workflows present
for w in chart-lint score-parity connector-parity; do
  test -f .github/workflows/${w}.yaml && echo "${w}.yaml: present" || echo "${w}.yaml: MISSING"
done
# Acceptance: required Score/connector/Taskfile artifacts
for f in score.node.yaml score.camel.yaml score-compose.yaml connector.json Taskfile.yaml compose.yaml README.md; do
  test -f gdfkube-src/${f} && echo "${f}: present" || echo "${f}: MISSING"
done
# Acceptance: task test exits 0 (full suite)
( cd gdfkube-src && task test ) >/tmp/phase0-test.log 2>&1
echo "task test exit: $?"
```

## Output format

A compact report with three sections, in this order:

1. **Mechanical (auto-checked):** one bullet per criterion with ✓ / ✗ and the command output (≤1 line).
2. **Judgmental (needs human):** one bullet per criterion with the evidence the user should look at.
3. **Verdict:** `gate to Phase N+1: ready` only if all mechanical bullets are ✓ AND the user has signed off on the judgmental ones; otherwise `not ready` with the count of open items.

## Things to avoid

- Do not auto-fix anything. This skill is read-only — it reports state, doesn't mutate it.
- Do not extend the checklist with criteria the doc doesn't list. If the user wants additional gates, they should add them to the phase doc first.
- Do not mark a judgmental criterion as ✓ on the user's behalf — always surface them as `needs review`.
