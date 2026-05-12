# Retrospective

**Change:** `pipeline-end-to-end`
**Branch:** `feat/pipeline-end-to-end`
**Date:** 2026-05-12
**Scope:** 4 new capabilities + 1 modified, ~17 commits across 12 task groups

---

## What Went Well

### Spec-driven workflow caught design issues early

The OpenSpec proposal → design → spec → tasks pipeline forced explicit decisions on the approval-loop guard, `GitProvider` interface seam, and DLQ header contract before any code was written. The brainstorm phase resolved 3 doc-level contradictions (Express as Kafka producer, stage representation format, single vs multi-replica Camel) that would have surfaced as integration bugs otherwise.

### Multi-stage Docker build eliminated host JDK dependency

Building `gdfkube-camel` via `Dockerfile.jvm` with a SHA-pinned Helm CLI install meant the entire Camel stack builds reproducibly from `docker compose build` — no host JDK, no host Helm, no version drift. This is a good precedent for future services.

### 4-agent adversarial review caught critical issues

The multi-agent review team (sanity check, compliance, code reviewer, challenger) identified 4 critical defects that would have been silent in production:

- **StageEvent status enum mismatch** — Java used `"completed"/"failed"` while the TypeScript contract expected `"ok"/"fail"`. SSE events would have been silently dropped by the validator.
- **Direct endpoint typo** — `status-emit` vs `status-emitter` would have caused a Camel route resolution failure at runtime, silently swallowing pipeline status events.
- **CDC feedback loop** — Without the `_stageWriteback` guard, Camel's MongoDB write-back would re-trigger `request-router` in an infinite loop.
- **DLQ topic naming mismatch** — Error handler targets didn't match the topics created by `kafka-init`, meaning DLQ messages would auto-create uncompacted topics.

### Fix-then-re-review cycle confirmed all fixes

The two-round review structure (identify → fix → re-verify) provided confidence that fixes were correct and complete. Round 2 achieved 34/34 spec compliance and 13/13 sanity checks, with zero regressions from the fix phase.

---

## What Didn't Go Well

### Camel 4 API changes weren't caught during initial code generation

Three Camel 4.x / Quarkus 3.x API changes broke the initial implementation:

- `KafkaManualCommit` relocated from `org.apache.camel.component.kafka` to `org.apache.camel.component.kafka.consumer`
- `Exchange.getProperty(String, Class)` signature changed — the old overload no longer exists
- `camel-quarkus-bom` uses groupId `org.apache.camel.quarkus` (not `io.quarkus.platform`)

These were caught at compile time but required manual fixups. The initial code generation relied on stale API knowledge.

### StageEvent status enum mismatch was a cross-language contract violation

The Java `StageEvent.status` field used `"completed"` and `"failed"` while the TypeScript `StageEvent` type and `validateStageEvent()` expected `"ok"` and `"fail"`. This is a fundamental contract violation between the Camel producer and Express consumer — events would have been silently dropped. The spec defined `"ok" | "fail"` but the Java implementation diverged during code generation.

### DLQ topic naming inconsistency

The `kafka-init` script creates topics with specific names (`dlq.gdfkube.requests`, `dlq.gdfkube.helm-render`, etc.) but the Camel error handler used `dlq.gdfkube.${routeId}` which mapped to Camel's internal route IDs (not always matching the topic names). This was a subtle naming mismatch that only surfaced during review.

### Direct endpoint typo was a single-character bug

`direct:status-emit` vs `direct:status-emitter` — a one-character difference (`r`) that would cause a Camel `NoSuchEndpointException` at runtime. This class of bug is nearly invisible in code review and has no compile-time safety net in Camel's string-based route DSL.

---

## Improvements for Next Time

### Cross-language schema contracts should use a shared schema

The Java ↔ TypeScript `StageEvent` contract violation would have been prevented by a shared schema definition (JSON Schema, Avro, or Protocol Buffers) that generates types for both languages. The manual alignment approach is fragile.

**Action:** For the next cross-language data contract, define a `schemas/` directory with JSON Schema files and use code generation (`jsonschema2pojo` for Java, `json-schema-to-typescript` for TypeScript) to produce the wire types.

### Camel route endpoint names should use constants

String-literal endpoint URIs (`"direct:status-emitter"`) are typo-prone and have no compile-time verification. A constants class (`RouteEndpoints.STATUS_EMITTER = "direct:status-emitter"`) would catch typos at compile time and provide IDE navigation.

**Action:** Introduce a `RouteEndpoints` constants class in the Camel project. Refactor existing routes to reference constants instead of string literals.

### Docker build should be part of the implementation verification loop

The multi-stage Docker build was only run after all routes and tests were written. Several issues (missing Helm binary, incorrect COPY paths, Quarkus packaging format) would have been caught earlier if the Docker build was part of the per-task verification.

**Action:** Add `docker compose build gdfkube-camel` as a verification step after Task 5 (scaffold) and after every route group commit, not just at Task 10.

### CDC feedback loops should be designed with explicit filtering from day one

The `_stageWriteback` guard was designed in the spec (Decision §7) but the initial implementation didn't include the write-back marker field. The fix was straightforward but the gap between design intent and initial implementation was avoidable.

**Action:** For any route that writes back to a Debezium-watched collection, the write-back marker and filter predicate should be the first code written, not an afterthought.

---

## Follow-up Work

Items identified during verification that are out of scope for this change:

| Item | Priority | Suggested Change |
|---|---|---|
| Helm stdout pipe buffer deadlock | HIGH | Switch `HelmRenderRoute` to `--output-dir` + file read instead of stdout capture |
| Output directory cleanup on DLQ path | HIGH | Add `/tmp/<requestId>-*` cleanup in `onException` block |
| `_stageWriteback` guard test | MEDIUM | Add dedicated integration test for the CDC loop guard |
| `dlq.gdfkube.debezium` subscription | MEDIUM | Add explicit topic to `DlqHandlerRoute` consumer pattern |
| `_stageWriteback` field in CDC stream | MEDIUM | Add Debezium SMT to strip the marker field, or switch to a separate tracking collection |
| `RouteEndpoints` constants class | LOW | Refactor string literals to compile-time constants |
| Shared JSON Schema for `StageEvent` | LOW | Add to `schemas/` with codegen for Java + TypeScript |
| `kafka-broker-stack` README cross-reference | LOW | Add "see also: debezium-connect-stack" pointer for Connect-internal topics |
| E2E verification script | HIGH | Automated bash script exercising Task 12 items 12.1–12.8, 12.10–12.17 against a running stack |

---

## Metrics

| Metric | Value |
|---|---|
| Task groups | 12 |
| Commits | ~17 |
| New files | ~50 (Camel project, Helm charts, Debezium scripts, Express modules) |
| Modified files | 4 (`docker-compose.yml`, `package.json`, `index.ts`, `openapi.yaml`) |
| Spec requirements | 34 |
| Round 1 critical/high | 9 (4 CRITICAL + 5 HIGH) |
| Round 2 critical/high | 0 |
| Round 2 remaining | 2 HIGH + 3 MEDIUM (non-blocking) |
| Spec compliance | 34/34 (100%) |
