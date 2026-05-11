# Retrospective: containerize-itsm-and-mongodb

> Written: 2026-05-11 (after verify passed)
> Commit range: `ca5ada4..HEAD` (initial implementation) + runtime verification fixes in this session
> Worktree: main workspace `/workspace`

---

## 1. Wins

- [evidence: `ca5ada4`] Core implementation (Dockerfile, nginx.conf, .dockerignore, init-rs.js, docker-compose.yml) was delivered in a single focused commit with correct separation of concerns.
- [evidence: verify.md tasks 4.1–4.8 all PASS] Full runtime verification passed — SPA-fallback, cache headers, replica set topology, idempotency, persistence, and full reset all work end-to-end.
- [evidence: `docker compose ps` output] The dependency chain (mongo nodes → init → seed → api → itsm) resolves cleanly using compose healthcheck conditions.
- [evidence: pre-commit PASS] No secrets in any new file; trufflehog clean.
- [evidence: nginx.conf lines 9-11] Immutable cache headers for hashed Vite assets reduce re-download on revisits; `no-cache` for index.html ensures fresh deploys propagate immediately.

## 2. Misses

- 🟡 [painful | evidence: `server/.dockerignore` excluded `tsconfig.json`] The API server's `.dockerignore` blocked the TypeScript config needed by the builder stage. Went unnoticed until runtime because the API was added by a separate change (`add-itsm-express-api`) and only surfaced when compose tried to build both images together.
- 🟡 [painful | evidence: Docker bind mount → EISDIR] Docker-from-Docker path mismatch meant bind mounts silently created directories instead of mounting files. Required adding `COMPOSE_HOST_WORKSPACE` env var and `.env` file — not part of original plan.
- 📌 [nit | evidence: `seed-collections.js` used `cat()`] The seed script used the deprecated `cat()` shell helper instead of `fs.readFileSync()`, causing failures in `mongosh` v2+. Fixed during verification.
- 📌 [nit | evidence: `@types/express@5` type errors] Express v5 types changed `req.params` to `string | string[]`, causing 4 compilation errors in route handlers. Required `as string` casts.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 6.4 (mongo-init) | Added `${COMPOSE_HOST_WORKSPACE:-.}` prefix to bind mount paths | Docker-from-Docker in devcontainer requires host paths for bind mounts |
| (new) | Changed mongo-seed entrypoint to replica set URI | Direct `--host mongo1` connection fails if mongo1 isn't elected primary |
| 7 (verification) | Used `docker exec` instead of `curl` from host | Port `127.0.0.1:8080` binds to host loopback, not accessible from devcontainer network |
| (compose additions) | `gdfkube-itsm-api` and `mongo-seed` services now in compose | Added by the `add-itsm-express-api` change after the original containerize plan was written |

## 4. Skill / workflow compliance

| Skill | Used | Reason if skipped |
|-------|------|-------------------|
| superpowers:brainstorming | Yes | brainstorm.md artifact exists |
| superpowers:writing-plans | Yes | plan.md artifact exists with detailed micro-tasks |
| superpowers:using-git-worktrees | No | Single-branch workflow in devcontainer; cloud agent env doesn't support worktrees well |
| superpowers:subagent-driven-development | Partial | Initial implementation used subagents; verification phase done directly |
| (transitive) superpowers:test-driven-development | No | Infrastructure-only change — no application code to TDD; verification is the testing surface |
| (transitive) superpowers:requesting-code-review | No | Solo developer, verification-before-completion was the quality gate |
| superpowers:finishing-a-development-branch | Not yet | Change still on main branch, PR/merge decision pending |

## 5. Surprises

- **Docker-from-Docker bind mounts silently fail**: When the Docker socket is shared into a devcontainer, relative paths in compose volumes resolve to container paths which don't exist on the host. Docker creates them as empty directories instead of erroring. Required discovering the host path via `docker inspect` and adding a `COMPOSE_HOST_WORKSPACE` env var.
- **mongosh removed `cat()` helper**: The `cat()` function from the legacy `mongo` shell is not available in `mongosh` (which `mongo:7.0` ships). `fs.readFileSync()` is the replacement.
- **Replica set primary election race**: After `rs.initiate()` completes, a primary isn't immediately elected. Services that depend on `mongo-init` via `condition: service_completed_successfully` may start writing before a primary exists. Required adding a wait-for-primary loop and using a replica-set-aware connection string.
- **`@types/express@5` breaks `req.params`**: Express 5 type definitions widen `req.params[key]` to `string | string[]`, breaking strict TypeScript code that passes params directly to `(id: string)` functions.

## 6. Promote candidates

| Learning | Promote to | Notes |
|----------|------------|-------|
| Docker-from-Docker needs `COMPOSE_HOST_WORKSPACE` env var for bind mounts in devcontainers | CLAUDE.md | Add to "Environment" section — any compose with bind mounts needs this pattern |
| `mongosh` in `mongo:7.0` has no `cat()` — use `fs.readFileSync()` | CLAUDE.md | Useful for any future mongo init/seed scripts |
| Always use replica-set URI for services that write — don't assume which node becomes primary | CLAUDE.md / design pattern | Relevant for future Debezium and API service configurations |
| `@types/express@5` requires `req.params.x as string` casts | Long-term memory | Recurring issue when Express types are pinned to v5 |
