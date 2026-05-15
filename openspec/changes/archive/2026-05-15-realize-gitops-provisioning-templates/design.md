## Context

The gdfkube provisioning path is Git → ArgoCD → (HyperShift + RHACM). Camel renders Helm
charts from request/org events and pushes the output to per-org Gitea repos; ArgoCD applies
them. Docs 09/10/11 describe this design in full with embedded illustrative YAML and
"Decisions Resolved" sections. The actual chart templates
(`gdfkube-src/gdfkube-infra/charts/infra/{argocd-org,rhacm-org}`,
`charts/{cluster-request,scale-request}`) are minimal stubs: they render a fraction of the
documented spec, omit mandatory API fields, and several documented manifests (discovery
ApplicationSet, Placement, ConfigurationPolicy) have no file. `HelmValuesBuilder` emits only
6 of the 10 canonical labels. The `fix-spec-doc-drift` change (archived) intentionally
touched only badges/`## Specs`/dates, never doc bodies, so this gap persisted; 09/10/11 are
still `Planned`.

Constraint: `openspec/specs/gdfkube-architecture-docs/spec.md` governs doc badges, the
`## Specs` backlink section, `Last validated`, and the `docs/README.md` status table — this
change must conform to it, not alter it. Project values: simplicity, change existing
functions over adding new ones, driftless codebase.

## Goals / Non-Goals

**Goals:**
- Every manifest documented in 09/10/11 exists as a real, value-driven chart template that
  matches its (post-ledger) doc body.
- Camel + `values.schema.json` + `values.yaml` feed every value the completed templates need
  so charts render end-to-end from a real request/org event.
- Docs 09/10/11 reconciled, re-badged, and backlinked to the three new spec capabilities;
  `docs/README.md` regenerated.
- Each doc⇄template conflict has an explicit, reviewable ruling.

**Non-Goals:**
- Creating the external `open-cluster-management/kubevirt-secret` (SETIC-authored; referenced
  only).
- Form-driven KubeVirt VM sizing (doc 11 Open Question — compute/rootVolume stay as
  `values.yaml` defaults).
- Unifying `scale-request` `vars.replicas` vs `cluster-request` `vars.nodeCount` (noted only).
- Live cluster provisioning / running ArgoCD or RHACM controllers (out of scope; verified by
  `helm template` rendering, not a live apply).
- Adding a drift-detection CI rule to `openspec/config.yaml` (separate follow-up flagged by
  the `fix-spec-doc-drift` retrospective).

## Decisions

### D1 — Source-of-truth direction: case-by-case ledger

"Doc wins" = upgrade the template to the documented design. "Template wins" = the shipped
choice is objectively better; update the doc. **Bold rows are genuine judgment calls
requiring explicit user confirmation before/at implementation.**

**09 ArgoCD — `charts/infra/argocd-org/`**

| # | Conflict | Doc | Template | Ruling |
|---|----------|-----|----------|--------|
| A1 | Discovery ApplicationSet | `argocd/discovery/org-repos-discovery.yaml`, scans `argocd/orgs/*` | no file | Create file |
| A2 | AppProject namespace | `openshift-gitops` | `argocd` | Doc wins |
| A3 | AppProject `destinations` | scoped `hc-{org}-*`,`ns-{org}-*` | wildcard | Doc wins (security) |
| A4 | AppProject `clusterResourceWhitelist` | 4 kinds | wildcard | Doc wins (security) |
| A5 | AppProject `namespaceResourceBlacklist` | ResourceQuota,LimitRange | absent | Doc wins |
| A6 | AppProject `roles` (Casbin) | present | absent | Doc wins |
| **A7** | ApplicationSet name | `saude` | `appset-{org}` | **Template wins** (disambiguates AppProject); update doc |
| A8 | ApplicationSet namespace | `openshift-gitops` | `argocd` | Doc wins (=A2) |
| **A9** | git `revision`/`targetRevision` | `main` | `HEAD` | **Template wins** (`HEAD` survives renames); update doc + discovery |
| A10 | Per-org ApplicationSet name | `saude-{path}` | `{org}-{path}` | Equivalent — no change |

**10 RHACM — `charts/infra/rhacm-org/` + `charts/cluster-request/`**

| # | Conflict | Doc | Template | Ruling |
|---|----------|-----|----------|--------|
| R1 | ManagedClusterSet `clusterSelector.selectorType` | `ExclusiveClusterSetLabel` | absent | Doc wins (mandatory) |
| **R2** | MCSetBinding namespace | `gdfkube-policies` | org ns | **Doc wins** — add `system.naming.policyNamespace` (default `gdfkube-policies`) |
| R3 | ManagedCluster labels | 10 canonical | 6 | Doc wins — add 4 labels |
| R4 | Placement `{org}-prod-clusters` | present | no file | Create |
| R5 | ConfigurationPolicy + Policy/PlacementBinding | present | no file | Create |

**11 HyperShift — `charts/cluster-request/` + `charts/scale-request/`**

| # | Conflict | Doc | Template | Ruling |
|---|----------|-----|----------|--------|
| **H1** | HostedCluster/NodePool namespace | per-cluster | `clusters` | **Doc wins** — `{{ system.naming.namespace }}`; aligns A3 + secret target |
| H2 | HostedCluster labels | 4 ad-hoc | 6 standard | Template wins; doc references Label Schema |
| H3 | HostedCluster `sshKey` | present | absent | Doc wins |
| **H4** | KubeVirt domain | `baseDomainPassthrough:true`+`dns.baseDomain` | explicit `kubevirt.baseDomain` | **Template wins for kubevirt** (value-driven); add `dns.baseDomain`; update doc |
| H5 | HostedCluster `dns.baseDomain` | present | absent | Doc wins (value-driven) |
| H6 | HostedCluster `networking` + CIDR override | present | absent | Doc wins — defaults + `vars` override (schema+Camel) |
| H7 | HostedCluster `services` (5) | 5 | APIServer only | Doc wins |
| **H8** | NodePool name | `-default` | `-workers` | **Template wins** — scale-patch targets `-workers`; update doc |
| H9 | NodePool `release.image` | present | absent | Doc wins |
| H10 | NodePool `management.autoRepair` | absent | `true` | Template wins; document it |
| H11 | NodePool `kubevirt.compute`+`rootVolume` | 16Gi/4,64Gi ceph-rbd | absent | Doc wins — `values.yaml` defaults |
| H12 | `vars.replicas` vs `vars.nodeCount` | n/a | inconsistent | Note only |

### D2 — Camel + schema in scope (vs Helm-only)
Completing templates needs new inputs. Chosen: extend `HelmValuesBuilder` (`buildLabels`
gains `setic.gov.br/cluster`, `gdfkube.io/cluster`, `gdfkube.io/form-type`, `gdfkube.io/env`
from the request; `policyNamespace` in naming; CIDR pass-through from `vars`) and update
`values.yaml`+`values.schema.json` in lockstep. Alternative (Helm + defaults only) rejected:
charts would not populate correctly end-to-end, re-introducing drift between rendered output
and the documented per-cluster identity.

### D3 — One change, three `-stack` capabilities
Matches existing spec convention (`kafka-broker-stack`, `gitea-stack`, …) and keeps per-doc
`## Specs` backlinks 1:1 (09→`argocd-org-stack`, 10→`rhacm-org-stack`,
11→`hypershift-cluster-stack`). Alternative (one mega-spec) rejected: muddies backlinks;
(three changes) rejected: shared Camel/label surface best evolved atomically.

### D4 — Badge lifecycle
Implementation sets 09/10/11 to `Partially implemented` (code exists, no archived change
yet — the spec's evidence rule). The `openspec-archive-change` step flips them to
`Implemented` and regenerates `docs/README.md`. `Last validated` → re-check date.

## Risks / Trade-offs

- **Camel push path ≠ discovery scan path** → Mitigation: verify the `org-bootstrap` route's
  git-push target against `argocd/orgs/*` during implementation (Open Question OQ1); expand
  scope if mismatched.
- **`gdfkube-policies` namespace absent at apply** → Mitigation: decide in implementation
  whether `rhacm-org` emits the Namespace (sync-wave) or it is a documented hub prerequisite
  (OQ2). Helm value change, not a MongoDB/Kafka migration — no consumer rebalancing.
- **ConfigurationPolicy references a secret that does not exist in-repo** → Mitigation:
  reference-only by design; rendering (not applying) is the verification boundary; no literal
  secret committed (trufflehog-safe).
- **Judgment-call rulings (A7/A9/H1/H4/H8) could be wrong for the demo's intent** →
  Mitigation: surfaced explicitly in the ledger for user override before code lands.
- **Doc⇄template re-drift later** → Mitigation: the new spec capabilities make the contract
  testable; the `fix-spec-doc-drift` retrospective's CI-rule follow-up remains the durable fix.

## Migration Plan

Pure GitOps/render change; no data migration. Deploy order during implementation: (1) Camel
`buildLabels`/naming + schema/values (unblocks rendering); (2) chart template edits
(A2–A6, R1–R3, H1, H3, H5–H9, H11); (3) new manifests (discovery, Placement,
ConfigurationPolicy, Policy/PlacementBinding); (4) doc bodies + badges + `## Specs`; (5)
verify; archive flips badges to `Implemented`. Rollback: revert the change branch — no
runtime state is mutated (charts are rendered, not applied, in this change).

## Open Questions (Resolved)

- **OQ1**: The Camel `org-bootstrap` route pushes to `gdfkube-orgs` repo at `orgs/<org>/`
  (not `gdfkube-infra/argocd/orgs/`). Discovery ApplicationSet adjusted to scan
  `gdfkube-orgs/orgs/*`. **Resolved 2026-05-15.**
- **OQ2**: `rhacm-org` emits the `gdfkube-policies` Namespace (sync-wave -10).
  Chart-owned. **Resolved 2026-05-15.**
- **OQ3**: All five judgment-call rulings (A7, A9, H1, H4, H8) confirmed by user.
  Ledger defaults stand. **Resolved 2026-05-15.**
