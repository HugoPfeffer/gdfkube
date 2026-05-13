# gdfkube

Solo developer. Author: Hugo Pfeffer <hugo.pguima@gmail.com>

## Project Layout

```
gdfkube-src/           # all demo source code, manifests, and scripts
  gdfkube-infra/       # infra components: RHACM configs, ArgoCD bootstrap manifests
  gdfkube-camel/       # Camel route source code
  gdfkube-itsm/        # ITSM demo source code
  gdfkube-orgs/        # generated manifests consumed by ArgoCD
    orgs/
      sec-educ/
      sec-tes/
      sec-saude/
      ...
.devcontainer/         # devcontainer config (Dockerfile, devcontainer.json)
.claude/rules/         # path-scoped coding rules (security, workflows)
openspec/              # change proposal schemas and configs
```

Everything outside `gdfkube-src/` is development environment configuration.

## Environment

- Devcontainer-based (changes go in `.devcontainer/`)
- Kubernetes-targeted project
- Tech stack: Quarkus, Helm, Apache Kafka, MongoDB, Debezium, Apache Camel, NodeJS
- MCP servers: context7, firecrawl, kubernetes, github (configured in `.mcp.json`)
- Pre-commit hook: trufflehog secret scanning
- CI: GitHub Actions trufflehog workflow + Dependabot

## Workflow: OpenSpec + Superpowers

All changes follow a spec-driven workflow powered by OpenSpec (primary framework) with Superpowers skills integrated as the bridge schema.

- **OpenSpec** drives the change lifecycle: proposal -> spec -> design -> tasks -> plan -> implement -> verify -> retrospective
- **Superpowers** skills (brainstorming, writing-plans, TDD, debugging, etc.) are invoked at the appropriate OpenSpec phases via the `superpowers-bridge` schema
- Config lives in `openspec/config.yaml`; schemas and templates in `openspec/schemas/`
- Use the `openspec-propose` skill to start a new change, `openspec-apply-change` to implement tasks

## Demo identity

- `DEMO_USERS` in `gdfkube-src/gdfkube-itsm/server/src/data/demoUsers.ts` is the single source of truth for demo users. The SPA `Bootstrap` loads `/api/itsm/users` and `/api/itsm/groups`; do not add frontend fallback arrays.
- The role enum is exactly `operator | admin`. No `approver`, no `service`. If a UI surface is needed for additional roles, expand the enum here first, then propagate to `Role` (`src/types.ts`) and the admin Users editor.
- `X-Demo-User` is the only identity wire between SPA and Express. Set it synchronously via `setDemoUser(username)` from `src/api/itsmApi.ts` — never via an async resolver.
- No `FALLBACK_USERS` / `FALLBACK_GROUPS` constants. If `/api/itsm/users` or `/api/itsm/groups` fails, Bootstrap surfaces the existing `phase === 'error'` UI — fail hard, don't paper over.

## Coding Standards

- Prefer modifying existing functions/services over creating new ones
- Keep code simple and maintainable — no cleverness for its own sake
- Eliminate drift: generated manifests must match their source of truth
- Never commit secrets — trufflehog pre-commit hook enforces this
- Add `# trufflehog:ignore` only for intentionally safe values (like `.env.example` placeholders)

## Git

- Run `pre-commit run --all-files` before pushing
- Commit messages: concise, imperative ("add route", not "added route")
