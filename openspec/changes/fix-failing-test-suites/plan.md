# Fix Failing Test Suites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `gdfkube-itsm` server and `gdfkube-camel` test suites deterministically green by fixing a parallel-worker DB race, a Group-model default regression, and a non-isolated camel temp-dir assertion.

**Architecture:** Three independent, file-local fixes. RC-1: namespace the server vitest DB per worker via `VITEST_POOL_ID`. RC-2: default `Group.users`/`forms` to numeric `0` and correct two stale tests to the counts contract. RC-3: scope the camel cleanup assertion to the test's own exchange `outputDir` property. No production runtime code changes.

**Tech Stack:** Node 20 + vitest 2.1.9 + mongoose 8 (server); Quarkus + Apache Camel + JUnit5 (camel).

---

### Task 1: RC-1 — Per-worker DB isolation in server vitest setup

**Files:**
- Modify: `gdfkube-src/gdfkube-itsm/server/vitest.setup.ts`

- [ ] **Step 1: Reproduce the flake (capture baseline)**

Run (from `gdfkube-src/gdfkube-itsm/server`):
```bash
npm test 2>&1 | tail -3 ; npm test 2>&1 | tail -3
```
Expected: two runs, both with failures, and a *different* failing count/set (e.g. 32 then 27). This is the race.

- [ ] **Step 2: Apply per-worker DB namespacing**

Replace the `MONGO_URL` constant block in `vitest.setup.ts` with a per-worker-derived URL. Current:
```ts
const MONGO_URL =
  process.env.MONGO_URL ??
  'mongodb://mongo1:27017/gdfkube_test?replicaSet=rs0';
```
New:
```ts
const BASE_MONGO_URL =
  process.env.MONGO_URL ??
  'mongodb://mongo1:27017/gdfkube_test?replicaSet=rs0';

// Each parallel vitest worker gets its own database so one worker's
// beforeEach deleteMany cannot wipe another worker's fixtures.
const POOL_ID = process.env.VITEST_POOL_ID ?? '0';
const _u = new URL(BASE_MONGO_URL);
_u.pathname = `${_u.pathname}_${POOL_ID}`;
const MONGO_URL = _u.toString();
```

- [ ] **Step 3: Drop the per-worker DB in afterAll**

Replace the existing `afterAll` block:
```ts
afterAll(async () => {
  if (connected) {
    await mongoose.disconnect();
  }
});
```
with:
```ts
afterAll(async () => {
  if (connected) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
```

- [ ] **Step 4: Verify determinism (default parallelism, run twice)**

Run (from `gdfkube-src/gdfkube-itsm/server`):
```bash
npm test 2>&1 | tail -3 ; npm test 2>&1 | tail -3
```
Expected: both runs identical, `Tests  2 failed | 116 passed` (the 2 remaining are RC-2, fixed in Task 2). Crucially the count is now STABLE across runs.

- [ ] **Step 5: Verify serialized fallback still works**

Run: `npx vitest run --no-file-parallelism 2>&1 | tail -3`
Expected: `Tests  2 failed | 116 passed` (same 2 RC-2 tests; no race-induced failures).

- [ ] **Step 6: Commit**

```bash
git add gdfkube-src/gdfkube-itsm/server/vitest.setup.ts
git commit -m "fix(itsm-server): isolate vitest workers with per-worker test DB"
```

---

### Task 2: RC-2 — Group model defaults + stale test assertions

**Files:**
- Modify: `gdfkube-src/gdfkube-itsm/server/src/models/Group.ts`
- Modify: `gdfkube-src/gdfkube-itsm/server/__tests__/models.test.ts:185-189`
- Modify: `gdfkube-src/gdfkube-itsm/server/__tests__/groups.test.ts:60-69`

- [ ] **Step 1: Confirm the two tests fail deterministically**

Run (from `gdfkube-src/gdfkube-itsm/server`):
```bash
npx vitest run __tests__/models.test.ts __tests__/groups.test.ts 2>&1 | tail -5
```
Expected: 2 failures, both `expected undefined to deeply equal []`.

- [ ] **Step 2: Update the model test to the counts contract**

In `__tests__/models.test.ts`, replace:
```ts
  it('defaults users and forms to empty arrays', () => {
    const doc = new GroupModel({ _id: 'test', name: 'Test' });
    expect(doc.users).toEqual([]);
    expect(doc.forms).toEqual([]);
  });
```
with:
```ts
  it('defaults users and forms to numeric zero', () => {
    const doc = new GroupModel({ _id: 'test', name: 'Test' });
    expect(doc.users).toBe(0);
    expect(doc.forms).toBe(0);
  });
```

- [ ] **Step 3: Update the groups route test to the counts contract**

In `__tests__/groups.test.ts`, in the `creates group as admin` test, replace:
```ts
      expect(res.body.users).toEqual([]);
      expect(res.body.forms).toEqual([]);
```
with:
```ts
      expect(res.body.users).toBe(0);
      expect(res.body.forms).toBe(0);
```

- [ ] **Step 4: Run tests to verify they now fail for the right reason**

Run: `npx vitest run __tests__/models.test.ts __tests__/groups.test.ts 2>&1 | tail -5`
Expected: still 2 failures, now `expected undefined to be 0` (assertion updated; model still missing default).

- [ ] **Step 5: Add numeric defaults to the Group model**

In `src/models/Group.ts`, replace:
```ts
    users: Schema.Types.Mixed,
    forms: Schema.Types.Mixed,
```
with:
```ts
    users: { type: Schema.Types.Mixed, default: 0 },
    forms: { type: Schema.Types.Mixed, default: 0 },
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run __tests__/models.test.ts __tests__/groups.test.ts 2>&1 | tail -5`
Expected: `Tests  ... 0 failed` for both files.

- [ ] **Step 7: Cross-check no consumer treats these as arrays**

Run:
```bash
grep -rn "\.users\|\.forms" ../src/pages/admin/Users.tsx ../src/admin/NewGroupPage.tsx ../src/types.ts gdfkube-src/gdfkube-itsm/server/src 2>/dev/null | grep -iE "group|\.map\(|\.length|\.includes\(" | head
```
Expected: SPA renders `g.users`/`g.forms` as numbers; `Group` type in `src/types.ts` is `users: number`; no `.map`/`.length` on group users/forms. Confirm no code path expects an array.

- [ ] **Step 8: Commit**

```bash
git add gdfkube-src/gdfkube-itsm/server/src/models/Group.ts gdfkube-src/gdfkube-itsm/server/__tests__/models.test.ts gdfkube-src/gdfkube-itsm/server/__tests__/groups.test.ts
git commit -m "fix(itsm-server): default Group users/forms to numeric 0 and align tests"
```

---

### Task 3: RC-3 — Scope camel cleanup assertion to the test's own exchange

**Files:**
- Modify: `gdfkube-src/gdfkube-camel/src/test/java/gov/gdf/camel/routes/OrgBootstrapIntegrationTest.java:280-292`

Context: `sendGroupEvent(...)` returns the Camel `Exchange`. `OrgBootstrapRoute` sets exchange property `outputDir` (the `Files.createTempDirectory("bootstrap-<group>-")` path) and deletes it in `.onCompletion()`. So after a successful exchange the assertion can check that *that specific* directory is gone, instead of scanning the shared `java.io.tmpdir`.

- [ ] **Step 1: Confirm the test fails in a full run (order-dependent)**

Run (from `gdfkube-src/gdfkube-camel`):
```bash
JAVA_HOME=/home/node/.local/jdk ./mvnw -B test 2>&1 | grep -E "outputDir_cleanedUpAfterSuccess|Tests run: [0-9]+, Failures"
```
Expected: `OrgBootstrapIntegrationTest` shows `Failures: 1`, `outputDir_cleanedUpAfterSuccess` FAILURE `expected: <0> but was: <N>`.

- [ ] **Step 2: Rewrite the assertion to be exchange-scoped**

In `OrgBootstrapIntegrationTest.java`, replace the whole method body:
```java
    @Test
    void outputDir_cleanedUpAfterSuccess() throws Exception {
        sendGroupEvent("cultura", "gdfkube-cultura", "c");

        try (var listing = Files.list(Path.of(System.getProperty("java.io.tmpdir")))) {
            long leftover = listing
                    .filter(p -> p.getFileName().toString().startsWith("bootstrap-cultura-"))
                    .filter(Files::isDirectory)
                    .count();
            assertEquals(0, leftover,
                    "All bootstrap-cultura-* temp directories must be cleaned up after the exchange");
        }
    }
```
with:
```java
    @Test
    void outputDir_cleanedUpAfterSuccess() throws Exception {
        Exchange exchange = sendGroupEvent("cultura", "gdfkube-cultura", "c");

        String outputDir = exchange.getProperty("outputDir", String.class);
        assertNotNull(outputDir, "route must set the outputDir exchange property");
        assertFalse(Files.exists(Path.of(outputDir)),
                "the outputDir created by this exchange must be cleaned up after success: " + outputDir);
    }
```

- [ ] **Step 3: Ensure required imports exist**

Check the import block at the top of the file. If missing, add:
```java
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import org.apache.camel.Exchange;
```
Run: `grep -nE "import static org.junit.jupiter.api.Assertions.(assertFalse|assertNotNull)|import org.apache.camel.Exchange;" gdfkube-src/gdfkube-camel/src/test/java/gov/gdf/camel/routes/OrgBootstrapIntegrationTest.java`
Expected: all three present after edit (`Exchange` is already used by `sendGroupEvent`'s return type, so it is likely already imported — do not duplicate).

- [ ] **Step 4: Confirm OrgBootstrapRoute is untouched**

Run: `git status --porcelain gdfkube-src/gdfkube-camel/src/main`
Expected: empty (no production change).

- [ ] **Step 5: Run the full camel suite twice (determinism)**

Run (from `gdfkube-src/gdfkube-camel`):
```bash
JAVA_HOME=/home/node/.local/jdk ./mvnw -B test 2>&1 | grep -E "Tests run: [0-9]+, Failures: [0-9]+, Errors|BUILD (SUCCESS|FAILURE)" | tail -3
JAVA_HOME=/home/node/.local/jdk ./mvnw -B test 2>&1 | grep -E "Tests run: [0-9]+, Failures: [0-9]+, Errors|BUILD (SUCCESS|FAILURE)" | tail -3
```
Expected: both runs `Tests run: 62, Failures: 0, Errors: 0` and `BUILD SUCCESS`.

- [ ] **Step 6: Commit**

```bash
git add gdfkube-src/gdfkube-camel/src/test/java/gov/gdf/camel/routes/OrgBootstrapIntegrationTest.java
git commit -m "test(camel): scope org-bootstrap cleanup assertion to the test's own exchange"
```

---

### Task 4: Full-suite verification & pre-commit gate

**Files:** none (verification only)

- [ ] **Step 1: Server suite green twice**

Run (from `gdfkube-src/gdfkube-itsm/server`):
```bash
npm test 2>&1 | tail -2 ; npm test 2>&1 | tail -2
```
Expected: both `Tests  118 passed (118)`, identical.

- [ ] **Step 2: Web suite no regression**

Run (from `gdfkube-src/gdfkube-itsm`):
```bash
npm test 2>&1 | tail -2
```
Expected: `Tests  394 passed (394)`.

- [ ] **Step 3: Camel suite green twice**

Run (from `gdfkube-src/gdfkube-camel`):
```bash
JAVA_HOME=/home/node/.local/jdk ./mvnw -B test 2>&1 | grep -E "Tests run: 62, Failures: 0|BUILD SUCCESS" | tail -2
```
Expected: `Tests run: 62, Failures: 0, Errors: 0`, `BUILD SUCCESS`.

- [ ] **Step 4: Pre-commit gate**

Run (from repo root): `pre-commit run --all-files`
Expected: all hooks pass (trufflehog clean). If a tool is not installed, surface the command to the user rather than skipping.

- [ ] **Step 5: Final commit (if any verification touched tracked files)**

```bash
git status --porcelain
# only commit if non-empty:
git add -A && git commit -m "chore: verification gates green for fix-failing-test-suites"
```
