## Design Summary

Docs `09-argocd.md`, `10-rhacm.md`, `11-hypershift.md` describe a complete, reasoned
provisioning design and embed illustrative YAML for every manifest, but the real Helm chart
templates in `gdfkube-src/gdfkube-infra/charts/` are minimal stubs that have drifted from
that design, and several documented manifests have no file at all. The `fix-spec-doc-drift`
change deliberately left doc bodies untouched, so the gap was never closed; all three docs
are still badged `Planned` despite substantive chart code existing.

This change realizes the documented design as real, value-driven chart templates and
reconciles the three docs to them — scoped to org-bootstrap (`argocd-org`, `rhacm-org`) plus
request-driven (`cluster-request`, `scale-request`) charts. Doc⇄template conflicts are
resolved case-by-case via an explicit decision ledger (the user reviews and may override
each row). Camel `HelmValuesBuilder.java` and the charts' `values.schema.json` are in scope
so the completed templates render correctly end-to-end from a real request/org event.

This design was explored interactively in-session: project context exploration (3 parallel
agents + direct file reads), six clarifying questions, a per-item conflict ledger with
recommendations, and explicit user approval of the written plan.

## Alternatives Considered

### Option A: Docs-only reconciliation (templates are reality)
- **Approach**: Rewrite docs 09/10/11 *down* to match the minimal shipped templates. No
  chart, schema, or Camel changes.
- **Pros**: Smallest blast radius; pure documentation; fast.
- **Cons**: Discards the documented security/design intent (scoped AppProject destinations,
  Casbin RBAC roles, `ExclusiveClusterSetLabel`, Placement, ConfigurationPolicy, full
  HostedCluster spec). Leaves the platform genuinely unable to provision correctly.
- **Why not chosen**: The docs carry reasoned "Decisions Resolved" sections; throwing away
  the design to make stubs "correct" is drift in the wrong direction.

### Option B: One change — docs as design intent, complete templates + Camel end-to-end (CHOSEN)
- **Approach**: Treat the docs' design as the target. Complete/upgrade the chart templates,
  create the missing manifests, extend Camel + `values.schema.json` so charts render
  end-to-end, then reconcile doc bodies and re-badge. Conflicts decided case-by-case.
- **Pros**: Closes the drift in the correct direction; charts become genuinely usable;
  one coherent contract across the tightly-coupled pipeline; docs become accurate.
- **Cons**: Largest scope (Helm + Java + docs across 3 components).
- **Why not chosen**: It *was* chosen.

### Option C: Three separate changes (one per component)
- **Approach**: Independent changes for argocd / rhacm / hypershift.
- **Pros**: Smaller, independently reviewable/archivable.
- **Cons**: The three share values, labels (`HelmValuesBuilder.buildLabels`), and the
  `policyNamespace` concept; splitting forces cross-change coordination and risks partial
  drift between archives.
- **Why not chosen**: User selected one change; the components are one pipeline and the
  shared Camel/label surface is best evolved atomically.

## Agreed Approach

Option B. One OpenSpec change `realize-gitops-provisioning-templates` delivering three spec
capabilities (`argocd-org-stack`, `rhacm-org-stack`, `hypershift-cluster-stack`, matching
the existing `-stack` convention and the per-doc `## Specs` backlink requirement). The
docs' design is the source of truth except where the shipped template choice is objectively
better — every conflict is enumerated in a decision ledger with a recommendation, and the
genuine judgment calls (A7, A9, H1, H4, H8) are flagged for explicit user confirmation.

## Key Decisions

- **Truth direction: case-by-case.** Each doc⇄template conflict has a per-item ruling in the
  ledger (in design.md), defaulting to "doc wins" for completeness/security, "template wins"
  for objectively better shipped choices (e.g. `appset-<org>` naming, `HEAD` revision,
  `-workers` NodePool name).
- **Camel + schema in scope.** `HelmValuesBuilder` gains the 4 missing canonical labels,
  `policyNamespace`, and CIDR pass-through; `values.yaml` + `values.schema.json` updated in
  lockstep (Helm validates values against the schema at render time).
- **One change, three spec capabilities.** Keeps the pipeline contract coherent and the
  per-doc `## Specs` backlinks clean.
- **Badge lifecycle.** During implementation set 09/10/11 to `Partially implemented` (code,
  no archived change yet); the archive step flips them to `Implemented` and regenerates the
  `docs/README.md` status table, per `openspec/specs/gdfkube-architecture-docs/spec.md`.
- **External `kubevirt-secret` is referenced, not created** (SETIC-authored; trufflehog-safe,
  no literal secret material in templates).

## Open Questions

- **Camel push path vs discovery scan path**: doc 09 says `argocd-org` output is pushed to
  `gdfkube-infra/argocd/orgs/{org}/` and the discovery ApplicationSet scans `argocd/orgs/*`.
  The Camel route's git-push target for `org-bootstrap` must be verified during
  implementation; a mismatch adds an extra drift to fix (route or discovery path).
- **`gdfkube-policies` namespace provisioning**: the policy namespace must exist before the
  Binding/Placement/Policy apply. Decide in design whether `rhacm-org` also emits that
  Namespace (with a sync-wave) or it is a documented hub prerequisite.
