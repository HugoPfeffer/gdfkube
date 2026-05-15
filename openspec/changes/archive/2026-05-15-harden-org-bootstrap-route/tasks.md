## 1. Pre-flight

- [x] 1.1 Confirm `unify-gitea-repo-naming` has landed and `HelmValuesBuilder.getRepoName(String)` is present in `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/bean/HelmValuesBuilder.java`. If not, stop and reorder.
- [x] 1.2 Read `OrgBootstrapRoute.java` end-to-end and re-verify the five issue sites still match the design (lines may shift after `unify-gitea-repo-naming`).

## 2. `HelmValuesBuilder.buildForOrg` — drop dead arg + scoped temp file

- [x] 2.1 Change the signature of `buildForOrg(String groupId, String groupRepo)` to `buildForOrg(String groupId)` in `HelmValuesBuilder.java`. Remove every `groupRepo` reference in the method body (it was never read).
- [x] 2.2 Replace `"/tmp/" + groupId + "-bootstrap-values.yaml"` with `Files.createTempFile("bootstrap-" + groupId + "-", ".yaml")`. Return `path.toString()`.
- [x] 2.3 Update `HelmValuesBuilderTest.java`:
  - drop the `groupRepo` argument from every existing call site,
  - relax the path assertion from `equals("/tmp/cultura-bootstrap-values.yaml")` to `matches("bootstrap-cultura-.*\\.yaml")` under `java.io.tmpdir`,
  - add a test exercising two concurrent `buildForOrg("cultura")` calls and asserting the returned paths differ.

## 3. `OrgBootstrapRoute` — `op == null` rejection

- [x] 3.1 In the route's leading `.process(...)` block, add the `op == null` branch ahead of the `"d".equals(op)` branch: `LOG.warnf(...)` + `accepted = false`.
- [x] 3.2 Add a unit test (`OrgBootstrapRouteTest`) sending a message with neither `__op` nor `op`; assert: no `gitProvider.commitAndPush` invocation, no DLQ producer invocation, `kafkaManualCommit.commitSync()` invoked exactly once.

## 4. `OrgBootstrapRoute` — scoped temp `outputDir` + `.onCompletion()` cleanup

- [x] 4.1 Replace `String outputDir = "/tmp/" + groupId + "-bootstrap-out"` in `processGroupEvent` with `Path outputDirPath = Files.createTempDirectory("bootstrap-" + groupId + "-"); String outputDir = outputDirPath.toString();`.
- [x] 4.2 Immediately after computing `outputDir`, call `exchange.setProperty("outputDir", outputDir)`.
- [x] 4.3 In `configure()`, add an `.onCompletion()...end()` block before the `.process(this::processGroupEvent)` choice. The body reads `exchange.getProperty("outputDir", String.class)`; if non-null and the path exists, `Files.walk(...).sorted(Comparator.reverseOrder()).forEach(Files::delete)` with a per-entry `try/catch` logging WARN on `IOException`.
- [x] 4.4 Add an integration scenario asserting `Files.list(Path.of(System.getProperty("java.io.tmpdir"))).filter(p -> p.getFileName().toString().startsWith("bootstrap-cultura-"))` is empty after a normal `op=c` exchange completes.

## 5. `OrgBootstrapRoute` — dedup-after-success

- [x] 5.1 Remove the `dedupCache.put(groupId, System.currentTimeMillis())` call from before the helm/git work block.
- [x] 5.2 Insert the same `dedupCache.put(...)` call immediately after `gitProvider.commitAndPush(workTree, addedPaths, message, GitAuthor.CAMEL)` and before the `auditInterceptor.emit(... "bootstrap" ...)` call.
- [x] 5.3 Keep the `dedupCache.containsKey(groupId)` check + early return where it is (before the repo-ensure steps).
- [x] 5.4 Add an integration test forcing `helmTemplateRunner.render` to throw and asserting `dedupCache.isEmpty()` (or `!dedupCache.containsKey("cultura")`) after the exchange completes (and after redeliveries are exhausted).

## 6. `OrgBootstrapRoute` — drop `node.path("repo")`

- [x] 6.1 Remove the `String groupRepo = node.path("repo").asText("gdfkube-" + groupId);` line.
- [x] 6.2 Update the `helmValuesBuilder.buildForOrg(groupId, groupRepo)` call site to `helmValuesBuilder.buildForOrg(groupId)`.
- [x] 6.3 Confirm no other reference to `groupRepo` remains in the route.

## 7. Build + verify

- [x] 7.1 `./mvnw -pl gdfkube-src/gdfkube-camel test` — green.
- [x] 7.2 Manual smoke: post a malformed `dbz.gdfkube.groups` message (no headers) to the local Kafka stack; tail the gdfkube-camel logs for the WARN; confirm `dlq.gdfkube.groups` did not receive it and the consumer offset advanced.
- [x] 7.3 Manual smoke: post a normal `op=c` for a fresh group; after the exchange completes, `ls $TMPDIR/bootstrap-*` returns empty.
- [x] 7.4 `pre-commit run --all-files`.
