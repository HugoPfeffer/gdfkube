## 1. RC-1 — Server vitest per-worker DB isolation

- [ ] 1.1 In `gdfkube-src/gdfkube-itsm/server/vitest.setup.ts`, derive the connection DB name from the base `MONGO_URL` plus a `process.env.VITEST_POOL_ID` suffix (fallback to a deterministic constant such as `'0'` when unset), keeping the existing connect / `beforeEach deleteMany` / `afterAll disconnect` lifecycle otherwise unchanged
- [ ] 1.2 In the same file, drop the per-worker database in `afterAll` (before disconnect) so repeated runs do not accumulate stray databases on `mongo1`
- [ ] 1.3 Verify: run `npm test` in `gdfkube-src/gdfkube-itsm/server` twice consecutively with default parallelism — both runs MUST report 0 failures with an identical result
- [ ] 1.4 Verify isolation fallback: run `npx vitest run --no-file-parallelism` once — MUST be 0 failures (excluding RC-2's 2 tests until group 2 lands)

## 2. RC-2 — Group model + tests aligned to numeric-counts contract

- [ ] 2.1 In `gdfkube-src/gdfkube-itsm/server/src/models/Group.ts`, give `users` and `forms` a numeric default of `0` (keep `Schema.Types.Mixed` or narrow to `Number`) so an omitted field is `0`, not `undefined`
- [ ] 2.2 Update `gdfkube-src/gdfkube-itsm/server/__tests__/models.test.ts` `Group model > defaults users and forms to empty arrays` to assert the numeric-counts contract (`users === 0`, `forms === 0`); rename the test if its name still says "empty arrays"
- [ ] 2.3 Update `gdfkube-src/gdfkube-itsm/server/__tests__/groups.test.ts` `POST /api/itsm/groups > creates group as admin` to assert `res.body.users === 0` and `res.body.forms === 0`
- [ ] 2.4 Cross-check no server code reads group `.users`/`.forms` as an array and the SPA `Group` type (`src/types.ts`) plus `src/pages/admin/Users.tsx` / `src/admin/NewGroupPage.tsx` still render correctly with numeric `0`
- [ ] 2.5 Verify: run `npx vitest run __tests__/models.test.ts __tests__/groups.test.ts` — MUST be 0 failures

## 3. RC-3 — Camel org-bootstrap cleanup assertion scoping (test-only)

- [ ] 3.1 In `gdfkube-src/gdfkube-camel/src/test/java/gov/gdf/camel/routes/OrgBootstrapIntegrationTest.java`, change `outputDir_cleanedUpAfterSuccess` to assert cleanup of the temp directory created by the test's own exchange (capture the exchange property / returned `Exchange`, or use a per-test `@TempDir` root) instead of counting `bootstrap-cultura-*` globally in `java.io.tmpdir`
- [ ] 3.2 Confirm the diff touches only the test file — `OrgBootstrapRoute.java` MUST be unchanged
- [ ] 3.3 Verify: run `JAVA_HOME=/home/node/.local/jdk ./mvnw -B test` in `gdfkube-src/gdfkube-camel` twice consecutively — both runs MUST report 62 tests, 0 failures

## 4. Full-suite verification

- [ ] 4.1 Run the full server suite (`npm test`) twice — 0 failures both runs (RC-1 + RC-2 combined)
- [ ] 4.2 Run the full camel suite twice — 62/62 both runs (RC-3)
- [ ] 4.3 Run the web suite (`npm test` in `gdfkube-src/gdfkube-itsm`) once — confirm still 394/394 (no regression)
- [ ] 4.4 Run `pre-commit run --all-files` before pushing per project Git policy
