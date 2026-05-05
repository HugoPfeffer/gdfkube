## Auditor 3 — Detail / Approvals / NewRequest / Forms

### Summary
Implementation diverges substantially from the design handoff on the RequestDetail page (header reduced; pipeline header/progress/live pill missing; sidebar of 3 cards instead of detail-grid w/ Request Details, Approvals, optional Cluster Access). Approvals follows the design closely but is missing the queue header stats/pending count/waiting/policy-fail badges and decided-this-session pill chip; the DecisionPanel adds a separate "Justification" card and replaces the ref's Approval-chain copy with abstract step labels. NewRequest uses a single-page generic runner with live payload preview (matches), but drops the "What happens next" card, the Kafka-topic footer, and uses different validation copy. Forms runtime supports the same field types and pipe/semicolon grammar; minor drift in error messages and prefix lower-casing behavior.

### P0 — Critical
- **RequestDetail header gutted** — ref `request-detail.jsx:36-55` shows pill+row-id, "Cluster {cluster} · {orgName}" title, "Submitted by …" sub, plus Back/Open-in-Gitea/Approve/kubeconfig action row; impl `RequestDetail.tsx:94-98` shows only `request.id` mono title and form-label sub.
- **Pipeline header context missing** — ref `request-detail.jsx:57-70` renders "Provisioning Pipeline" title, Live/Completed/Failed pill, and overall % progress bar; impl mounts `<Pipeline>` raw at `RequestDetail.tsx:100`.
- **Cluster Access always present, content drift** — ref `request-detail.jsx:137-151` only renders the Cluster Access card when `status === "ready"`, with API/Console/Version dl rows; impl `RequestDetail.tsx:146-163` always renders the card with explanation paragraph and disabled button.

### P1 — High
- **Approval-chain semantics inverted** — ref `approvals.jsx:336-358` ties chain to lifecycle ("Department lead / Platform admin (you) / Provisioning pipeline" with the CDC subtitle); impl `DecisionPanel.tsx:25,233-256` uses abstract triplet `['Operator submitted','Group lead','SETIC']`. Misses "Provisioning pipeline" final node.
- **Queue header KPIs absent** — ref `approvals.jsx:83-96` puts in-queue/approved-today/rejected-today stat tiles in the page-head; impl `Approvals.tsx:175-180` shows only title+sub.
- **Queue row meta drift** — ref `approvals.jsx:142-159` shows row-id chip, cluster name as title, env color-coded, requester name + waiting + failed-checks pill; impl `Approvals.tsx:227-239` uses `r.id` as title and only formLabel·group·env meta + plain "Waiting X" text. Missing failing-checks badge, requester name, and color-coded env.
- **Decision panel header drift** — ref `approvals.jsx:205-223` shows row-id, StatusPill, formLabel pill, "waiting" mono right-aligned, then big `Cluster <name>` title and submitted-by line; impl `DecisionPanel.tsx:51-69` shows `request.id` mono + comma list + submittedAt.
- **Decision panel adds card not in ref** — impl `DecisionPanel.tsx:73-98` introduces a dedicated "Justification" card + `:100-125` a "Payload" pre block; ref `approvals.jsx:228-261` puts justification inline inside the "Request payload" card under a divider.
- **Reject-without-comment guard missing** — ref `approvals.jsx:316-318` disables Reject when `!comment.trim()` ("required for reject"); impl `DecisionPanel.tsx:201-207` has no disabled state and `Approvals.tsx:141-167` never enforces a comment.
- **Override-modal copy/CTA drift** — ref `approvals.jsx:372-394` titles modal "Approve despite warnings?", primary "Approve with override"; impl `OverrideModal.tsx:60-89` titles "Override failing policy checks?" with "Confirm override".
- **NewRequest "What happens next" card removed** — ref `new-request.jsx:262-292` 6-step (cluster) / 5-step (other) sidebar narrative; impl `GenericRequest.tsx:274-288` only shows a "Live payload" pre.
- **Kafka topic footer + Routed-via row removed** — ref `new-request.jsx:235-238` shows shield icon + "Routed via Kafka topic dbz.gdfkube.requests"; impl `GenericRequest.tsx:254-272` shows only Cancel/Submit buttons.

### P2 — Medium
- **Approve does not branch on policy warnings without confirm pause** — ref vs impl: ref hardcodes actor `"Maria Costa"` (`approvals.jsx:59`), impl uses real user (better, just calling out test alignment).
- **Reject status target differs** — ref `approvals.jsx:53-73` only records decision locally; impl `Approvals.tsx:141-167` dispatches `UPDATE_REQUEST_STATUS` with `status:"failed"`. Diverges from "session-only decisions" sentence in ref.
- **Approve target stage drift** — ref does NOT mutate stage/status server-side; impl `Approvals.tsx:105-111` sets `status:"provisioning", stage:1`. Skips the pipeline-driven lag the design implied.
- **Decision-this-session label drift** — ref shows green/red Approved/Rejected pill on each decided row; impl `Approvals.tsx:256-271` shows plain text after a dot-sep.
- **Empty state copy** — ref `approvals.jsx:188-198` "All caught up." with 40px check icon; impl `Approvals.tsx:286-296` 13px muted "Select a request from the queue…".
- **Form fields lack inline error display** — ref `new-request.jsx:189-193` shows red error text when validation fails; impl `GenericRequest.tsx:213-231` only computes `isValid` to gate Submit, never renders `validateField` output.
- **Default field values seed missing** — ref `new-request.jsx:39-47, 53-57` seeds defaults; impl `GenericRequest.tsx:75` initialises empty `useState<FormValues>({})`. Required fields therefore start invalid (Submit disabled until every field touched).
- **Prefix lower-casing dropped** — ref `new-request.jsx:173` lower-cases text input value when validation regex includes `[a-z]`; impl `PrefixedInput.tsx:28` and `validate.ts:18-31` never lowercase.
- **Pipeline-stage CSS class drift** — impl `Pipeline.tsx:62` outputs both `stage-${state}` and `pipe-stage ${state}`; ref CSS only defines `.pipe-stage.done/.active/.failed`. Tests at `RequestDetail.test.tsx:87-105` lock in the impl-only `stage-*` names.
- **OverrideModal blocks modal click-through** — impl `OverrideModal.tsx:46-54` has no backdrop `onClick` to close; ref `approvals.jsx:370-394` closes on backdrop click.

### P3 — Low
- **Submit button label** — ref renders "Submit request" + chevron with "Submitting…" state; impl `GenericRequest.tsx:264-271` plain "Submit" no submitting state.
- **PayloadPreview shape** — ref injects `formId` and `requestId: "01HQ…<ulid>"`; impl `PayloadPreview.tsx:9-15` is unstyled `<pre>` with only `{ meta, vars }`.
- **Number input value coercion** — impl `GenericRequest.tsx:178` coerces empty input to `undefined`; ref `new-request.jsx:165` keeps blank string.
- **Validate error wording** — impl returns `Required`, `Invalid format`, `Must be ≥/≤ {n}`; ref returns `Required.`, `Must match {regex}.`, `Min {n}.`, `Max {n}.`. Trailing-period and pattern-echo lost.
- **Token interpolation regex differs** — ref uses `\w+` and replaces missing keys with `<key>` literal; impl `interpolateTokens.ts:12` uses `[^{}]+` and keeps literal `{key}`.
- **RadioCards keyboard / role** — impl `RadioCards.tsx:29-44` uses `<button role="radio">` with Enter/Space; ref `new-request.jsx:132-145` uses bare `<div onClick>`. Impl is better but diverges.

### Out-of-scope observations
- `RequestDetail.test.tsx:87-105` and `Pipeline.tsx:62` rely on `stage-done|active|pending|failed` selectors that the shared `styles.css` does not define — visual styling supplied only by the legacy `.pipe-stage.done/.active/.failed`.
- `GenericRequest.tsx:115-132` hard-codes `'saude'` group fallback.
- `GenericRequest.tsx:97` defaults `env` to `'production'`; ref defaults to `'development'`. Could create accidental production requests.
- `Approvals.test.tsx:286-303` explicitly forbids `Est.\s*cost` rendering — confirms intentional drift on cost display.
- Operator role-gating: ref `approvals.jsx:37-51` shows a "Restricted to platform administrators" page for non-admin; impl does not gate (relies on App-level routing).
