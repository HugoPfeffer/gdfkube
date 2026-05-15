## MODIFIED Requirements

### Requirement: HelmValuesBuilder SHALL produce values for org-bootstrap charts

The `gov.gdf.camel.bean.HelmValuesBuilder` bean MUST expose a `buildForOrg(String groupId, String groupRepo)` method that writes `/tmp/{groupId}-bootstrap-values.yaml` and returns its path. The values document MUST contain:

- `meta.requestId` = `bootstrap-{groupId}`
- `meta.formId` = `org-bootstrap`
- `meta.org` = `{groupId}`
- `meta.email` = `null`
- `meta.submittedAt` = ISO-8601 timestamp at invocation
- `meta.correlationId` = `bootstrap-{groupId}`
- `system.naming.appProject` = `{groupId}`
- `system.naming.clusterSet` = `{groupId}`
- `system.naming.hostedClusterName` = `{groupId}`
- `system.naming.namespace` = `{groupId}`
- `system.labels.*` = the 6 required labels
- `system.giteaExternalUrl` = the configured `app.system.gitea-external-url`
- `system.giteaOwner` = the configured `app.system.gitea-owner`
- `vars` = `{}`

The literal `meta.formId` value emitted by `buildForOrg` MUST match the `meta.formId` default declared in `gdfkube-src/gdfkube-infra/charts/infra/argocd-org/values.yaml` and `gdfkube-src/gdfkube-infra/charts/infra/rhacm-org/values.yaml` (both `org-bootstrap`). The existing `build(RequestEvent)` method MUST remain unchanged. New `getChartRef(String chartName)` and `getReleaseName(String groupId)` overloads MUST be available for the `org-bootstrap` route.

#### Scenario: buildForOrg writes a values file with the canonical naming shape

- **GIVEN** `app.system.gitea-owner=gdf` and `app.system.gitea-external-url=https://gitea.gdfkube.gov.br`
- **WHEN** `HelmValuesBuilder.buildForOrg("cultura", "gdfkube-cultura")` is invoked
- **THEN** the returned path SHALL be `/tmp/cultura-bootstrap-values.yaml`
- **AND** the file SHALL parse as YAML with `meta.requestId == "bootstrap-cultura"`, `meta.formId == "org-bootstrap"`, `system.naming.appProject == "cultura"`, `system.naming.clusterSet == "cultura"`

#### Scenario: build(RequestEvent) is unchanged after the addition

- **GIVEN** the new `buildForOrg` method has been added
- **WHEN** the existing `HelmValuesBuilderTest` (covering `build(RequestEvent)`) runs
- **THEN** the test SHALL pass without modification

#### Scenario: chart formId defaults agree with the Java emitter

- **GIVEN** `HelmValuesBuilder.buildForOrg("alpha", "gdfkube-alpha")` has been invoked
- **WHEN** the emitted `meta.formId` is compared to the `meta.formId` value parsed from `charts/infra/argocd-org/values.yaml` and `charts/infra/rhacm-org/values.yaml`
- **THEN** all three literals SHALL be equal to `"org-bootstrap"`
