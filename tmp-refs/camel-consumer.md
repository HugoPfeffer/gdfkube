# Camel CDC Consumer

The Camel consumer processes CDC events from Debezium, renders Mustache templates, and pushes manifests to Git repositories.

## Overview

```
Kafka (dbz.gdfkube.requests)
         |
         v
+-------------------------------------------------------------+
|                    Camel Consumer                            |
|                                                              |
|  1. Parse CDC event                                          |
|  2. Filter creates (op='c')                                  |
|  3. Lookup schema -> get templateFieldIdentifier             |
|  4. Check if customer repo exists                            |
|     +-- Check if infra directory exists                      |
|     +-- If new org:                                          |
|        +-- Create customer repo (gdfkube-{org})              |
|        +-- Render infra templates -> push to gdfkube-infra   |
|        +-- Rollback on failure                               |
|  5. Render cluster templates -> push to gdfkube-{org}        |
+-------------------------------------------------------------+
         |                              |
         v                              v
   gdfkube-infra                  gdfkube-{org}
   (ArgoCD, RHACM)                (cluster manifests)
```

## Routes

**Location:** `src/camel-consumer/src/main/resources/routes/cdc-consumer.camel.yaml`

| Route                      | Purpose                                                        |
| -------------------------- | -------------------------------------------------------------- |
| `cdc-consumer-main`        | Kafka consumer, CDC parsing, orchestration entry               |
| `multi-repo-orchestration` | Coordinates repo check, creation, and pushes                   |
| `lookup-schema`            | Fetches formSchema from node-app API                           |
| `check-customer-repo`      | Checks if gdfkube-{org} exists                                 |
| `check-infra-directory`    | Checks if infra/argocd/{org} exists in gdfkube-infra           |
| `create-customer-repo`     | Creates customer repo via Gitea API                            |
| `rollback-customer-repo`   | Deletes customer repo on failure                               |
| `render-infra-templates`   | Renders AppProject, ApplicationSet, ManagedClusterSet, Binding |
| `render-cluster-templates` | Renders namespace, HostedCluster, NodePool, secrets            |
| `git-push-infra`           | Pushes to gdfkube-infra                                        |
| `git-push-cluster`         | Pushes to gdfkube-{org}                                        |
| `git-push-generic`         | Reusable git clone/commit/push                                 |

## Processors

**Location:** `src/camel-consumer/src/main/java/io/gdfkube/camel/`

| Processor                 | Purpose                                                  |
| ------------------------- | -------------------------------------------------------- |
| `ResourceNameResolver`    | Resolves `vars[templateFieldIdentifier]` to resourceName |
| `CustomerRepoChecker`     | Checks Gitea for repo existence                          |
| `InfraDirectoryChecker`   | Checks if org's infra directory exists in gdfkube-infra  |
| `CustomerRepoCreator`     | Creates repo via Gitea API                               |
| `GiteaRepoRollback`       | Deletes repo on failure                                  |
| `InfraTemplateRenderer`   | Renders infra templates to temp directory                |
| `ClusterTemplateRenderer` | Renders cluster templates to temp directory              |
| `GiteaUrlBuilder`         | Builds authenticated clone URL                           |

## Templates

### Cluster Templates

**Location:** `templates/cluster-request/base/`

| Template                               | Output                       |
| -------------------------------------- | ---------------------------- |
| `namespace.yaml.mustache`              | Namespace for hosted cluster |
| `hostedcluster.yaml.mustache`          | HyperShift HostedCluster CR  |
| `nodepool.yaml.mustache`               | HyperShift NodePool CR       |
| `etcd-encryption-secret.yaml.mustache` | etcd encryption key          |

**Kustomization:** `templates/cluster-request/kustomization.yaml.mustache`

### Infra Templates

**Location:** `templates/infra/`

| Template                                | Output                               | Target Repo   |
| --------------------------------------- | ------------------------------------ | ------------- |
| `argocd/appproject.yaml.mustache`       | AppProject for customer              | gdfkube-infra |
| `argocd/applicationset.yaml.mustache`   | ApplicationSet for cluster discovery | gdfkube-infra |
| `rhacm/managedclusterset.yaml.mustache` | Per-customer ManagedClusterSet       | gdfkube-infra |
| `rhacm/binding.yaml.mustache`           | ManagedClusterSetBinding             | gdfkube-infra |

## Template Context

### Cluster Templates

Variables use the `body.` prefix (wrapped by `ClusterTemplateRenderer`):

| Variable                           | Source               | Example                      |
| ---------------------------------- | -------------------- | ---------------------------- |
| `{{body.formId}}`                  | Request              | `cluster-request`            |
| `{{body.requestId}}`               | Request (ULID)       | `01HQ3K5M7N8P9Q0R1S2T3U4V5W` |
| `{{body.meta.requesterName}}`      | User session         | `joao.silva`                 |
| `{{body.meta.requesterGroupName}}` | User group           | `saude`                      |
| `{{body.meta.guid}}`               | Generated 4-char hex | `a1b2`                       |
| `{{body.vars.*}}`                  | Form fields          | `{{body.vars.clusterName}}`  |
| `{{body.createdAt}}`               | ISO-8601 timestamp   | `2025-12-30T10:20:09.576Z`   |

### Infra Templates

Variables use flat structure (set by `InfraTemplateRenderer`):

| Variable  | Source                    | Example |
| --------- | ------------------------- | ------- |
| `{{org}}` | `meta.requesterGroupName` | `saude` |

## Multi-Repo Flow

### New Organization (First Cluster)

```
1. CDC event received
2. Schema lookup -> get templateFieldIdentifier
3. Check customer repo -> NOT EXISTS
4. doTry:
   a. Create customer repo (gdfkube-saude)
   b. Render infra templates
   c. Push to gdfkube-infra
   doCatch:
   - Delete customer repo (rollback)
   - Re-throw exception
5. Render cluster templates
6. Push to gdfkube-saude
```

### Existing Organization

```
1. CDC event received
2. Schema lookup -> get templateFieldIdentifier
3. Check customer repo -> EXISTS
4. Render cluster templates
5. Push to gdfkube-{org}
```

## Git Push Workflow

1. Clone repo to `/tmp/{requestId}-git-{repoName}/`
2. Copy rendered templates to clone
3. Configure git user (camel@gdfkube.local)
4. Stage all changes (`git add -A`)
5. Commit with message
6. Push to origin/main
7. Delete temp directory

## Task Commands

```bash
task camel:status    # Show health and routes status
task camel:logs      # Tail consumer logs
```

Use `task dev:reset -- camel-consumer` to rebuild the consumer image.

## Configuration

**Location:** `src/camel-consumer/src/main/resources/application.properties`

```properties
# Kafka
camel.component.kafka.brokers=${KAFKA_BOOTSTRAP_SERVERS:kafka:9093}
gdfkube.cdc.topic=${CDC_TOPIC:dbz.gdfkube.requests}

# Node App (schema API)
gdfkube.node-app.host=${NODE_APP_HOST:node-app}
gdfkube.node-app.port=${NODE_APP_PORT:3000}

# Gitea
gdfkube.gitea.host=${GITEA_HOST:gitea}
gdfkube.gitea.port=${GITEA_PORT:3000}
gdfkube.gitea.owner=${GITEA_OWNER:admin}
```
