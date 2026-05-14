## ADDED Requirements

### Requirement: Component doc carries an evidence-derived Implementation Status badge

Each component document under `docs/` (filenames matching `docs/[0-9][0-9]-*.md`) MUST carry an `Implementation Status:` line in its header block, drawn from a fixed vocabulary: `Implemented`, `Partially implemented`, `Planned`, `Deferred`, or `Reference`. The badge value MUST be derivable from two pieces of evidence checked at authoring time:

1. Whether the component's owning subtree under `gdfkube-src/` exists and contains substantive code or configuration (not a stub).
2. Whether at least one change in `openspec/changes/archive/` shipped behaviour for the component.

The mapping rule is:

- Both hold → `Implemented`.
- Exactly one holds → `Partially implemented`.
- Neither holds and the component is in scope for the platform → `Planned`.
- Neither holds and the component is explicitly out of scope for the current iteration → `Deferred`.
- The doc is not a single-component reference (e.g., the architecture overview) → `Reference`.

No badge value outside this vocabulary SHALL appear.

#### Scenario: Implemented badge requires both code and an archived change

- **GIVEN** a component doc `docs/05-kafka.md` describing the Kafka broker stack
- **AND** `gdfkube-src/gdfkube-infra/kafka/init-topics.sh` exists with non-stub content
- **AND** `openspec/changes/archive/2026-05-11-kafka-broker-stack/` exists
- **WHEN** the doc's `Implementation Status:` line is read
- **THEN** the value is `Implemented`

#### Scenario: Partially implemented when only one piece of evidence holds

- **GIVEN** a component doc `docs/04-debezium.md`
- **AND** `gdfkube-src/gdfkube-infra/debezium/connector-config.json` exists
- **AND** no archived change has shipped end-to-end Debezium behaviour
- **WHEN** the doc's `Implementation Status:` line is read
- **THEN** the value is `Partially implemented`

#### Scenario: Planned when neither piece of evidence holds and component is in scope

- **GIVEN** a component doc `docs/10-rhacm.md`
- **AND** no `gdfkube-src/gdfkube-infra/rhacm/` subtree exists
- **AND** no archived change has shipped RHACM behaviour
- **WHEN** the doc's `Implementation Status:` line is read
- **THEN** the value is `Planned`

#### Scenario: No badge value outside the fixed vocabulary

- **GIVEN** any component doc under `docs/`
- **WHEN** its `Implementation Status:` line is parsed
- **THEN** the value is one of `Implemented`, `Partially implemented`, `Planned`, `Deferred`, `Reference`
- **AND** any other value (e.g., `In progress`, `Stub`, `WIP`) is treated as a violation

---

### Requirement: Component doc lists owning specs under a Specs section

Each component document under `docs/` MUST contain a level-2 section titled `## Specs` listing every spec under `openspec/specs/` whose contracts pertain to the component the doc describes. Each list entry MUST be a markdown link whose target is the relative path to that spec's `spec.md` file, and whose label is the spec slug rendered in backticks. List entries MUST be alphabetised by slug.

A component doc with no owning specs MUST still contain the `## Specs` section, with body text exactly:

```
_No specs yet — this component is not contracted._
```

This makes the absence of contracts an explicit, navigable signal rather than an omission.

#### Scenario: Doc with one owning spec links to it by relative path

- **GIVEN** the doc `docs/02-express-api.md`
- **AND** the spec `openspec/specs/itsm-express-api/spec.md` exists
- **WHEN** the doc's `## Specs` section is read
- **THEN** it contains the entry `` - [`itsm-express-api`](../openspec/specs/itsm-express-api/spec.md) ``

#### Scenario: Doc with multiple owning specs lists them alphabetically

- **GIVEN** the doc `docs/03-mongodb.md` covers MongoDB and the collections it stores
- **WHEN** the doc's `## Specs` section is read
- **THEN** the entries appear in alphabetical order by slug
- **AND** each entry's link target resolves to an existing `openspec/specs/<slug>/spec.md` file

#### Scenario: Doc without owning specs still carries the section

- **GIVEN** the doc `docs/10-rhacm.md` describes a component for which no spec exists
- **WHEN** the doc is read
- **THEN** it contains a `## Specs` section
- **AND** the section body is exactly `_No specs yet — this component is not contracted._`

#### Scenario: Every linked spec slug resolves to an existing file

- **WHEN** the verification check `for s in $(grep -oE 'openspec/specs/[a-z0-9-]+/spec\.md' docs/*.md); do test -f "$s" || echo "MISSING: $s"; done` is run from the repository root
- **THEN** the command produces no output

---

### Requirement: Component doc carries a Last validated date that reflects the most recent re-check

Each component document under `docs/` whose Implementation Status is one of `Implemented`, `Partially implemented`, `Planned`, or `Reference` MUST carry a `Last validated:` line in its header block holding an ISO-8601 date (`YYYY-MM-DD`). The date MUST be set to the date on which the doc's badge and `## Specs` section were last verified against `gdfkube-src/` and `openspec/specs/`. Docs whose status is `Deferred` MAY omit the line, since they have never been validated against code.

#### Scenario: Re-checked doc has its Last validated date advanced

- **GIVEN** the doc `docs/05-kafka.md` was last validated on 2026-05-05
- **WHEN** an author re-checks the badge and `## Specs` section against current `gdfkube-src/` and `openspec/specs/` on 2026-05-14
- **THEN** the doc's `Last validated:` line reads `2026-05-14`

#### Scenario: Deferred doc may omit the date

- **GIVEN** the doc `docs/13-observability.md` carries `Implementation Status: Deferred`
- **WHEN** the doc's header is read
- **THEN** either the `Last validated:` line is absent, or it carries an empty value
- **AND** an empty or absent value is not a violation

---

### Requirement: docs/README.md status table matches per-doc badges

The status table in `docs/README.md` MUST list every component doc under `docs/[0-9][0-9]-*.md` and MUST report each doc's `Implementation Status:` value verbatim in the `Status` column. The vocabulary in the table MUST match the vocabulary used in component doc headers.

#### Scenario: Index table value matches doc header value

- **GIVEN** `docs/02-express-api.md` carries `Implementation Status: Implemented`
- **WHEN** the row for `02-express-api` in `docs/README.md`'s status table is read
- **THEN** the `Status` column shows `Implemented`

#### Scenario: New status value documented in Conventions

- **GIVEN** the docs introduce a status value not previously listed in `docs/README.md`'s "Conventions" section (e.g., `Partially implemented`)
- **WHEN** `docs/README.md` is read
- **THEN** the "Conventions" section contains a bullet defining that value
