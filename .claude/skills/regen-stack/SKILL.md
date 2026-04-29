---
name: regen-stack
description: Tear down the local compose stack, regenerate Score outputs (compose.yaml + Helm release), bring the stack back up, and run the full TDD test suite. Use when a Score spec or compose overlay has changed and you want a clean from-scratch verification before committing.
disable-model-invocation: true
---

# regen-stack

This is the outer-loop reset for the gdfkube v2 local-dev stack. The TDD inner loop is `task test:watch` (see phase-0-foundation.md §3.6.1); this skill is the heavier "I changed a spec, prove the whole stack still converges" path.

## What this skill does

1. `cd /workspace/gdfkube-src`
2. `task dev:down` — stops compose, removes volumes (so a stale Mongo replica-set state can't poison the next run).
3. `task score:gen` — regenerates `compose.yaml` from `score.{node,camel}.yaml` + `score-compose.yaml`, and re-renders the Helm release into `/tmp/gdfkube-helm` for inspection.
4. `task dev:up` — `docker compose up -d --wait`. Waits for healthchecks (≤2 min per Phase 0 acceptance criterion).
5. `task test` — runs `test:unit`, `test:parity`, `test:chart-lint`, `test:helm-dry-run` (the full Phase 0 acceptance suite).

## When to invoke

- After editing `score.node.yaml`, `score.camel.yaml`, or `score-compose.yaml`.
- After pulling main and seeing changes under `gdfkube-src/`.
- When `task test:watch` is hitting state from an earlier run that no longer matches the spec.
- Before opening a PR that touches Phase 0 deliverables.

## When NOT to invoke

- For inner-loop iteration on Java/Node code — use `task test:watch` instead. This skill rebuilds the whole stack and is much slower.
- When you only want to inspect the rendered Helm output — `task score:gen` alone is enough.

## Execution

Run from anywhere; the skill always operates against `/workspace/gdfkube-src/`:

```bash
cd /workspace/gdfkube-src
task dev:down
task score:gen
task dev:up
task test
```

Report the result back to the user as a short summary:

- which step (if any) failed,
- the `task` exit code,
- a one-line root-cause hypothesis if a test failed (do **not** auto-fix — surface to user).

If `gdfkube-src/Taskfile.yaml` does not yet exist (Phase 0 not bootstrapped), say so and stop. Do not attempt to recreate the Taskfile from scratch.
