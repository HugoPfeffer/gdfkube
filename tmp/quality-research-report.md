# gdfkube — Codebase Quality Research Report

**Date:** 2026-05-14
**Scope:** `/workspace` — Camel/Java backend, ITSM SPA + Express server, infra (Helm/Debezium/Mongo/Kafka/Gitea/docker-compose), OpenSpec governance, CI/build hygiene.
**Method:** Four parallel audit agents (Java, TypeScript, Infra, Governance) cross-referenced against `openspec/specs/` and `CLAUDE.md`.

This report lists improvement gaps grouped by severity, with concrete `path:line` references and a one-line "why it matters". Stylistic-only findings are omitted.

---

## TL;DR — Top 10 fixes, in priority order

1. **`init-camel-collections.js` will SyntaxError on startup** — `const db = db.getSiblingDB(...)` redeclares the mongosh reserved global. Blocks the entire compose stack (Camel waits on `mongo-collections-init`).
2. **`DlqHandlerRoute` never consumes `dlq.gdfkube.groups`** — the new `org-bootstrap` route produces to a DLQ topic nothing reads, so failures vanish silently.
3. **Per-org repo naming drift** — `RepoBootstrapRoute`/`GitPushRoute` use `{owner}-{org}`, spec + `OrgBootstrapRoute` use `gdfkube-{groupId}`. With non-default `giteaOwner` the routes split-brain.
4. **`username` in user-PATCH whitelist desyncs `_id`** — username *is* the `_id`; allowing it as a PATCH field creates orphans.
5. **NoSQL filter injection** in `GET /api/itsm/requests` via `?status[$ne]=…`.
6. **Operator request-list not scoped server-side** — any authenticated caller sees every group's requests.
7. **SSE endpoint has no auth middleware** — any caller can stream any request id's events.
8. **`HelmTemplateRunner` stdout pipe-deadlock** — stdout is read only after `process.waitFor(30s)`; large helm output blocks the subprocess and the 30s timeout masks the real error.
9. **No CI for the Express server** — `gdfkube-itsm-ci.yml` only tests the SPA; server changes ship untested.
10. **TruffleHog Action missing `fetch-depth: 0`** — pinned scan only sees the tip commit, contradicting `.claude/rules/secret-scanning-workflow.md`.

---

## Critical findings

### Camel / Java — `gdfkube-src/gdfkube-camel/`

- **DLQ topic mismatch — `org-bootstrap` failures dropped.**
  `routes/OrgBootstrapRoute.java:61` produces to `dlq.gdfkube.groups`, but `routes/DlqHandlerRoute.java:25-32` does not list that topic. Spec `openspec/specs/camel-orchestrator-stack/spec.md:65,385` requires the DLQ handler to consume `dlq.gdfkube.*`. Result: groups-pipeline failures are never persisted to `dlq_log`.
- **Per-org repo naming drift.**
  `routes/RepoBootstrapRoute.java:50` and `routes/GitPushRoute.java:63` build `repoName = giteaOwner + "-" + org`; `routes/OrgBootstrapRoute.java:112` and `openspec/specs/camel-orchestrator-stack/spec.md:371` use the literal prefix `gdfkube-{groupId}`. When `giteaOwner != "gdfkube"`, the two routes create/push to different repos for the same org.
- **`HelmTemplateRunner` stdout-pipe deadlock.**
  `bean/HelmTemplateRunner.java:42-55` starts a `CompletableFuture` to read stdout but calls `stdout.join()` *after* `process.waitFor(30s)`. Helm output > pipe buffer (~64 KB) blocks the subprocess forever; the 30s timeout fires and the captured `output` is truncated, masking the real failure. Drain stdout concurrently with `waitFor`, or `pb.redirectOutput(File)`.
- **Double-render overwrite hazard in `OrgBootstrapRoute`.**
  `routes/OrgBootstrapRoute.java:150-157` renders `argocd-org` and `rhacm-org` into the same `outputDir`. `collectRenderedFiles` (`bean/HelmTemplateRunner.java:69`) walks the full directory each call, and `findRenderedFile` (`OrgBootstrapRoute.java:212`) returns the first matching file name across both charts — if both charts ever emit the same filename, the wrong file is committed.

### ITSM SPA + Express — `gdfkube-src/gdfkube-itsm/`

- **Spec contradicts the role enum.**
  `openspec/specs/itsm-admin-users/spec.md:80` still requires four roles `operator/approver/admin/service`; `src/types.ts:3` and `server/src/models/User.ts:11` enforce only `operator | admin`. CLAUDE.md is unambiguous: the enum is exactly `operator | admin`. The spec must be updated (and the spec scenario dispatching `{role: "approver"}` removed).
- **`username` in the PATCH whitelist desyncs the primary key.**
  `server/src/services/userAdminService.ts:6-17` allows PATCH of `username`, but `username` *is* the `_id` of the User document (`server/src/models/User.ts:11`). Mutating `username` makes `username !== _id` with no `_id` migration — orphan documents. Either drop `username` from the whitelist or perform a `_id` rotation (latter is destructive).
- **NoSQL filter injection in requests list.**
  `server/src/routes/requests.ts:19-22` assigns `req.query.status`, `req.query.formId`, `req.query.requesterGroup` straight into the Mongo filter. Express parses `?status[$ne]=approved` into an object, which Mongo treats as an operator clause. Coerce to `String(...)` before assigning.
- **No server-side scope on operator request list.**
  `server/src/routes/requests.ts:16-29` returns every request to every authenticated caller; the SPA narrows by `requesterGroupName` (`src/pages/RequestsList.tsx:50`). Any operator hitting the API directly sees all groups.
- **SSE endpoint has no `demoUser` middleware.**
  `server/src/routes/sse.ts:9` is mounted without any auth gate. Any client can stream events for any request id.

### Infra — `gdfkube-src/gdfkube-infra/` + `docker-compose.yml`

- **Mongo init script will fail to parse.**
  `mongodb/init-camel-collections.js:1` — `const db = db.getSiblingDB(...)` redeclares the mongosh reserved global. mongosh ≥1.x throws `SyntaxError: Identifier 'db' has already been declared`, the init container exits non-zero, and `gdfkube-camel` (compose:394 `service_completed_successfully`) never starts. Sister script `mongodb/seed-collections.js:31` already uses `const database = db.getSiblingDB(...)` — same pattern needed here.
- **Gitea admin password defaults to `admin`.**
  `docker-compose.yml:337` — `${GITEA_ADMIN_PASSWORD:-admin}`. With `GITEA__service__DISABLE_REGISTRATION=true` and `INSTALL_LOCK=true`, this is the only admin account, and `bootstrap.sh:26` mints a `--scopes all --raw` PAT. Set a non-trivial default and require override.
- **Kafka topic catalog drift vs spec.**
  `infra/kafka/init-topics.sh:36-42` creates `dlq.gdfkube.request-router`, `dlq.gdfkube.status-emitter`, `dlq.gdfkube.audit-sink`, `dlq.gdfkube.config-reload`. Spec `openspec/specs/kafka-broker-stack/spec.md:65` requires `dlq.gdfkube.requests`; Camel spec line 385 requires `dlq.gdfkube.groups`. Neither is created. Spec says 9 topics; script creates 12. `infra/debezium/init-connect-topics.sh:11` is missing `min.insync.replicas=2` on the connect-internal topics required by spec.

### CI / Governance — `.github/workflows/`, `.pre-commit-config.yaml`, `.devcontainer/`

- **No CI for the Express server.**
  `.github/workflows/gdfkube-itsm-ci.yml:18` sets `working-directory: gdfkube-src/gdfkube-itsm` and runs SPA scripts only. `gdfkube-src/gdfkube-itsm/server/` has its own `package.json` + tests but is never installed/built/tested. The path filter at lines 7–12 still matches server-only PRs, so the job is misleadingly "green".
- **No Helm-lint, no image-build workflow.**
  Devcontainer ships `helm`, `docker`, and there are two `Dockerfile`s, but nothing in `.github/workflows/` lints charts or builds/pushes images. CLAUDE.md's "eliminate drift" goal has no CI guard.
- **TruffleHog Action lacks `fetch-depth: 0`.**
  `.github/workflows/trufflehog.yml:19-22` — `actions/checkout@…` is invoked without `fetch-depth: 0`, contradicting `.claude/rules/secret-scanning-workflow.md` ("mandatory"). Scans can't see commit history.
- **TruffleHog `push:` has no branch filter.**
  `.github/workflows/trufflehog.yml:4` — bare `push:` doubles up with `pull_request:` on PR branches. The rule prescribes `push: branches: [main]`.

---

## High findings

### Camel / Java

- **Command-injection / path-traversal surface on helm shell-out.**
  `bean/HelmTemplateRunner.java:32-37` — `chartRef` is concatenated as `/opt/charts/{chartRef}`. `chartRef` derives from `event.formId` (`bean/HelmValuesBuilder.java:53`) which originates from MongoDB documents. A malicious `formId="../../etc"` lets helm read outside `/opt/charts`. Validate against a chart whitelist or `[a-z0-9\-/]+`.
- **Path traversal via unvalidated `groupId` / `org`.**
  `routes/OrgBootstrapRoute.java:130-147` and `bean/HelmValuesBuilder.java:45,94` build `/tmp/{groupId}-…` and `workTree.resolve("orgs").resolve(groupId)`. A group `_id` like `../foo` escapes the org subtree (poisoned git commits). Add `Path.of(groupId).getNameCount() == 1` + slug regex.
- **`GiteaGitProvider.createRepo` JSON-injects description.**
  `git/GiteaGitProvider.java:78-81` builds JSON via `String.format` from `opts.getDescription()`. Any `"` or backslash corrupts the request body and can inject fields. Use Jackson `ObjectMapper`.
- **`MockGitProvider` diverges from `GiteaGitProvider` on path semantics.**
  `git/MockGitProvider.java:80-87` flattens nested paths to `file.getFileName()`; the real provider preserves them (`GiteaGitProvider.java:144`). `OrgBootstrapIntegrationTest` assertions hide the divergence.
- **In-memory dedup cache loses state on restart.**
  `routes/OrgBootstrapRoute.java:39,109` uses a `ConcurrentHashMap` only. Pod restart re-reads `earliest` Kafka and re-renders; safe by accident when target files exist, but crash mid-write between `Files.write` and `git push` leaves partial state. The route claims an atomicity it does not have.

### ITSM SPA + Express

- **PATCH whitelist out of sync with spec.**
  `server/src/services/userAdminService.ts:6-17` allows `username` and `active` in addition to the spec's `{ name, fullName, email, role, group, status, mfa, last }`. Either update `openspec/specs/itsm-users-collection/spec.md` or trim the whitelist + stop sending `active` from `src/admin/UserEditor.tsx:130-132`.
- **`requireAdmin` trusts the client-supplied `X-Demo-Role`.**
  `server/src/middleware/demoUser.ts:24` — every admin gate (PATCH/POST in `users.ts`, `groups.ts`, `forms.ts`, `settings.ts`) is bypassable by anyone setting the header. For a demo this is intentional, but it's not documented; either fold the role into the seeded user lookup or write the caveat into the spec.
- **`UserEditor` sends `active` but spec does not authorize it.**
  `src/admin/UserEditor.tsx:130` calls `disable` with `{ active: false }`. With the current whitelist it works, but the spec PATCH set has no `active`. Pick one source of truth.

### Infra

- **`groups` collection never created for CDC pre-image.**
  `mongodb/init-camel-collections.js:23-25` only calls `ensurePreImage('groups')` — and the call is wrapped in a try/catch that swallows the "collection does not exist" error. `seed-collections.js:67` does `upsertCollection('groups', …)` but `mongo-collections-init` does not `depends_on mongo-seed`, so on cold start `groups` may not exist when pre-image collMod runs. Net effect: Debezium pre-image capture for `groups` is silently disabled.
- **`gdfkube-orgs` repo never pre-created.**
  `gitea/seed-repos.sh:11` only creates `GITEA_REPO_MAIN`. In `dev` profile Camel uses `MockGitProvider` (camel spec L174) — no real `gdfkube-orgs` repo is ever pushed. ArgoCD `ApplicationSet` pointed at `…/gdfkube-{org}.git` will fail.
- **Generated org manifests are absent.**
  CLAUDE.md and the Camel spec reference `gdfkube-orgs/orgs/<org-slug>/`, but `/workspace/gdfkube-src/gdfkube-orgs/` does not exist. The "manifests match source of truth" goal cannot even be checked — the generated tree is not in git.
- **ArgoCD chart missing SyncPolicy, finalizers, project scoping.**
  `charts/infra/argocd-org/templates/applicationset.yaml:18-27` has no `syncPolicy` (no `automated`/`prune`/`selfHeal`), no `metadata.finalizers: ["resources-finalizer.argocd.argoproj.io"]`. `appproject.yaml:13` allows `namespace: "*"` + `server: "*"` and `clusterResourceWhitelist: ["*","*"]` — wide-open project, defeats isolation.
- **Hard-coded namespaces in charts.**
  `charts/cluster-request/templates/hostedcluster.yaml:4` and `nodepool.yaml:5` pin `namespace: clusters`; `charts/infra/argocd-org/templates/*.yaml:5` pin `namespace: argocd`. No `values.yaml` override.

### Governance / CI

- **CI omits `gdfkube-itsm/server/**` path filter.**
  `.github/workflows/gdfkube-itsm-ci.yml:7-12` triggers on the parent dir but only tests the SPA — server PRs run the wrong job.
- **No lint step in itsm CI.**
  `package.json` defines `lint`; `gdfkube-itsm-ci.yml:34-37` runs `typecheck`, `test`, `build` only.
- **Dependabot only covers github-actions.**
  `.github/dependabot.yml` has no `npm` ecosystems for `gdfkube-itsm/` / `gdfkube-itsm/server/`, no `maven` for `gdfkube-camel/`, no `docker` for the two Dockerfiles + devcontainer.
- **`engines` field missing on both SPA and server `package.json`.**
  CI uses Node 20, devcontainer uses Node 20, server `@types/node` is `^22`. No enforcement; one bumped runtime breaks builds.
- **Pre-commit only runs trufflehog.**
  `.pre-commit-config.yaml` — no eslint, prettier, spotless, or `mvn fmt`. The only pre-push guard is secret scanning.

---

## Medium findings

### Camel / Java

- No dedicated `onException(TransportException.class)` for transient Gitea/JGit failures; default 3-retry tight backoff falls to DLQ on a brief network blip.
- `HelmTemplateRunner` cleans the process in `finally` but leaks the stdout-reader thread if it's stuck on `readAllBytes`.
- `OrgBootstrapRoute` never cleans `/tmp/{groupId}-bootstrap-out` (`OrgBootstrapRoute.java:147`); stale renders survive across attempts and `findRenderedFile` may pick the wrong one first.
- **Test gaps.** No unit tests for `HelmTemplateRunner` (timeout, non-zero exit, stdout truncation), `GitRepoBootstrapper`, or `GiteaGitProvider` (HTTP/JGit paths). `OrgBootstrapIntegrationTest.helmRenderFailure_dlq` (lines 200-214) admits it doesn't assert DLQ routing — the `errorHandler` is not exercised because the route was `replaceFromWith("seda:…")`. Spec scenario `camel-orchestrator-stack/spec.md:423-428` not enforced.
- `StatusEmitterRoute.java:56` creates a `ProducerTemplate` per exchange — inject one `@Inject ProducerTemplate` field.
- `StatusEmitterRoute.java:95-96` `catch (Exception ignored)` — log at DEBUG at least.

### ITSM

- `express.json()` has no `limit` (`server/src/app.ts:19`) — default 100 KB is fine but should be explicit.
- `toJson(doc: any)` duplicated across four route files (`users.ts:9`, `groups.ts:9`, `forms.ts:9`, `requests.ts:9`).
- `form.fields as any` (`server/src/services/requestService.ts:75`) + `(form as any).status` (`:68`) — `FormDefModel` typing is weak.
- `req.demoUser!.id` non-null assertions in `routes/settings.ts:49`, `routes/requests.ts:47,60` — bypass TS guarantees if middleware order changes.
- No `ErrorBoundary` anywhere — a render-time error unmounts the whole shell. Add one around `<main>` at `src/App.tsx:192`.
- `data.users[0]!` (`src/App.tsx:56`) crashes silently when the API returns zero users; throw a clearer error.
- `NewGroupPage.tsx:69-77` and `NewUserPage.tsx:76` swallow create-API errors silently — call `setToast` like the recently-fixed GroupEditor path.

### Infra

- **Debezium connector hardening missing.**
  `debezium/connector-config.json` omits `errors.log.enable`, `errors.log.include.messages`, `producer.override.compression.type`, `producer.override.acks=all`. `signal.data.collection` references `gdfkube.debezium_signals` which is never created by `init-camel-collections.js` — signal sends will fail.
- **Reroute regex too permissive.**
  `debezium/connector-config.json:17` — `dbz.gdfkube.gdfkube.(.*)` is not anchored. Use `^dbz\.gdfkube\.gdfkube\.(.*)$`.
- **Mongo hot-path indexes & validators.**
  `seed-collections.js:91-92` only indexes `group` and `role` on `users` — no `username` index even though `X-Demo-User` lookup is the hottest path. No `$jsonSchema` validators anywhere.
- **One-shot init containers lack healthchecks / `start_period`.**
  `gitea-bootstrap`, `gitea-repo-seed`, `gitea-token-sync`, `mongo-init`, `kafka-init`, `gdfkube-connect-topics-init`, `gdfkube-debezium-init`, `mongo-seed`, `mongo-collections-init` — failures only surface via exit code.

### Governance

- **`auto-provision-org-resources-from-group-events`** has 7 open tasks (2.5 `mvn test`, 7.1–7.6 E2E verification). Code-side artifacts are present; blocker is verification, not implementation.
- **`remove-deadcode-group-admin-controls`** has 3 open tasks (6.5, 6.6 manual SPA smoke; 6.8 `pre-commit run --all-files`).
- **`split-demo-user-and-role`** has 9 open tasks (8.2–8.10 manual verification) — code already merged in `e3323b6`. Either archive the change or finish verification.
- **Stale `approver` / `service` roles in docs.**
  `docs/01-itsm-portal.md:74` and `docs/12-security-rbac.md:26-27` still describe non-admin approver / service roles. CLAUDE.md L46 says they don't exist.
- **Devcontainer pin gaps.**
  `.devcontainer/Dockerfile:1` `FROM node:20` (no minor/patch/digest); `gh`, `docker-ce-cli`, `helm`, `kubectl`, `oc`, `claude`, `plannotator`, `opencode-ai`, `spec-kit`, `openspec`, `uv` all install from `latest`/`stable` (lines 65, 155, 158, 161, 164, 167, 170-187). Reproducibility is shot.

---

## Low findings

- **Magic strings & charset defaults (Camel).** `/opt/charts/`, `/tmp/`, `30`/`5`-second timeouts, `TTL_MS = 60_000`, DLQ topic list (`DlqHandlerRoute.java:25-32`) all hard-coded; should be `@ConfigProperty`. `HelmValuesBuilder.java:46-48,95-97` uses non-UTF `FileWriter`; `OrgBootstrapRoute.java:209` `.getBytes()` without `StandardCharsets.UTF_8`.
- **Logging context.** Most Camel `LOG.infof` lines miss MDC `requestId`/`groupId` — audit trails don't join cleanly.
- **`as any` casts in ITSM tests.** `src/admin/__tests__/TemplateEditor.test.tsx:68`, `src/utils/__tests__/clipboard.test.ts:21,65` — acceptable for stubbing `navigator.clipboard`.
- **`pipeline/subscriptions.ts:7` non-null assertion** — safe but a Map-with-default helper would be cleaner.
- **GroupEditor/NewGroupPage tests** cover save/error toast, dirty gating, ID auto-derive, slugify, dispatch. Missing: API-error path on `NewGroupPage` create (currently silent).
- **`itsm-admin-users` spec internal contradiction.** Scenario "Role filter has no approver or service options" matches code, but two requirements above still list four roles.
- **`KAFKA_CLUSTER_ID` repeated 3× as literal** (compose:157,186,215) — use `${KAFKA_CLUSTER_ID:-…}`.
- **`kafka2`/`kafka3` missing HOST listener config** (compose:180,209) — asymmetry only; spec requires it on `kafka1` only.
- **`itsm` healthcheck hits `/`** instead of `/healthz` (compose:14).
- **`values.yaml` ships example values as defaults** — `helm install` with no `-f` yields a "saude" cluster. Move examples to `values.example.yaml`.
- **`gitea-repo-seed` force-pushes on every run** (`seed-repos.sh:61`) — destroys in-Gitea edits between runs.
- **Empty `/workspace/tmp` and `/workspace/.tmp`** at repo root, not in `.gitignore`.
- **CODEOWNERS missing for source paths** — only `.github/` and trufflehog config are covered. Solo dev, but PR auto-assignment fails.
- **`@types/node@^22` in server vs Node 20 runtime** (`server/package.json:24`).
- **Camel pom default `<skipITs>true</skipITs>`** — local `./mvnw verify` silently skips ITs; CI overrides correctly but document in `gdfkube-camel/README.md`.
- **Unused `LOG` fields.** `OrgBootstrapRoute.java:33`, `GitPushRoute.java:26`, `RepoBootstrapRoute.java:19` declare loggers but barely use them.

---

## Spec drift summary

| Spec | Drift |
|---|---|
| `camel-orchestrator-stack/spec.md` | Per-org repo name `gdfkube-{groupId}` (spec) vs `{owner}-{org}` (`RepoBootstrapRoute`/`GitPushRoute`). DLQ list (`DlqHandlerRoute`) excludes `dlq.gdfkube.groups` despite `org-bootstrap` producing to it. `status-emitter` `x-producer` header (spec line 207) untested. |
| `kafka-broker-stack/spec.md` | `init-topics.sh` creates 12 topics with different names than the 9 in the spec (missing `dlq.gdfkube.requests`, `dlq.gdfkube.groups`). |
| `debezium-connect-stack/spec.md` | `gdfkube.debezium_signals` collection never created. `min.insync.replicas` not set on connect-internal topics. |
| `mongodb-replica-set-stack/spec.md` | `groups` collection pre-image `collMod` runs before `mongo-seed` creates the collection — silently swallowed. |
| `itsm-admin-users/spec.md` | Lines 80–95 still describe four roles `operator/approver/admin/service`; code is `operator | admin`. Scenario dispatches `{role: "approver"}`. |
| `itsm-users-collection/spec.md` | PATCH whitelist in code (`username`, `active`) is broader than spec; spec missing `active`. |
| `gitea-stack` | "No live Gitea secret" intent vs `${GITEA_ADMIN_PASSWORD:-admin}` in compose. |

---

## Recommended next actions

**This branch (already in flight — auto-provision-org-resources-from-group-events):**

1. Add `dlq.gdfkube.groups` to `DlqHandlerRoute` (`routes/DlqHandlerRoute.java:25-32`).
2. Reconcile per-org repo naming: replace `giteaOwner + "-" + org` with `"gdfkube-" + org` in `RepoBootstrapRoute.java:50` and `GitPushRoute.java:63`, or make it a single `@ConfigProperty`.
3. Validate `groupId`/`chartRef`/`org` against `^[a-z0-9][a-z0-9-]*$` in `HelmValuesBuilder` and `OrgBootstrapRoute` before any filesystem/helm/git use.
4. Fix `HelmTemplateRunner` stdout drain — read concurrently with `waitFor`.
5. Fix `mongodb/init-camel-collections.js:1` — `const database = db.getSiblingDB(...)`.
6. Add `min.insync.replicas=2` to `init-connect-topics.sh:11`.
7. Add `dlq.gdfkube.requests` and `dlq.gdfkube.groups` to `init-topics.sh`; remove unspec'd extras or update the spec.

**Next small change (server hardening):**

8. Coerce `req.query.{status,formId,requesterGroup}` to `String` in `server/src/routes/requests.ts:19-22`.
9. Add `demoUser` middleware to `server/src/routes/sse.ts`.
10. Scope `GET /api/itsm/requests` server-side by `requesterGroupName === demoUser.group` for operators.
11. Drop `username` from `server/src/services/userAdminService.ts:6-17` PATCH whitelist (or write a `_id` rotation migration).
12. Update `openspec/specs/itsm-admin-users/spec.md` to enforce the `operator | admin` enum and reflect the actual PATCH set.

**CI / governance (one PR):**

13. Add `gdfkube-itsm/server` install/test step + `lint` step to `gdfkube-itsm-ci.yml`.
14. Add `fetch-depth: 0` and `push: branches: [main]` to `trufflehog.yml`.
15. Expand `dependabot.yml`: `npm` × 2, `maven`, `docker`.
16. Add `engines: { node: "20.x" }` to both `package.json`s.
17. New workflow: `helm lint charts/*`.

**Spec hygiene (close-out PRs):**

18. Archive `split-demo-user-and-role` (code merged) by ticking off manual verification or rewriting the leftover tasks as "post-merge smoke" notes.
19. Update `docs/01-itsm-portal.md:74` and `docs/12-security-rbac.md:26-27` to drop `approver`/`service` references.
