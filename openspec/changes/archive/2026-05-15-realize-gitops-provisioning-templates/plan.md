# Realize ArgoCD / RHACM / HyperShift Templates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every manifest documented in `docs/09-argocd.md`, `docs/10-rhacm.md`, `docs/11-hypershift.md` exist as a real, value-driven Helm template that renders correctly end-to-end, and reconcile the three docs to match.

**Architecture:** Camel `HelmValuesBuilder` builds a `values.yaml` from a request/org event; Helm renders the `argocd-org`, `rhacm-org`, `cluster-request`, `scale-request` charts; output is GitOps-applied by ArgoCD. This change completes the stub templates, adds the missing manifests, extends the values builder + JSON schema in lockstep, and updates the docs + their `## Specs` backlinks.

**Tech Stack:** Helm v2 charts, Quarkus/Apache Camel (Java 17, Maven), JUnit 5, `openspec`, markdown docs.

**Reference artifacts in this change dir:** `design.md` (decision ledger D1, OQs), `specs/{argocd-org-stack,rhacm-org-stack,hypershift-cluster-stack}/spec.md`, `tasks.md`.

**Conventions for "render tests":** charts are verified by rendering, not applying. The repeatable check is:
```bash
cd gdfkube-src/gdfkube-infra/charts
helm template t <chart> -f <chart>/values.yaml
```
"Expected: FAIL" means the assertion `grep` below finds nothing (stub state); "Expected: PASS" means it matches after the edit.

---

## Task 0: Confirm open decisions (gate)

**Files:** none (decisions recorded in `design.md` Open Questions if overridden)

- [ ] **Step 1: Confirm the five judgment calls**

Ask the user to confirm or override the bolded ledger rulings in `design.md` D1: A7 (`appset-<org>`), A9 (`HEAD` revision), H1 (per-cluster namespace via `system.naming.namespace`), H4 (explicit `kubevirt.baseDomain` + add `dns.baseDomain`), H8 (NodePool `-workers`). This plan assumes the documented defaults; if overridden, adjust the affected steps before running them.

- [ ] **Step 2: Resolve OQ1 (Camel push path)**

Run:
```bash
grep -rn "argocd/orgs\|orgs/\|git.*push\|RepoName\|buildForOrg" gdfkube-src/gdfkube-camel/src/main/java | grep -i "org\|argocd\|path"
```
Confirm the `org-bootstrap` route pushes `argocd-org` output under `argocd/orgs/<org>/` in the `gdfkube-infra` repo (the discovery scan path in Task 3). If it does not, add a task to fix the route or the discovery `directories` path before Task 3 Step 3.

- [ ] **Step 3: Resolve OQ2 (policy namespace ownership)**

Decide: does `rhacm-org` emit the `gdfkube-policies` Namespace (Task 4 Step 9, sync-wave `-10`) or is it a documented hub prerequisite? Record the choice in `design.md` Open Questions. Default for this plan: chart-owned (Task 4 Step 9 included).

---

## Task 1: Camel — canonical labels, policyNamespace, CIDR passthrough

**Files:**
- Modify: `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/bean/HelmValuesBuilder.java`
- Test: `gdfkube-src/gdfkube-camel/src/test/java/gov/gdf/camel/bean/HelmValuesBuilderTest.java` (exists from the `strengthen-org-bootstrap-tests` change; confirm path with `find gdfkube-src/gdfkube-camel/src/test -name 'HelmValuesBuilder*'`)

- [ ] **Step 1: Write the failing test for the 4 extra cluster labels**

Add to `HelmValuesBuilderTest.java`:
```java
@Test
void clusterRequestEmitsCanonicalTenLabels() {
    RequestEvent ev = new RequestEvent();
    ev._id = "01HK6X3F5G9Q";
    ev.formId = "cluster-request";
    ev.requesterGroupName = "saude";
    ev.submittedAt = "2026-05-15T12:00:00Z";
    ev.vars = new java.util.HashMap<>(java.util.Map.of(
            "clusterName", "vacinacao", "environment", "production"));

    Map<String, String> labels = builder.buildLabels("saude", "01HK6X3F5G9Q",
            "cluster-request", "vacinacao", "production");

    assertThat(labels).containsAllEntriesOf(java.util.Map.of(
            "cluster.open-cluster-management.io/clusterset", "saude",
            "setic.gov.br/cluster", "vacinacao",
            "gdfkube.io/cluster", "vacinacao",
            "gdfkube.io/form-type", "cluster-request",
            "gdfkube.io/env", "production"));
    assertThat(labels).hasSize(10);
}
```
(Use the test class's existing `builder` field / `assertThat` import. If the class uses plain JUnit asserts, translate to `assertEquals`/`assertTrue` accordingly — match the file's existing style.)

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd gdfkube-src/gdfkube-camel && ./mvnw -q -Dtest=HelmValuesBuilderTest#clusterRequestEmitsCanonicalTenLabels test
```
Expected: FAIL — no `buildLabels(String,String,String,String,String)` overload exists.
(If `./mvnw` is absent, return `cd gdfkube-src/gdfkube-camel && mvn -Dtest=HelmValuesBuilderTest#clusterRequestEmitsCanonicalTenLabels test` to the user to run.)

- [ ] **Step 3: Add the 5-arg `buildLabels` overload**

In `HelmValuesBuilder.java`, replace the existing `buildLabels` with:
```java
Map<String, String> buildLabels(String org, String requestId) {
    Map<String, String> labels = new LinkedHashMap<>();
    labels.put("cluster.open-cluster-management.io/clusterset", org);
    labels.put("setic.gov.br/managed", "true");
    labels.put("setic.gov.br/customer", org);
    labels.put("gdfkube.io/managed", "true");
    labels.put("gdfkube.io/organization", org);
    labels.put("gdfkube.io/request-id", requestId);
    return labels;
}

Map<String, String> buildLabels(String org, String requestId, String formType,
                                String clusterName, String environment) {
    Map<String, String> labels = buildLabels(org, requestId);
    if (clusterName != null) {
        labels.put("setic.gov.br/cluster", clusterName);
        labels.put("gdfkube.io/cluster", clusterName);
    }
    if (formType != null) {
        labels.put("gdfkube.io/form-type", formType);
    }
    if (environment != null) {
        labels.put("gdfkube.io/env", environment);
    }
    return labels;
}
```

- [ ] **Step 4: Wire the enriched labels into `buildSystem`**

In `buildSystem(...)`, replace `system.put("labels", buildLabels(org, requestId));` with:
```java
String clusterName = event.vars != null
        ? (String) event.vars.get("clusterName") : null;
String environment = event.vars != null
        ? (String) event.vars.get("environment") : null;
system.put("labels", buildLabels(org, requestId, event.formId,
        clusterName, environment));
```
Leave `buildForOrg` calling the 2-arg `buildLabels(groupId, "bootstrap-" + groupId)` unchanged (org-bootstrap has no per-cluster labels).

- [ ] **Step 5: Run the test to verify it passes**

Run:
```bash
cd gdfkube-src/gdfkube-camel && ./mvnw -q -Dtest=HelmValuesBuilderTest#clusterRequestEmitsCanonicalTenLabels test
```
Expected: PASS.

- [ ] **Step 6: Write the failing test for `policyNamespace`**

Add:
```java
@Test
void namingIncludesPolicyNamespace() throws Exception {
    String path = builder.buildForOrg("saude");
    String yaml = java.nio.file.Files.readString(java.nio.file.Path.of(path));
    assertThat(yaml).contains("policyNamespace: gdfkube-policies");
}
```

- [ ] **Step 7: Run it to verify it fails**

Run:
```bash
cd gdfkube-src/gdfkube-camel && ./mvnw -q -Dtest=HelmValuesBuilderTest#namingIncludesPolicyNamespace test
```
Expected: FAIL — `policyNamespace` not emitted.

- [ ] **Step 8: Add `policyNamespace` to both naming builders**

In `buildNaming(...)` add before `return naming;`:
```java
naming.put("policyNamespace", "gdfkube-policies");
```
In `buildForOrg(...)` add after `naming.put("namespace", groupId);`:
```java
naming.put("policyNamespace", "gdfkube-policies");
```

- [ ] **Step 9: Run it to verify it passes**

Run:
```bash
cd gdfkube-src/gdfkube-camel && ./mvnw -q -Dtest=HelmValuesBuilderTest#namingIncludesPolicyNamespace test
```
Expected: PASS.

- [ ] **Step 10: Confirm CIDR passthrough (no code needed)**

`build(...)` already does `values.put("vars", event.vars != null ? event.vars : Map.of())`, so CIDR override keys in `event.vars` flow to the chart automatically. No code change — the chart (Task 5) reads `.Values.vars.clusterNetworkCidr`/`.Values.vars.serviceNetworkCidr`. Add a one-line comment in `build` noting vars passthrough carries CIDR overrides.

- [ ] **Step 11: Run the full builder suite and commit**

Run:
```bash
cd gdfkube-src/gdfkube-camel && ./mvnw -q -Dtest=HelmValuesBuilderTest test
```
Expected: PASS (all). Then:
```bash
git add gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/bean/HelmValuesBuilder.java gdfkube-src/gdfkube-camel/src/test/java/gov/gdf/camel/bean/HelmValuesBuilderTest.java
git commit -m "feat(camel): emit canonical cluster labels and policyNamespace"
```

---

## Task 2: argocd-org — values & schema

**Files:**
- Modify: `gdfkube-src/gdfkube-infra/charts/infra/argocd-org/values.yaml`
- Modify: `gdfkube-src/gdfkube-infra/charts/infra/argocd-org/values.schema.json`

- [ ] **Step 1: Add `policyNamespace` to values.yaml**

Under `system.naming:` add `    policyNamespace: "gdfkube-policies"` and under `system.labels:` add the 4 canonical extras so standalone renders are realistic:
```yaml
    setic.gov.br/cluster: "vacinacao"
    gdfkube.io/cluster: "vacinacao"
    gdfkube.io/form-type: "org-bootstrap"
    gdfkube.io/env: "production"
```

- [ ] **Step 2: Add `policyNamespace` to the schema**

In `values.schema.json`, in `system.naming.properties` add `"policyNamespace": { "type": "string" }` and add `"policyNamespace"` to `system.naming.required`.

- [ ] **Step 3: Verify the chart still renders**

Run:
```bash
cd gdfkube-src/gdfkube-infra/charts && helm template t infra/argocd-org -f infra/argocd-org/values.yaml >/dev/null && echo OK
```
Expected: `OK` (schema accepts the new value).

- [ ] **Step 4: Commit**

```bash
git add gdfkube-src/gdfkube-infra/charts/infra/argocd-org/values.yaml gdfkube-src/gdfkube-infra/charts/infra/argocd-org/values.schema.json
git commit -m "feat(argocd-org): add policyNamespace + canonical labels to values/schema"
```

---

## Task 3: argocd-org — AppProject, ApplicationSet, discovery

**Files:**
- Modify: `gdfkube-src/gdfkube-infra/charts/infra/argocd-org/templates/appproject.yaml`
- Modify: `gdfkube-src/gdfkube-infra/charts/infra/argocd-org/templates/applicationset.yaml`
- Create: `gdfkube-src/gdfkube-infra/argocd/discovery/org-repos-discovery.yaml`

- [ ] **Step 1: Render-assert AppProject scoping fails (stub state)**

Run:
```bash
cd gdfkube-src/gdfkube-infra/charts && helm template t infra/argocd-org -f infra/argocd-org/values.yaml | grep -A30 'kind: AppProject' | grep -E 'namespace: openshift-gitops|hc-saude-\*|namespaceResourceBlacklist|org-operator'
```
Expected: FAIL (no matches — current template is permissive in `argocd`).

- [ ] **Step 2: Replace `appproject.yaml` with the scoped version (A2–A6)**

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AppProject
metadata:
  name: {{ .Values.system.naming.appProject }}
  namespace: openshift-gitops
  labels:
    {{- toYaml .Values.system.labels | nindent 4 }}
spec:
  description: "Customer org: {{ .Values.meta.org }}"
  sourceRepos:
    - "{{ .Values.system.giteaExternalUrl }}/{{ .Values.system.giteaOwner }}/gdfkube-{{ .Values.meta.org }}.git"
  destinations:
    - namespace: "hc-{{ .Values.meta.org }}-*"
      server: https://kubernetes.default.svc
    - namespace: "ns-{{ .Values.meta.org }}-*"
      server: https://kubernetes.default.svc
  clusterResourceWhitelist:
    - group: "hypershift.openshift.io"
      kind: HostedCluster
    - group: "hypershift.openshift.io"
      kind: NodePool
    - group: "cluster.open-cluster-management.io"
      kind: ManagedCluster
    - group: ""
      kind: Namespace
  namespaceResourceBlacklist:
    - group: ""
      kind: ResourceQuota
    - group: ""
      kind: LimitRange
  roles:
    - name: org-operator
      description: "Sync rights scoped to this AppProject"
      policies:
        - p, proj:{{ .Values.meta.org }}:org-operator, applications, sync, {{ .Values.meta.org }}/*, allow
        - p, proj:{{ .Values.meta.org }}:org-operator, applications, get, {{ .Values.meta.org }}/*, allow
      groups:
        - {{ .Values.meta.org }}-operator
```

- [ ] **Step 3: Update `applicationset.yaml` namespace (A7/A9 kept)**

Change only line `  namespace: argocd` → `  namespace: openshift-gitops`. Keep `name: appset-{{ .Values.meta.org }}` (A7) and `revision: HEAD` / `targetRevision: HEAD` (A9) as-is.

- [ ] **Step 4: Render-assert AppProject scoping now passes**

Run:
```bash
cd gdfkube-src/gdfkube-infra/charts && helm template t infra/argocd-org -f infra/argocd-org/values.yaml | grep -E 'namespace: openshift-gitops|hc-saude-\*|kind: ResourceQuota|name: org-operator'
```
Expected: PASS (all four match).

- [ ] **Step 5: Create the discovery ApplicationSet (A1, A9)**

Create `gdfkube-src/gdfkube-infra/argocd/discovery/org-repos-discovery.yaml`:
```yaml
# Hand-applied once to bootstrap per-org Applications.
# Not rendered by Helm — apply directly to the hub:
#   oc apply -f gdfkube-src/gdfkube-infra/argocd/discovery/org-repos-discovery.yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: gdfkube-infra-orgs
  namespace: openshift-gitops
spec:
  generators:
    - git:
        repoURL: https://gitea-gitea.apps.gdfkube.gov/gdfkube/gdfkube-infra.git
        revision: HEAD
        directories:
          - path: argocd/orgs/*
  template:
    metadata:
      name: 'gdfkube-infra-{{path.basename}}'
    spec:
      project: default
      source:
        repoURL: https://gitea-gitea.apps.gdfkube.gov/gdfkube/gdfkube-infra.git
        targetRevision: HEAD
        path: '{{path}}'
      destination:
        server: https://kubernetes.default.svc
        namespace: openshift-gitops
      syncPolicy: {}
```

- [ ] **Step 6: Lint and commit**

Run:
```bash
cd gdfkube-src/gdfkube-infra/charts && helm lint infra/argocd-org -f infra/argocd-org/values.yaml
```
Expected: `0 chart(s) failed`. Then:
```bash
git add gdfkube-src/gdfkube-infra/charts/infra/argocd-org/templates gdfkube-src/gdfkube-infra/argocd/discovery/org-repos-discovery.yaml
git commit -m "feat(argocd-org): scoped AppProject + discovery ApplicationSet"
```

---

## Task 4: rhacm-org — set selector, policy namespace, Placement, ConfigurationPolicy

**Files:**
- Modify: `charts/infra/rhacm-org/templates/managedclusterset.yaml`
- Modify: `charts/infra/rhacm-org/templates/managedclustersetbinding.yaml`
- Modify: `charts/infra/rhacm-org/values.yaml`, `charts/infra/rhacm-org/values.schema.json`
- Create: `charts/infra/rhacm-org/templates/placement.yaml`, `configurationpolicy.yaml`, `policy.yaml`, `placementbinding.yaml`
- Create (if OQ2 = chart-owned): `charts/infra/rhacm-org/templates/policy-namespace.yaml`

(Paths are under `gdfkube-src/gdfkube-infra/`.)

- [ ] **Step 1: Add `policyNamespace` to rhacm-org values + schema**

In `charts/infra/rhacm-org/values.yaml` add `    policyNamespace: "gdfkube-policies"` under `system.naming:`. In `values.schema.json` add `"policyNamespace": { "type": "string" }` to `system.naming.properties` and to `required`.

- [ ] **Step 2: Render-assert selector + policy ns fail (stub state)**

Run:
```bash
cd gdfkube-src/gdfkube-infra/charts && helm template t infra/rhacm-org -f infra/rhacm-org/values.yaml | grep -E 'ExclusiveClusterSetLabel|kind: Placement|kind: ConfigurationPolicy|namespace: gdfkube-policies'
```
Expected: FAIL (no matches).

- [ ] **Step 3: Add the cluster selector to `managedclusterset.yaml` (R1)**

Append to the file:
```yaml
spec:
  clusterSelector:
    selectorType: ExclusiveClusterSetLabel
```

- [ ] **Step 4: Point the binding at the policy namespace (R2)**

In `managedclustersetbinding.yaml` change `  namespace: {{ .Values.system.naming.appProject }}` → `  namespace: {{ .Values.system.naming.policyNamespace }}`.

- [ ] **Step 5: Create `placement.yaml` (R4)**

```yaml
apiVersion: cluster.open-cluster-management.io/v1beta1
kind: Placement
metadata:
  name: {{ .Values.meta.org }}-prod-clusters
  namespace: {{ .Values.system.naming.policyNamespace }}
  labels:
    {{- toYaml .Values.system.labels | nindent 4 }}
spec:
  clusterSets:
    - {{ .Values.system.naming.clusterSet }}
  predicates:
    - requiredClusterSelector:
        labelSelector:
          matchLabels:
            gdfkube.io/env: production
```

- [ ] **Step 6: Create `configurationpolicy.yaml` (R5)**

```yaml
apiVersion: policy.open-cluster-management.io/v1
kind: ConfigurationPolicy
metadata:
  name: hc-pullsecret-distributor
  namespace: {{ .Values.system.naming.policyNamespace }}
  labels:
    {{- toYaml .Values.system.labels | nindent 4 }}
spec:
  remediationAction: enforce
  severity: medium
  object-templates:
    - complianceType: musthave
      objectDefinition:
        apiVersion: v1
        kind: Secret
        type: kubernetes.io/dockerconfigjson
        metadata:
          name: pull-secret
          namespace: '{{ "{{" }} (lookup "cluster.open-cluster-management.io/v1" "ManagedCluster" "" "").metadata.name {{ "}}" }}'
        data:
          .dockerconfigjson: '{{ "{{" }} fromSecret "open-cluster-management" "kubevirt-secret" "pullSecret" {{ "}}" }}'
    - complianceType: musthave
      objectDefinition:
        apiVersion: v1
        kind: Secret
        type: Opaque
        metadata:
          name: sshkey
          namespace: '{{ "{{" }} (lookup "cluster.open-cluster-management.io/v1" "ManagedCluster" "" "").metadata.name {{ "}}" }}'
        data:
          id_rsa.pub: '{{ "{{" }} fromSecret "open-cluster-management" "kubevirt-secret" "ssh-publickey" {{ "}}" }}'
```
(The `{{ "{{" }}` escaping emits literal RHACM `{{ }}` template delimiters through Helm. No literal secret material is present — trufflehog-safe.)

- [ ] **Step 7: Create `policy.yaml` + `placementbinding.yaml` (R5)**

`policy.yaml`:
```yaml
apiVersion: policy.open-cluster-management.io/v1
kind: Policy
metadata:
  name: {{ .Values.meta.org }}-pullsecret-distribution
  namespace: {{ .Values.system.naming.policyNamespace }}
  labels:
    {{- toYaml .Values.system.labels | nindent 4 }}
spec:
  remediationAction: enforce
  disabled: false
  policy-templates:
    - objectDefinition:
        apiVersion: policy.open-cluster-management.io/v1
        kind: ConfigurationPolicy
        metadata:
          name: hc-pullsecret-distributor
```
`placementbinding.yaml`:
```yaml
apiVersion: policy.open-cluster-management.io/v1
kind: PlacementBinding
metadata:
  name: {{ .Values.meta.org }}-pullsecret-binding
  namespace: {{ .Values.system.naming.policyNamespace }}
  labels:
    {{- toYaml .Values.system.labels | nindent 4 }}
placementRef:
  name: {{ .Values.meta.org }}-prod-clusters
  apiGroup: cluster.open-cluster-management.io
  kind: Placement
subjects:
  - name: {{ .Values.meta.org }}-pullsecret-distribution
    apiGroup: policy.open-cluster-management.io
    kind: Policy
```

- [ ] **Step 8: Render-assert all RHACM objects now present**

Run:
```bash
cd gdfkube-src/gdfkube-infra/charts && helm template t infra/rhacm-org -f infra/rhacm-org/values.yaml | grep -E 'ExclusiveClusterSetLabel|kind: Placement|kind: ConfigurationPolicy|kind: PlacementBinding|namespace: gdfkube-policies'
```
Expected: PASS (all match).

- [ ] **Step 9: (OQ2 = chart-owned only) add the policy Namespace**

Create `templates/policy-namespace.yaml`:
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: {{ .Values.system.naming.policyNamespace }}
  annotations:
    argocd.argoproj.io/sync-wave: "-10"
  labels:
    {{- toYaml .Values.system.labels | nindent 4 }}
```

- [ ] **Step 10: Lint and commit**

Run:
```bash
cd gdfkube-src/gdfkube-infra/charts && helm lint infra/rhacm-org -f infra/rhacm-org/values.yaml
```
Expected: `0 chart(s) failed`. Then:
```bash
git add gdfkube-src/gdfkube-infra/charts/infra/rhacm-org
git commit -m "feat(rhacm-org): exclusive set selector, policy ns, Placement + ConfigurationPolicy"
```

---

## Task 5: cluster-request — full HostedCluster + NodePool; ManagedCluster labels

**Files:**
- Modify: `charts/cluster-request/templates/hostedcluster.yaml`
- Modify: `charts/cluster-request/templates/nodepool.yaml`
- Modify: `charts/cluster-request/values.yaml`, `charts/cluster-request/values.schema.json`
- Verify: `charts/scale-request/templates/nodepool-patch.yaml`

(Paths under `gdfkube-src/gdfkube-infra/`.)

- [ ] **Step 1: Add networking/compute defaults to values + schema**

In `charts/cluster-request/values.yaml` under `vars:` add:
```yaml
  clusterNetworkCidr: "10.132.0.0/14"
  serviceNetworkCidr: "172.31.0.0/16"
```
In `values.schema.json` `vars.properties` add `"clusterNetworkCidr": { "type": "string" }` and `"serviceNetworkCidr": { "type": "string" }`.

- [ ] **Step 2: Render-assert HostedCluster completeness fails (stub state)**

Run:
```bash
cd gdfkube-src/gdfkube-infra/charts && helm template t cluster-request -f cluster-request/values.yaml | grep -E 'sshKey|dns:|networkType: OVNKubernetes|service: Ignition|namespace: hc-saude-vacinacao'
```
Expected: FAIL (no matches — stub is namespace `clusters`, APIServer-only).

- [ ] **Step 3: Replace `hostedcluster.yaml` with the full spec (H1,H3,H4,H5,H6,H7)**

```yaml
apiVersion: hypershift.openshift.io/v1beta1
kind: HostedCluster
metadata:
  name: {{ .Values.system.naming.hostedClusterName }}
  namespace: {{ .Values.system.naming.namespace }}
  labels:
    {{- toYaml .Values.system.labels | nindent 4 }}
spec:
  release:
    image: {{ .Values.system.releaseImage }}
  pullSecret:
    name: pull-secret
  sshKey:
    name: sshkey
  platform:
    type: KubeVirt
    kubevirt:
      baseDomain: {{ .Values.system.baseDomain }}
  dns:
    baseDomain: {{ .Values.system.baseDomain }}
  networking:
    clusterNetwork:
      - cidr: {{ .Values.vars.clusterNetworkCidr | default "10.132.0.0/14" }}
    serviceNetwork:
      - cidr: {{ .Values.vars.serviceNetworkCidr | default "172.31.0.0/16" }}
    networkType: OVNKubernetes
  services:
    - service: APIServer
      servicePublishingStrategy:
        type: LoadBalancer
    - service: OAuthServer
      servicePublishingStrategy:
        type: Route
    - service: OIDC
      servicePublishingStrategy:
        type: Route
    - service: Konnectivity
      servicePublishingStrategy:
        type: Route
    - service: Ignition
      servicePublishingStrategy:
        type: Route
```

- [ ] **Step 4: Replace `nodepool.yaml` with the full spec (H1,H8,H9,H10,H11)**

```yaml
apiVersion: hypershift.openshift.io/v1beta1
kind: NodePool
metadata:
  name: {{ .Values.system.naming.hostedClusterName }}-workers
  namespace: {{ .Values.system.naming.namespace }}
  labels:
    {{- toYaml .Values.system.labels | nindent 4 }}
spec:
  clusterName: {{ .Values.system.naming.hostedClusterName }}
  replicas: {{ .Values.vars.nodeCount | default 1 }}
  management:
    autoRepair: true
  release:
    image: {{ .Values.system.releaseImage }}
  platform:
    type: KubeVirt
    kubevirt:
      compute:
        memory: 16Gi
        cores: 4
      rootVolume:
        type: Persistent
        persistent:
          size: 64Gi
          storageClass: ocs-storagecluster-ceph-rbd
```

- [ ] **Step 5: Render-assert HostedCluster + NodePool completeness passes**

Run:
```bash
cd gdfkube-src/gdfkube-infra/charts && helm template t cluster-request -f cluster-request/values.yaml | grep -E 'sshKey|networkType: OVNKubernetes|service: Ignition|namespace: hc-saude-vacinacao|hc-saude-vacinacao-workers|ocs-storagecluster-ceph-rbd'
```
Expected: PASS (all match).

- [ ] **Step 6: Assert CIDR override flows through**

Run:
```bash
cd gdfkube-src/gdfkube-infra/charts && helm template t cluster-request -f cluster-request/values.yaml --set vars.clusterNetworkCidr=10.200.0.0/14 | grep '10.200.0.0/14'
```
Expected: PASS (one match).

- [ ] **Step 7: Verify the scale-request patch name matches (H8)**

Run:
```bash
cd gdfkube-src/gdfkube-infra/charts && helm template t scale-request -f scale-request/values.yaml | grep -E 'name: hc-saude-vacinacao-workers|namespace:'
```
Expected: NodePool named `hc-saude-vacinacao-workers`. If `scale-request` uses `namespace: clusters`, change `scale-request/templates/nodepool-patch.yaml` `namespace:` to `{{ .Values.system.naming.namespace }}` so the patch targets the same object; otherwise no change.

- [ ] **Step 8: Lint and commit**

Run:
```bash
cd gdfkube-src/gdfkube-infra/charts && helm lint cluster-request -f cluster-request/values.yaml && helm lint scale-request -f scale-request/values.yaml
```
Expected: `0 chart(s) failed`. Then:
```bash
git add gdfkube-src/gdfkube-infra/charts/cluster-request gdfkube-src/gdfkube-infra/charts/scale-request
git commit -m "feat(cluster-request): full HostedCluster/NodePool spec + CIDR override"
```

---

## Task 6: Reconcile docs 09 / 10 / 11 + README

**Files:**
- Modify: `docs/09-argocd.md`, `docs/10-rhacm.md`, `docs/11-hypershift.md`, `docs/README.md`

- [ ] **Step 1: Reconcile `docs/09-argocd.md`**

Replace the embedded discovery/AppProject/ApplicationSet YAML blocks with the Task 3 final manifests (AppProject in `openshift-gitops`, scoped destinations/whitelist/blacklist/roles; ApplicationSet `appset-saude`, `HEAD`; discovery as written). In the header set `> **Implementation Status:** Partially implemented` and `> **Last validated:** 2026-05-15`. Replace the `## Specs` body with:
```
- [`argocd-org-stack`](../openspec/specs/argocd-org-stack/spec.md)
```

- [ ] **Step 2: Reconcile `docs/10-rhacm.md`**

Update the ManagedClusterSet (keep `ExclusiveClusterSetLabel`), ManagedClusterSetBinding (namespace `gdfkube-policies` via policyNamespace), Placement, ConfigurationPolicy, and ManagedCluster blocks to match the Task 4/Task 5 templates and the 10-label schema. Same header badge/date. `## Specs` body:
```
- [`rhacm-org-stack`](../openspec/specs/rhacm-org-stack/spec.md)
```

- [ ] **Step 3: Reconcile `docs/11-hypershift.md`**

Replace the HostedCluster/NodePool blocks with the Task 5 manifests (namespace `hc-saude-vacinacao`, sshKey, dns, networking + CIDR note, 5 services; NodePool `-workers`, release.image, compute, rootVolume). Add a sentence documenting `management.autoRepair: true` (H10) and that scale uses `vars.replicas` while initial provisioning uses `vars.nodeCount` (H12). Same header badge/date. `## Specs` body:
```
- [`hypershift-cluster-stack`](../openspec/specs/hypershift-cluster-stack/spec.md)
```

- [ ] **Step 4: Regenerate the README status rows**

In `docs/README.md` set the `Status` column for the `09-argocd`, `10-rhacm`, `11-hypershift` rows to `Partially implemented` (the Conventions section already defines this value from the `fix-spec-doc-drift` change — confirm; if missing, add the bullet).

- [ ] **Step 5: Run the architecture-docs spec gate**

Run from repo root:
```bash
for s in $(grep -oE 'openspec/specs/[a-z0-9-]+/spec\.md' docs/*.md); do test -f "$s" || echo "MISSING: $s"; done
```
Expected: no output. (Spec files exist under `openspec/specs/` only after archive; pre-archive this lists the change's specs as missing — that is expected and resolved by `/opsx:archive`. Note this in the verify artifact rather than treating it as a failure now.)

- [ ] **Step 6: Commit**

```bash
git add docs/09-argocd.md docs/10-rhacm.md docs/11-hypershift.md docs/README.md
git commit -m "docs: reconcile 09/10/11 to templates, re-badge, add spec backlinks"
```

---

## Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Render every affected chart**

Run:
```bash
cd gdfkube-src/gdfkube-infra/charts
for c in infra/argocd-org infra/rhacm-org cluster-request scale-request; do helm template t $c -f $c/values.yaml >/dev/null && echo "OK $c"; done
```
Expected: `OK` for all four.

- [ ] **Step 2: Run the full Camel test suite**

Run:
```bash
cd gdfkube-src/gdfkube-camel && ./mvnw -q test
```
Expected: BUILD SUCCESS. If Maven/JDK is unavailable in the devcontainer, return this exact command to the user to run from the host.

- [ ] **Step 3: Validate the OpenSpec change**

Run from repo root:
```bash
openspec validate realize-gitops-provisioning-templates
```
Expected: `Change 'realize-gitops-provisioning-templates' is valid`.

- [ ] **Step 4: Secret scan**

Run:
```bash
pre-commit run --all-files
```
Expected: trufflehog passes (the ConfigurationPolicy references a secret by name only — no literal material).

- [ ] **Step 5: Final commit if anything outstanding**

```bash
git status --porcelain
```
Expected: clean (all work committed across Tasks 1–6).

---

## Self-Review

- **Spec coverage:** `argocd-org-stack` → Tasks 2–3, 6.1; `rhacm-org-stack` → Tasks 1, 4, 5 (ManagedCluster labels), 6.2; `hypershift-cluster-stack` → Tasks 1 (CIDR/labels), 5, 6.3. Every requirement maps to at least one task and a render/JUnit assertion.
- **Placeholder scan:** no TBD/TODO; every code/YAML step contains the full file or exact edit and a concrete command with expected output.
- **Type consistency:** `buildLabels(String,String)` and the 5-arg overload `buildLabels(String,String,String,String,String)` are used consistently (Task 1 Steps 3–5, 1); `system.naming.policyNamespace` is the single name used across Camel (Task 1), argocd-org (Task 2/3), rhacm-org (Task 4); NodePool name `<hostedClusterName>-workers` is consistent across cluster-request (Task 5.4) and scale-request (Task 5.7).
- **Open items:** Task 0 gates the five judgment calls and OQ1/OQ2 before dependent edits; the pre-archive spec-gate behavior is documented in Task 6.5 to avoid a false failure.
