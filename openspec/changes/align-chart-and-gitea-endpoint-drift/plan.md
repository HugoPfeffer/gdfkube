# Align chart + Gitea endpoint drift — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Remove the dead `endpoint` field from the Gitea seed and align `meta.formId` defaults in `argocd-org`/`rhacm-org` chart values with `HelmValuesBuilder.buildForOrg`, with a JUnit drift guard.

**Architecture:** Two micro-edits to source files (seed + chart defaults), one Express test fixture update (no runtime change — handler already fails hard), and one JUnit assertion. No new modules, no schema migrations.

**Tech Stack:** TypeScript (Express + Vitest seed test), JSON (mongo seed), YAML (Helm charts), Java + JUnit 5 + SnakeYAML (Camel test).

---

## Task 1: Drop `endpoint` from seed source-of-truth

- [ ] **Step 1:** Open `gdfkube-src/gdfkube-itsm/src/data/adminSeeds.ts`. Locate the `GITEA_SETTINGS` export (around line 304). Delete the `endpoint: 'https://gitea-gitea.apps.gdfkube.gov',` line so the object becomes `{ _id, owner, token, updatedBy }`.
- [ ] **Step 2:** `cd gdfkube-src/gdfkube-itsm && npm run seed:export`. Confirm exit 0.
- [ ] **Step 3:** Read `gdfkube-src/gdfkube-infra/mongodb/seed-data/settings.json`. Confirm the JSON now reads exactly:
  ```json
  {
    "_id": "gitea",
    "owner": "gdfkube",
    "token": "CHANGE_ME",
    "updatedBy": "seed"
  }
  ```
  with a trailing newline. No `endpoint`.
- [ ] **Step 4 (only if Step 3 shows drift):** Edit `gdfkube-src/gdfkube-itsm/scripts/export-seed-data.mjs` to project a stable shape (e.g., explicit `{ _id, owner, token, updatedBy } = GITEA_SETTINGS`) so the file matches the source-of-truth exactly.
- [ ] **Commit:** `chore(seed): drop dead gitea_settings.endpoint — gitea-token-sync is sole writer`.

## Task 2: Settings route test fixture refresh

- [ ] **Step 1:** Open `gdfkube-src/gdfkube-itsm/server/__tests__/settings.test.ts`. Locate the test seed fixture(s) that insert a `gitea_settings` document including `endpoint`. Remove `endpoint` from those fixtures.
- [ ] **Step 2:** Find any test that asserts the GET response body includes `endpoint`. Update each so the assertion only holds after a follow-up upsert (mimicking gitea-token-sync). If the test was sanity-checking the seeded shape, change it to assert the seeded shape no longer carries `endpoint`.
- [ ] **Step 3:** Add a new test `responds 404 when document is missing` that calls GET against a freshly cleared collection and asserts `status === 404` and body `{ error: 'settings not found' }`. (May already exist — only add if absent.)
- [ ] **Step 4:** Run `npx vitest run __tests__/settings.test.ts`. Confirm green.
- [ ] **Commit:** `test(settings): remove endpoint from seed fixtures; assert 404 when missing`.

## Task 3: Chart `formId` defaults

- [ ] **Step 1:** Edit `gdfkube-src/gdfkube-infra/charts/infra/argocd-org/values.yaml` line 3 — change `formId: "org-onboard"` to `formId: "org-bootstrap"`.
- [ ] **Step 2:** Edit `gdfkube-src/gdfkube-infra/charts/infra/rhacm-org/values.yaml` line 3 — same change.
- [ ] **Step 3:** Run `rg "meta\\.formId|^\\s*formId" gdfkube-src/gdfkube-infra/charts/` and visually confirm no template branches on `formId`. If a branch exists, stop and re-evaluate; this plan assumes none.
- [ ] **Step 4:** Run `helm lint gdfkube-src/gdfkube-infra/charts/infra/argocd-org` and `helm lint gdfkube-src/gdfkube-infra/charts/infra/rhacm-org`. Confirm exit 0.
- [ ] **Commit:** `chore(charts): align argocd-org/rhacm-org formId default with HelmValuesBuilder`.

## Task 4: JUnit drift guard

- [ ] **Step 1:** Open `gdfkube-src/gdfkube-camel/src/test/java/gov/gdf/camel/bean/HelmValuesBuilderTest.java`. Confirm the file already imports SnakeYAML (`org.yaml.snakeyaml.Yaml`); if not, add the import (SnakeYAML is already on the runtime classpath via the bean).
- [ ] **Step 2:** Write a failing test:
  ```java
  @Test
  void formIdMatchesChartDefaults() throws Exception {
      String emitted = readEmittedFormId(buildForOrg("alpha", "gdfkube-alpha"));
      String argocd = readChartFormId("../gdfkube-infra/charts/infra/argocd-org/values.yaml");
      String rhacm = readChartFormId("../gdfkube-infra/charts/infra/rhacm-org/values.yaml");
      assertEquals("org-bootstrap", emitted);
      assertEquals(emitted, argocd, "argocd-org/values.yaml formId default drifted from HelmValuesBuilder");
      assertEquals(emitted, rhacm, "rhacm-org/values.yaml formId default drifted from HelmValuesBuilder");
  }
  ```
  with two small helpers `readEmittedFormId(Path valuesYaml)` and `readChartFormId(String relativePath)` using SnakeYAML to parse and navigate to `meta.formId`. Helpers should throw `AssertionError` with a descriptive message if the file is missing — never silently pass.
- [ ] **Step 3:** Run `./mvnw -pl . test -Dtest=HelmValuesBuilderTest#formIdMatchesChartDefaults`. Confirm the test passes (it should — the chart defaults were updated in Task 3).
- [ ] **Step 4:** Run full Camel test suite `./mvnw test`. Confirm green; no regressions.
- [ ] **Commit:** `test(camel): assert HelmValuesBuilder.formId matches chart defaults`.

## Task 5: Verify

- [ ] **Step 1:** `pre-commit run --all-files`. Expect trufflehog to be green (no live tokens were touched). Fix any unrelated lint issues that fail.
- [ ] **Step 2:** Bring up the stack: `docker compose up -d gitea gitea-bootstrap mongo-seed gitea-token-sync` (or the equivalent for this project). Wait for `gitea-token-sync` to exit 0.
- [ ] **Step 3:** Run `docker compose exec mongo1 mongosh --quiet gdfkube --eval 'JSON.stringify(db.gitea_settings.findOne({_id:"gitea"}))'`. Confirm the document has `endpoint: "http://gitea:3000"`, a non-`CHANGE_ME` token, and `updatedBy: "gitea-init"`.
- [ ] **Step 4:** Hit the admin settings endpoint via curl with a demo-admin header: `curl -fsS -H "X-Demo-User: <admin>" http://localhost:8081/api/itsm/settings/gitea`. Confirm 200 + `endpoint: "http://gitea:3000"`.
- [ ] **Step 5:** Tear down (`docker compose down -v`), bring up again, and re-run Step 3 to confirm idempotence.
