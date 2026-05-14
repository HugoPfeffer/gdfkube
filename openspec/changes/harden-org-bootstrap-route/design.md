## Context

`OrgBootstrapRoute` (added by `auto-provision-org-resources-from-group-events`, archived 2026-05-14) consumes `kafka:dbz.gdfkube.groups` and provisions per-org GitOps content in the central `gdfkube-orgs` repo. The route works on the golden path. Post-merge audit on 2026-05-14 (verified against `gdfkube-camel/src/main/java/gov/gdf/camel/routes/OrgBootstrapRoute.java` and `…/bean/HelmValuesBuilder.java`) surfaced:

| ID  | Severity | Site | Issue |
|-----|----------|------|-------|
| H-4 | High | `OrgBootstrapRoute.java:147`, `HelmValuesBuilder.java:94` | Hardcoded `/tmp/<groupId>-…` paths collide on concurrent redelivery; `REPO_LOCKS` guards only the git work tree. |
| H-5 | High | `OrgBootstrapRoute.java:147` | `outputDir` is never cleaned up — `finally` deletes only the values file. |
| H-11| High | `OrgBootstrapRoute.java:105-109` | `dedupCache.put` runs *before* helm/git work; a transient failure suppresses the next legitimate retry for up to 60s. |
| M-4 | Medium | `OrgBootstrapRoute.java:75-87` | When both `__op` and `op` headers are missing, the route falls through to `accepted = true` — a malformed CDC envelope is treated as a create. |
| M-1 | Medium | `OrgBootstrapRoute.java:146`, `HelmValuesBuilder.java:68-99` | `buildForOrg(groupId, groupRepo)` accepts `groupRepo` but never reads it; the route correspondingly reads `node.path("repo")` only to feed this dead parameter. |

Peer route `HelmRenderRoute.java:48-63` already demonstrates the cleanup pattern (an `.onCompletion()` block walking the temp dir in reverse order and deleting). That pattern was not ported to `OrgBootstrapRoute`.

This change is sequenced after `unify-gitea-repo-naming` (which introduces `helmValuesBuilder.getRepoName(groupId)`, the canonical replacement for the inline `node.path("repo")` read) and before `strengthen-org-bootstrap-tests` (which codifies the new failure-path behavior into integration tests).

## Goals / Non-Goals

**Goals:**
- Eliminate the `/tmp` scratch leak for `OrgBootstrapRoute` exchanges.
- Make `dedupCache` reflect *successful* completion only, so failed events remain retriable.
- Make malformed CDC envelopes (no `__op`/`op`) an explicit drop with a WARN log, not a silent create.
- Make per-exchange temp paths unique even under concurrent redelivery for the same `groupId`.
- Remove the dead `groupRepo` parameter and the `node.path("repo")` read that only existed to feed it.

**Non-Goals:**
- DLQ test rewrite — covered by `strengthen-org-bootstrap-tests`.
- Repo-name unification — covered by `unify-gitea-repo-naming` (this change consumes its output).
- Real decommission flow for `op == "d"` — still dropped, per the original capability scope.
- Cross-pod dedup (the in-memory `dedupCache` is per-JVM by design; cluster-wide dedup is a future plan that would back the cache with Redis or MongoDB).
- Removing `REPO_LOCKS` — it remains useful as a tight-loop guard between near-simultaneous distinct events.

## Decisions

### D1: `.onCompletion()` cleanup over `try-with-resources`

`OrgBootstrapRoute.configure()` gains an `.onCompletion()` block *before* the body of `from(...)`:

```java
from("kafka:...")
    .routeId(ROUTE_ID)
    .onCompletion()
        .process(exchange -> {
            String outputDir = exchange.getProperty("outputDir", String.class);
            if (outputDir == null) return;
            Path dir = Path.of(outputDir);
            if (!Files.exists(dir)) return;
            try (Stream<Path> walk = Files.walk(dir)) {
                walk.sorted(Comparator.reverseOrder()).forEach(p -> {
                    try { Files.delete(p); }
                    catch (IOException e) { LOG.warnf("Failed to clean up %s: %s", p, e.getMessage()); }
                });
            }
        })
    .end()
    …
```

`processGroupEvent` sets `exchange.setProperty("outputDir", outputDir)` immediately after computing the path, so cleanup runs on both success and exception paths.

**Why over `try-with-resources` on a `Path`**: `Path` isn't `Closeable`. We'd need a custom `AutoCloseable` wrapper, which is more code than the `.onCompletion()` block — and the cleanup pattern is already a precedent in `HelmRenderRoute` that reviewers recognize.

**Why over `Files.deleteIfExists` in a `finally`**: doesn't recurse, and the helm output is a directory tree.

### D2: Move `dedupCache.put` to after `commitAndPush`, not after audit emit

The `containsKey` check at line 105 stays. The `put` moves from line 109 to immediately after `gitProvider.commitAndPush(...)` (currently line 179) and before the `auditInterceptor.emit(... "bootstrap" ...)` call.

**Why not after the audit emit**: the audit emit is best-effort. A failure there should not retry helm + git work.

**Trade-off**: if Camel crashes between `commitAndPush` and the next-line audit emit, the next redelivery within 60s replays the helm render. The route already detects "all 3 files present → noop" at line 140 (`appproject.yaml` + `applicationset.yaml` + `<groupId>-clusterset.yaml`), so the replay is benign — at most we redo a helm template render against an idempotent file-system state.

**Why we keep `REPO_LOCKS`**: even with dedup-after-success, two distinct group events arriving back-to-back race on `cloneOrPull` + write + commit. The lock remains the right primitive for that window.

### D3: `op == null` is dropped with a WARN, parallel to `op == "d"`

```java
.process(exchange -> {
    String op = exchange.getIn().getHeader("__op", String.class);
    if (op == null) op = exchange.getIn().getHeader("op", String.class);
    if (op == null) {
        LOG.warnf("groups event missing __op/op header, dropping: %s",
                  exchange.getIn().getBody(String.class));
        exchange.setProperty("accepted", false);
    } else if ("d".equals(op)) {
        LOG.debugf("groups.delete dropped: %s", exchange.getIn().getBody(String.class));
        exchange.setProperty("accepted", false);
    } else {
        exchange.setProperty("accepted", true);
    }
})
```

**Why drop and ack rather than DLQ**: DLQ is reserved for genuine processing failures with redelivery semantics. A missing op header is a structural defect in the upstream message — retrying it 3× with backoff cannot fix it. The WARN log gives operators the signal; the offset commits so the consumer doesn't stall.

**Why WARN, not ERROR**: the route still does the right thing (drops the event); ERROR would page someone needlessly.

### D4: `Files.createTempDirectory` / `Files.createTempFile` over UUID suffix

```java
// route
Path outputDirPath = Files.createTempDirectory("bootstrap-" + groupId + "-");
String outputDir = outputDirPath.toString();
exchange.setProperty("outputDir", outputDir);

// HelmValuesBuilder.buildForOrg
Path valuesPath = Files.createTempFile("bootstrap-" + groupId + "-", ".yaml");
```

**Why over manual UUID suffix**: identical guarantee, fewer moving parts, uses the platform's well-tested temp-path API. Inherits `java.io.tmpdir` (still `/tmp` in our containers) so we don't need a Quarkus config knob.

**Why prefix retains `groupId`**: operators triaging a leaked path want to see which group produced it without `lsof` gymnastics. The prefix is non-functional metadata.

### D5: Drop `groupRepo` from `HelmValuesBuilder.buildForOrg`

Signature becomes `buildForOrg(String groupId)`. The route stops reading `node.path("repo")` at line 102 (the value was only consumed by the dead parameter). The canonical repo name, when needed, comes from `helmValuesBuilder.getRepoName(groupId)` (introduced by `unify-gitea-repo-naming`).

**Sequencing**: this is the only item that depends on another in-flight change. We sequence after `unify-gitea-repo-naming` lands.

## Risks / Trade-offs

- **[Risk] D2 replays helm render on rare crash-between-commit-and-audit.** → Mitigation: the existing line-140 "all files present → noop" short-circuit makes the replay benign; no duplicate commit, no double bootstrap.
- **[Risk] D3 drops messages a tolerant operator might have wanted to inspect.** → Mitigation: the WARN log carries the raw body; `dlq.gdfkube.groups` is unaffected for *processing* failures; if operators later want a "malformed" channel, that's a separate plan.
- **[Risk] D4 prefix leaks `groupId` to anyone with read access to `/tmp`.** → Mitigation: `groupId` is already on the file system inside the git work tree (`orgs/<groupId>/…`); no new exposure. `Files.createTempDirectory` applies default OS permissions (typically `rwx------` for the process user).
- **[Risk] D5 sequencing — if `unify-gitea-repo-naming` slips, this change cannot drop `node.path("repo")`.** → Mitigation: implementation tasks list D5 last; tasks 1-4 are independent and land regardless.
- **[Trade-off] `.onCompletion()` runs even on `op == null` drops where no `outputDir` exists.** → Acceptable: the handler's first action is `if (outputDir == null) return;`, no cost.

## Migration Plan

No data migration. The change ships in a single Camel restart:

1. Merge after `unify-gitea-repo-naming`.
2. Build `gdfkube-camel`; the new route definition takes effect on next container start.
3. No Kafka consumer group rebalance (the route ID stays `org-bootstrap`).
4. No MongoDB schema change.
5. No Helm value change in `argocd-org` / `rhacm-org` charts (`buildForOrg` still emits the same values document).

**Rollback**: revert the commit. `dedupCache` is in-memory, so a rollback restores the prior behavior immediately; the `/tmp` cleanup is a no-op on rollback (already-cleaned paths simply stay gone). Any in-flight events are reprocessed under the prior behavior — the file-exists check at line 140 absorbs replays idempotently.

## Open Questions

None. All five fixes are mechanical and verified against the source on 2026-05-14.
