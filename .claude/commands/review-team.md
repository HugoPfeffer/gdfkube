Launch a review team of 4 specialized agents to review the current work from independent perspectives.

## Step 1 — Gather context

Run these commands and capture their output:

```bash
git diff --stat HEAD~1
git log --oneline -5
git diff HEAD~1
```

Store the diff output as `{DIFF}`, the changed file list as `{FILE_LIST}`, and recent commits as `{COMMITS}`.

If the work relates to an active OpenSpec change, also read its `proposal.md`, `design.md`, `tasks.md`, and `specs/*/spec.md`. Store as `{SPEC_CONTEXT}`.

## Step 2 — Dispatch 3 agents in parallel

Use the Task tool to launch all three in a **single message** with `run_in_background: true`.

### Agent 1 — Code Reviewer

Use `subagent_type: "code-reviewer"`. Prompt:

```
You are a senior code reviewer. Review these changes for:

- Code quality: readability, naming, structure, duplication
- Architecture: separation of concerns, abstractions, dependency direction
- Error handling: missing catches, swallowed errors, incomplete validation
- Performance: inefficiencies, unnecessary allocations, N+1 patterns
- Maintainability: complexity, coupling, testability

Diff:
{DIFF}

Changed files:
{FILE_LIST}

Spec context (if any):
{SPEC_CONTEXT}

Output your findings as:

## Code Review Findings
### Critical (must fix)
### Important (should fix)
### Minor (nice to fix)
### Strengths
### Verdict: APPROVE / REQUEST_CHANGES / NEEDS_DISCUSSION
```

### Agent 2 — Compliance Agent

Use `subagent_type: "generalPurpose"`. Prompt:

```
You are a compliance and security auditor. Review these changes for:

- Security: injection risks, auth gaps, secret exposure, input sanitization
- Policy: adherence to project coding standards (read CLAUDE.md for context)
- Drift: if spec context is provided, verify implementation matches spec intent
- Secrets: flag hardcoded credentials, tokens, API keys, connection strings
- Dependencies: new deps must be justified and version-pinned
- Licensing: no copyleft contamination in permissive-licensed code

Diff:
{DIFF}

Changed files:
{FILE_LIST}

Spec context (if any):
{SPEC_CONTEXT}

Output your findings as:

## Compliance Findings
### Security Issues
### Policy Violations
### Spec Drift
### Dependency Concerns
### Clean Items (what passed)
### Verdict: COMPLIANT / NON_COMPLIANT / NEEDS_REVIEW
```

### Agent 3 — Implementation Reviewer

Use `subagent_type: "generalPurpose"`. Prompt:

```
You are an implementation reviewer focused on correctness and completeness. Review these changes for:

- Correctness: does the code do what it claims? Edge cases handled?
- Completeness: all requirements addressed? Missing pieces?
- Integration: will this break existing functionality? API contract changes?
- Testing: are changes tested? Are tests meaningful or just padding?
- Documentation: do public APIs have clear contracts? Config changes documented?

Diff:
{DIFF}

Changed files:
{FILE_LIST}

Spec context (if any):
{SPEC_CONTEXT}

Output your findings as:

## Implementation Review
### Correctness Issues
### Completeness Gaps
### Integration Risks
### Test Coverage Assessment
### Verdict: CORRECT / HAS_ISSUES / INCOMPLETE
```

## Step 3 — Dispatch the Challenger

After all 3 agents complete, dispatch a fourth agent with `subagent_type: "generalPurpose"` and `run_in_background: true`. Pass all three outputs to it.

Prompt:

```
You are the challenger agent. Your job is adversarial: find what the reviewers missed, challenge their assumptions, and stress-test their conclusions.

You received findings from three independent reviewers. Your tasks:

1. CHALLENGE each reviewer:
   - Did they assume without evidence?
   - Did they flag minor issues but miss critical ones?
   - Did they approve something they shouldn't have?
   - Did they miss cross-cutting concerns between domains?

2. FIND blind spots:
   - What did ALL THREE miss?
   - Systemic issues none caught?
   - Interaction effects isolated reviews can't see?

3. DEBATE verdicts:
   - If reviewers disagree, who is right and why?
   - If all approved, is that confidence justified or groupthink?
   - What would a post-mortem blame?

4. STRESS TEST:
   - What happens under load? Concurrent access? Partial failure?
   - What if dependencies are unavailable? Data is malformed?
   - Worst realistic failure mode?

== Code Reviewer Findings ==
{AGENT_1_OUTPUT}

== Compliance Findings ==
{AGENT_2_OUTPUT}

== Implementation Review ==
{AGENT_3_OUTPUT}

== Diff ==
{DIFF}

Output your findings as:

## Challenger Report
### Challenges to Code Reviewer
### Challenges to Compliance Agent
### Challenges to Implementation Reviewer
### Blind Spots Found
### Cross-Cutting Concerns
### Stress Test Results
### Final Verdict: AGREE_WITH_REVIEWERS / REVIEWERS_MISSED_ISSUES / BLOCK_MERGE
```

## Step 4 — Synthesize

After the Challenger completes, present a unified report:

```
## Review Team Report

### Team Verdicts
- Code Reviewer: {verdict}
- Compliance Agent: {verdict}
- Implementation Reviewer: {verdict}
- Challenger: {verdict}

### Consensus Issues (flagged by 2+ agents)
{merged, deduplicated, sorted by severity}

### Contested Points (challenger disagreed)
{points where challenger challenged a finding}

### Action Items
1. [CRITICAL] ...
2. [IMPORTANT] ...
3. [MINOR] ...

### Final Recommendation: MERGE / FIX_THEN_MERGE / DO_NOT_MERGE
```

## Scope control

- If the user specifies files or a commit range, use that instead of HEAD~1.
- If no changes exist, ask the user what to review.
- Each agent stays in its lane — code reviewer skips security, compliance skips architecture.
