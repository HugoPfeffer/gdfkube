<!--
Delta spec template for a change.

This template demonstrates 4 delta section types; use as needed:
- ADDED / MODIFIED / REMOVED / RENAMED
File name and location: openspec/changes/<change-name>/specs/<capability>/spec.md
(`<capability>` aligns with the openspec/specs/<capability>/ directory name)

Strict format rules (validated by OpenSpec):
- Requirement text MUST contain `SHALL` or `MUST`
- Every Requirement MUST have at least one `#### Scenario:`
- Scenario MUST use level-4 (`####`); level-3 or bullets will silently fail
-->

## ADDED Requirements

<!-- New behavior. List new Requirements this change adds to the capability. -->

### Requirement: <!-- requirement name -->
<!-- requirement text — must contain SHALL or MUST -->

#### Scenario: <!-- scenario name -->
- **WHEN** <!-- condition -->
- **THEN** <!-- expected outcome -->

---

## MODIFIED Requirements

<!--
Modify an existing Requirement. **MUST use the exact same normalized header**
as in openspec/specs/<capability>/spec.md (trimmed, case-sensitive match),
otherwise the delta apply during archive will fail because it cannot find
the corresponding requirement.

**MUST include the full updated content** (not just a diff), because OpenSpec
archive applies MODIFIED sections via full-text replacement.
-->

### Requirement: <!-- same header as in the existing spec -->
<!-- full updated requirement text — must contain SHALL or MUST -->

#### Scenario: <!-- scenario name (can be added or modified) -->
- **WHEN** <!-- condition -->
- **THEN** <!-- expected outcome -->

---

## REMOVED Requirements

<!--
Remove an existing Requirement. MUST include Reason and Migration so that
reviewers understand why it's being deprecated and how existing dependents
should adapt.
-->

### Requirement: <!-- header to remove, must match existing spec exactly -->

**Reason**: <!-- why it's being removed -->

**Migration**: <!-- how existing callers/dependents should adapt -->

---

## RENAMED Requirements

<!--
Rename a Requirement header. Format is fixed: FROM / TO using code-fence headers.
If both name and content change, list the name change here under RENAMED **and**
write the full updated content under MODIFIED using the **new** header.

Archive apply order: RENAMED → REMOVED → MODIFIED → ADDED
-->

- FROM: `### Requirement: <Old Name>`
- TO: `### Requirement: <New Name>`
