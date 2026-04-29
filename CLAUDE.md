# gdfkube — Project Context

## Two containers — do not confuse them

| Context | What it is | Where it lives |
|---|---|---|
| **Devcontainer** | The Claude Code Sandbox **you are running inside right now**. It is the developer environment, not a deliverable. | `.devcontainer/` (Dockerfile + `devcontainer.json`) |
| **Project container** | The gdfkube application image (Camel / Debezium routes generating OCP manifests). Built and shipped by the project's own pipeline. | `gdfkube-src/` (source) — built outside this repo's `.devcontainer` |

If a request mentions "the container," disambiguate. Default assumption when unclear: changes under `.devcontainer/` configure the **dev sandbox**; changes under `gdfkube-src/` ship in the **project image**.

## Devcontainer environment

- Base: `node:20` on Debian 12 (bookworm). Host is Fedora 43.
- Marker env var: `DEVCONTAINER=true`. User `node` (uid 1000, groups `node`/`969`/`docker`). Workspace at `/workspace`.
- `runArgs`: `--cap-add=NET_ADMIN --cap-add=NET_RAW --group-add=969`. Group 969 is the host's `docker` group — required for **Docker-outside-of-Docker** (the container talks to the host Docker daemon, not a nested one).
- `postStartCommand` runs `.devcontainer/scripts/init-firewall.sh`. That script applies nftables rules **inside the container's netns only** — it never modifies host firewall state.
- Persistent volumes: `/commandhistory` (bash history), `/home/node/.claude` (Claude config).
- Forwarded port: `9999` (plannotator).
- Pre-installed: `claude`, `opencode`, `openspec`, `specify`, `kubectl`, `helm`, `oc`, `gh`, `trufflehog`, `uv`, `pipx`, `pre-commit`, `direnv`, `starship`, `git-delta`.

When asked to "rebuild the container" inside a Claude Code session: that almost always means rebuild the **devcontainer** (VS Code: *Dev Containers: Rebuild Container*). The project image rebuild is a separate pipeline.

## Project (gdfkube)

- Purpose: generate OpenShift / HCP cluster manifests via Debezium → Kafka → Camel pipelines, applied through GitOps.
- Source: `gdfkube-src/` (skeleton on `main`; full implementation lives on `simple/debezium-*` branches).
- Targets Kubernetes / OpenShift — hence `kubectl`, `helm`, `oc` in the devcontainer.

## Spec-driven workflow (openspec)

- Config: `openspec/config.yaml`, `mode: deep`. **Strict** gates on `proposal`, `specs`, `tasks`. Advisory on `research`, `design`.
- All requirements need `REQ-<CAP>-<seq>` IDs, scenarios in GIVEN/WHEN/THEN, tasks need `TSK-*` with `traces:` and `depends_on:`. See `openspec/config.yaml` for the full rule set before drafting artifacts.

## Security guardrails (already wired up — do not bypass)

- TruffleHog runs as a pre-commit hook (`v3.93.4`, verified-only) and in CI (`.github/workflows/trufflehog.yml`, verified+unknown).
- CODEOWNERS protects `.github/workflows/`, `.trufflehog/`, `.pre-commit-config.yaml` — changes there need owner review.
- `.claude/rules/*.md` are auto-loaded — consult them before editing security-related files.
- Never commit secrets. Use `# trufflehog:ignore` for fake-but-credential-shaped test fixtures.

## MCP servers (`.mcp.json`)

`context7` (docs), `firecrawl-mcp` (web), `kubernetes` (**read-only**), `github`. The kubernetes server is read-only on purpose — apply changes via `oc`/`kubectl` from a terminal, not via MCP.

## Commit and PR messages

Write them dense. Information per character is the metric — drop anything a reader would skim past.

**Commit messages**
- Subject line only by default. Add a body only when the *why* is non-obvious from the diff.
- Imperative mood, no trailing period, ≤72 chars. No conventional-commit prefixes unless the surrounding history already uses them.
- No "this commit", no restating the file path, no "as discussed", no Claude/Co-Authored-By trailers unless asked.

**Pull request messages**
- Title: same rules as commit subject.
- Body: one tight `## Summary` of 1–3 bullets stating *what changed and why*. Nothing else.
- **Do not include a Test Plan / testing checklist section.** Omit it entirely — do not leave an empty heading.
- No screenshots placeholders, no "Notes for reviewer", no boilerplate sections that would be empty.

## Common gotchas

- Editing `.devcontainer/devcontainer.json` requires a devcontainer rebuild before changes take effect.
- `.gitignore` lists `.claude/`, but tracked files under `.claude/` (e.g. `settings.json`, `rules/`) remain tracked. New files added there will not be picked up by git — move them out of `.claude/` if you need them versioned.
- `EDITOR=cursor --wait` is set inside the container; `git commit` without `-m` will try to launch Cursor.
- `claude` is aliased to `--allow-dangerously-skip-permissions` (`.devcontainer/.bashrc.d/aliases`). That is the developer-shell alias — Claude Code's own permission prompts still apply when running headless.
