## 1. Confirm open decisions

- [ ] 1.1 Confirm the five judgment-call rulings with the user (A7 ApplicationSet `appset-<org>`, A9 `HEAD` revision, H1 per-cluster namespace via `system.naming.namespace`, H4 explicit `kubevirt.baseDomain` + add `dns.baseDomain`, H8 NodePool `-workers`); record any overrides in design.md
- [ ] 1.2 OQ1: inspect the Camel `org-bootstrap` route's git-push target; confirm it writes to `gdfkube-infra/argocd/orgs/{org}/` (the discovery scan path). If not, add the route/path fix to scope
- [ ] 1.3 OQ2: decide whether `rhacm-org` emits the `gdfkube-policies` Namespace (sync-wave) or documents it as a hub prerequisite; record in design.md

## 2. Camel + schema/values (unblocks rendering)

- [ ] 2.1 Extend `HelmValuesBuilder.buildLabels` to emit `setic.gov.br/cluster`, `gdfkube.io/cluster` (from `vars.clusterName`), `gdfkube.io/form-type` (from `event.formId`), `gdfkube.io/env` (from `vars.environment`); keep `buildForOrg` to org-level labels only
- [ ] 2.2 Add `system.naming.policyNamespace` (default `gdfkube-policies`) to `buildNaming` and `buildForOrg`
- [ ] 2.3 Pass CIDR override `vars` (clusterNetwork/serviceNetwork) through `build` when present
- [ ] 2.4 Update `values.yaml` defaults and `values.schema.json` for `argocd-org`, `rhacm-org`, `cluster-request` (policyNamespace, 4 new labels, CIDR keys, compute/rootVolume/networking defaults) in lockstep
- [ ] 2.5 Extend/confirm `HelmValuesBuilder` JUnit tests (build on `strengthen-org-bootstrap-tests`) for the 4 new labels, `policyNamespace`, and CIDR pass-through

## 3. ArgoCD — `argocd-org` chart + discovery

- [ ] 3.1 `templates/appproject.yaml`: namespace `openshift-gitops`; scoped `destinations` (`hc-<org>-*`, `ns-<org>-*`); explicit `clusterResourceWhitelist` (HostedCluster, NodePool, ManagedCluster, Namespace); `namespaceResourceBlacklist` (ResourceQuota, LimitRange); templated `org-operator` Casbin role bound to the org operator group (A2–A6)
- [ ] 3.2 `templates/applicationset.yaml`: keep `appset-<org>` name (A7), namespace `openshift-gitops` (A8), keep `HEAD` revision (A9)
- [ ] 3.3 Create `gdfkube-src/gdfkube-infra/argocd/discovery/org-repos-discovery.yaml` — ApplicationSet `gdfkube-infra-orgs` in `openshift-gitops`, scans `argocd/orgs/*` of `gdfkube-infra` at `HEAD`, `project: default`, empty `syncPolicy` (A1, A9)

## 4. RHACM — `rhacm-org` chart + new manifests

- [ ] 4.1 `templates/managedclusterset.yaml`: add `spec.clusterSelector.selectorType: ExclusiveClusterSetLabel` (R1)
- [ ] 4.2 `templates/managedclustersetbinding.yaml`: render into `system.naming.policyNamespace` (R2)
- [ ] 4.3 Create `templates/placement.yaml` — `<org>-prod-clusters` in `policyNamespace`, `clusterSets: [<clusterSet>]`, predicate `gdfkube.io/env: production` (R4)
- [ ] 4.4 Create `templates/configurationpolicy.yaml` — `hc-pullsecret-distributor` (enforce) templating `pull-secret` + `sshkey` from `open-cluster-management/kubevirt-secret` (reference-only, no literal secret) (R5)
- [ ] 4.5 Create `templates/policy.yaml` + `templates/placementbinding.yaml` wrapping the ConfigurationPolicy and binding it to the Placement (R5)
- [ ] 4.6 (If OQ2 = chart-owned) add the `gdfkube-policies` Namespace template with an appropriate sync-wave

## 5. HyperShift — `cluster-request` + `scale-request`

- [ ] 5.1 `cluster-request/templates/hostedcluster.yaml`: namespace `{{ system.naming.namespace }}` (H1); add `sshKey.name: sshkey` (H3); keep value-driven `kubevirt.baseDomain` and add `dns.baseDomain` (H4, H5); add `networking` (defaults + `vars` override, `OVNKubernetes`) (H6); add the 5 service publishing strategies (H7)
- [ ] 5.2 `cluster-request/templates/nodepool.yaml`: keep `-workers` name (H8); namespace `{{ system.naming.namespace }}` (H1); add `release.image` (H9); keep `management.autoRepair: true` (H10); add kubevirt `compute` (16Gi/4) + `rootVolume` (64Gi ceph-rbd) defaults (H11)
- [ ] 5.3 `scale-request/templates/nodepool-patch.yaml`: confirm `-workers` name and `{{ system.naming.namespace }}` match the cluster-request NodePool (H8)

## 6. Docs reconciliation

- [ ] 6.1 `docs/09-argocd.md`: replace embedded YAML to match rendered `argocd-org` + discovery; set `Implementation Status: Partially implemented`; bump `Last validated:` to re-check date; replace `## Specs` placeholder with `` [`argocd-org-stack`](../openspec/specs/argocd-org-stack/spec.md) ``
- [ ] 6.2 `docs/10-rhacm.md`: reconcile embedded YAML + Label Schema; same badge/date; `## Specs` → `rhacm-org-stack`
- [ ] 6.3 `docs/11-hypershift.md`: reconcile embedded HostedCluster/NodePool YAML; document `management.autoRepair` (H10) and `vars.replicas` vs `vars.nodeCount` (H12); same badge/date; `## Specs` → `hypershift-cluster-stack`
- [ ] 6.4 `docs/README.md`: regenerate the Status column for rows 09/10/11 (Conventions already define `Partially implemented`)

## 7. Verification

- [ ] 7.1 `helm lint` + `helm template` each affected chart with its `values.yaml`; assert rendered output contains all spec-required fields (run from `gdfkube-src/gdfkube-infra/charts/`)
- [ ] 7.2 Run the gdfkube-camel Maven test suite; if Maven is unavailable in the devcontainer, return the exact command to the user
- [ ] 7.3 Run the architecture-docs spec gate: `for s in $(grep -oE 'openspec/specs/[a-z0-9-]+/spec\.md' docs/*.md); do test -f "$s" || echo "MISSING: $s"; done` (no output) and `openspec validate realize-gitops-provisioning-templates`
- [ ] 7.4 `pre-commit run --all-files` (trufflehog) — confirm no findings
