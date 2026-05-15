## 1. Remove `endpoint` from the Gitea settings seed

- [x] 1.1 In `gdfkube-src/gdfkube-itsm/src/data/adminSeeds.ts`, drop the `endpoint` line from the `GITEA_SETTINGS` export so the object is `{ _id, owner, token, updatedBy }`.
- [x] 1.2 Regenerate `gdfkube-src/gdfkube-infra/mongodb/seed-data/settings.json` by running `npm run seed:export` from `gdfkube-src/gdfkube-itsm`; confirm the new file has no `endpoint` key.
- [x] 1.3 If the generated file disagrees with the source-of-truth shape, fix `scripts/export-seed-data.mjs` to project only the fields present in `GITEA_SETTINGS` (do not let runtime fields like `updatedAt` slip in).

## 2. Update Express + tests for the missing `endpoint`

- [x] 2.1 Verify `gdfkube-src/gdfkube-itsm/server/src/routes/settings.ts` GET handler returns 404 with `{ error: 'settings not found' }` when the singleton is absent — leave as is (already fail-hard).
- [x] 2.2 In `gdfkube-src/gdfkube-itsm/server/__tests__/settings.test.ts`, update fixtures so seeded test documents no longer include `endpoint`; add a case that asserts GET responds 200 only after a `gitea-token-sync`-style upsert populates `endpoint`.
- [x] 2.3 Do not change the PATCH validator — it still requires `endpoint` in admin-edit payloads.

## 3. Align chart `formId` defaults with Java emitter

- [x] 3.1 In `gdfkube-src/gdfkube-infra/charts/infra/argocd-org/values.yaml`, change `meta.formId: "org-onboard"` to `meta.formId: "org-bootstrap"`.
- [x] 3.2 In `gdfkube-src/gdfkube-infra/charts/infra/rhacm-org/values.yaml`, change `meta.formId: "org-onboard"` to `meta.formId: "org-bootstrap"`.
- [x] 3.3 Confirm no chart template references `meta.formId` (run `rg "meta.formId|.formId" gdfkube-src/gdfkube-infra/charts/`); leave templates untouched if so.

## 4. Add drift guard in `HelmValuesBuilderTest`

- [x] 4.1 In `gdfkube-src/gdfkube-camel/src/test/java/gov/gdf/camel/bean/HelmValuesBuilderTest.java`, add a test `formIdMatchesChartDefaults` that invokes `buildForOrg("alpha", "gdfkube-alpha")`, parses both `charts/infra/argocd-org/values.yaml` and `charts/infra/rhacm-org/values.yaml` via SnakeYAML, and asserts each `meta.formId` equals the emitted value (`"org-bootstrap"`).
- [x] 4.2 Resolve the chart files via a relative path from the test (`Paths.get("../gdfkube-infra/charts/infra/argocd-org/values.yaml")`); skip-fail with a clear message if the files are missing rather than passing silently.
- [x] 4.3 Ensure the new test runs in the existing `mvn test` invocation; do not introduce a new test source set.

## 5. Verify locally

- [x] 5.1 From `gdfkube-src/gdfkube-itsm`, run `npm test -- __tests__/settings.test.ts` and the seed test path; assert no failures.
- [ ] 5.2 From `gdfkube-src/gdfkube-camel`, run `./mvnw -pl . test -Dtest=HelmValuesBuilderTest`; confirm the new `formIdMatchesChartDefaults` passes. (BLOCKED: no JDK in devcontainer)
- [x] 5.3 Run `pre-commit run --all-files`; confirm trufflehog reports no findings on the changed JSON / YAML / TS files.
- [x] 5.4 Bring up the dev stack (`docker compose up -d gitea gitea-bootstrap mongo-seed gitea-token-sync`) and assert `db.gitea_settings.findOne({_id:'gitea'}).endpoint === 'http://gitea:3000'` after `gitea-token-sync` exits.
