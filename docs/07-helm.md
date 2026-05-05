# Helm

> **Implementation Status:** Planned
> **Source:** Handoff `app.jsx` (template-only model, values composition)
> **Last validated:** 2026-05-05

## Role in the Pipeline

```
[Camel helm-render] ──exec("helm template")──▶ [rendered YAML] ──▶ [Camel git-push]
       ▲
       │ values from meta/vars/system
       │
[Charts mounted from gdfkube-infra via initContainer]
```

Helm is used as a pure template engine. There are no releases, no Tiller, no
in-cluster Helm state. Camel calls `helm template` and writes the output to
Git.

## Responsibilities

- Render YAML manifests from chart templates and a values document.
- **Does NOT** install, upgrade, or track releases. ArgoCD owns reconciliation.

## Design

### Tech

- Helm 3.x CLI binary, baked into the Camel container image at a pinned version.
- Charts authored in standard Helm format (Chart.yaml, templates/, values.schema.json).

### Chart Layout (in `gdfkube-infra`)

```
gdfkube-infra/
└── charts/
    ├── cluster-request/                # one chart per FormDef
    │   ├── Chart.yaml
    │   ├── values.schema.json
    │   ├── templates/
    │   │   ├── hostedcluster.yaml
    │   │   ├── nodepool.yaml
    │   │   ├── managedcluster.yaml      # pre-created with clusterset label
    │   │   └── _helpers.tpl
    │   └── README.md
    ├── namespace-request/
    │   ├── Chart.yaml
    │   └── templates/namespace.yaml
    ├── scale-patch/
    │   └── templates/nodepool-patch.yaml
    └── infra/                          # shared platform charts
        ├── argocd-org/
        │   ├── templates/appproject.yaml
        │   └── templates/applicationset.yaml
        └── rhacm-org/
            ├── templates/managedclusterset.yaml
            └── templates/managedclustersetbinding.yaml
```

`charts/` is the only path Camel reads — anything outside is project metadata.

### Chart Delivery

**InitContainer mount strategy** (chosen over baked-into-image):

```yaml
# excerpt from gdfkube-camel Deployment
spec:
  template:
    spec:
      volumes:
        - name: charts
          emptyDir: {}
      initContainers:
        - name: clone-charts
          image: alpine/git
          command:
            - sh
            - -c
            - "git clone --depth 1 https://gitea-gitea.apps.gdfkube.gov/gdfkube/gdfkube-infra.git /charts && cp -r /charts/charts/. /opt/charts/"
          volumeMounts:
            - name: charts
              mountPath: /opt/charts
      containers:
        - name: camel
          image: quay.io/gdfkube/gdfkube-camel:<tag>
          volumeMounts:
            - name: charts
              mountPath: /opt/charts
              readOnly: true
```

Hot-reload of charts = restart the Camel pod. Image releases ship the Helm
CLI binary; chart releases ship via Git push to `gdfkube-infra` + pod
restart.

### Values Document

Three tiers, fully built by Camel's `helmValuesBuilder` bean before invoking
the CLI. See [06-camel.md](./06-camel.md) for the full example.

| Tier | Source | Notes |
|---|---|---|
| `meta.*` | Request document | Read-only at render time. Includes `requestId`, `formId`, `org`, requester email, `correlationId`. |
| `vars.*` | Form input | The operator's values. Validated against `values.schema.json` in the chart. |
| `system.*` | Bean-injected | `baseDomain`, `releaseImage`, `naming.*`, `gitea*` URLs, `labels.*`, `annotations.*`. Not user-editable. |

### CLI Invocation

```
helm template <releaseName> /opt/charts/<chartName> \
  --values /tmp/<requestId>-values.yaml \
  --output-dir /tmp/<requestId>-out \
  --include-crds
```

`releaseName` = `hc-{org}-{clusterName}` for cluster-request, `ns-{namespace}` for namespace-request, etc. The release name doubles as the deterministic file path under the Git repo (`clusters/<releaseName>/`).

### CIDR Defaults

`values.schema.json` for `cluster-request` declares CIDRs with hardcoded defaults:

- `clusterNetwork: 10.132.0.0/14`
- `serviceNetwork: 172.31.0.0/16`

Forms may surface override fields under an "Advanced" section; the operator is
responsible for picking non-overlapping ranges.

## Interfaces

| Direction | Counterpart | Protocol |
|---|---|---|
| Inbound | Camel `helm-render` route | subprocess exec, stdin values, stdout YAML |
| Inbound | `gdfkube-infra` Git repo | initContainer clone (one-shot at pod start) |

## Operational Concerns

- **No release state.** ArgoCD is the only thing reconciling — Helm produces text and stops.
- **Schema validation:** `values.schema.json` per chart is enforced by Helm itself at render time. Permanent failures (missing required values) skip retry in Camel.
- **CRD inclusion:** `--include-crds` is set; ArgoCD applies CRDs first via syncwave annotations on the chart.

## Decisions Resolved

- Pure `helm template` model. No releases, no Tiller.
- Charts delivered to Camel via initContainer git-clone of `gdfkube-infra` into a shared `emptyDir`.
- Chart updates require Camel pod restart.
- CIDR defaults hardcoded; per-form override surface is optional advanced UI.

## Open Questions

- Chart version pinning: the initContainer clones HEAD of `gdfkube-infra`. Should it pin to a tag or annotation-driven SHA?
- Should rendered manifests be linted (kubeval, kubeconform) inside Camel before commit?
- How are chart deletions handled (retired forms)? No cleanup story today.

## References

- [06-camel.md](./06-camel.md) — render path, values composition.
- [08-git.md](./08-git.md) — where rendered output lands.
- [11-hypershift.md](./11-hypershift.md) — the `cluster-request` chart's primary outputs.
