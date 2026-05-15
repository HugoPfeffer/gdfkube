## ADDED Requirements

### Requirement: Temp-directory cleanup assertion SHALL be scoped to the test's own exchange

`OrgBootstrapIntegrationTest.outputDir_cleanedUpAfterSuccess` MUST assert
cleanup only for the temporary directory created by the exchange under
evaluation, not by counting `bootstrap-*` entries globally in the shared JVM
`java.io.tmpdir`. The assertion MUST be deterministic regardless of which
sibling tests ran before it in the same `@TestInstance(PER_CLASS)` instance.
The production class `OrgBootstrapRoute` MUST NOT be modified by this change;
its success-path directory cleanup is already correct.

#### Scenario: Cleanup assertion is order-independent

- **GIVEN** other tests in `OrgBootstrapIntegrationTest` have already executed
  in the same JVM and may have left residue in `java.io.tmpdir`
- **WHEN** `outputDir_cleanedUpAfterSuccess` runs and drives one successful
  org-bootstrap exchange
- **THEN** the assertion evaluates only the temp directory created by that
  exchange
- **AND** the test passes irrespective of test execution order

#### Scenario: Full camel suite is deterministically green

- **WHEN** `./mvnw -B test` runs the full `gdfkube-camel` phase twice
  consecutively
- **THEN** both runs report 62 tests with zero failures

#### Scenario: No production change to OrgBootstrapRoute

- **WHEN** the change diff is reviewed
- **THEN** `OrgBootstrapRoute.java` has no modification
- **AND** the only changed camel file is the test
  `OrgBootstrapIntegrationTest.java`
