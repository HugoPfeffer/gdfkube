## Why

<!--
Explain the motivation for this change. What problem does this solve? Why now?

Hard limits: 50 ≤ character count ≤ 1000 (validated by OpenSpec zod schema)
- Too short: will receive `Why section must be at least 50 characters` error
- Too long: will receive `Why section should not exceed 1000 characters` error

Suggested structure: current pain point → why address it now → expected benefit (1-2 sentences each)
-->

## What Changes

<!--
Describe what will change. Be specific about new capabilities, modifications, or removals.

For behavior changes with a clear before/after contrast, use the From/To format (no inline diff in markdown):

**<Section or Behavior Name>**
- From: <current state / requirement>
- To: <future state / requirement>
- Reason: <why this change is needed>
- Impact: <breaking / non-breaking, who's affected>

Repeat this block for multiple changes; for pure additions or removals, a simple list is fine.
-->

## Capabilities

### New Capabilities
<!--
Capabilities being introduced. Replace <name> with kebab-case identifier.
Naming convention (see openspec/specs/README.md): use compound nouns (at least 2 words),
e.g. `user-auth`, `data-export`, `api-rate-limiting` — avoid single words.
Each creates specs/<name>/spec.md
-->
- `<name>`: <brief description of what this capability covers>

### Modified Capabilities
<!--
Existing capabilities whose REQUIREMENTS are changing (not just implementation).
Only list here if spec-level behavior changes. Each needs a delta spec file.
Use existing spec names from openspec/specs/. Leave empty if no requirement changes.
-->
- `<existing-name>`: <what requirement is changing>

## Impact

<!-- Affected code, APIs, dependencies, systems -->
