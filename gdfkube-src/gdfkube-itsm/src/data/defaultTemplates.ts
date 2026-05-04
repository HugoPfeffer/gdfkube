// Default rendered manifest templates per form id, ported from the bundle's
// DEFAULT_TEMPLATE_FILES. Token references use {{ meta.* }} and {{ vars.* }}
// — the Camel route substitutes them at submission time.

import type { TemplateFile } from '../types';

const CLUSTER_HOSTEDCLUSTER: TemplateFile = {
  name: 'hostedcluster.yaml',
  content: `# HyperShift HostedCluster manifest, rendered per submission.
apiVersion: hypershift.openshift.io/v1beta1
kind: HostedCluster
metadata:
  name: hc-{{ meta.requesterGroupName }}-{{ vars.clusterName }}
  namespace: clusters
  labels:
    gdfkube.gov/group: {{ meta.requesterGroupName }}
    gdfkube.gov/env:   {{ vars.environment }}
spec:
  release:
    image: quay.io/openshift-release-dev/ocp-release:4.16.6-x86_64
  pullSecret:
    name: pull-secret
  platform:
    type: KubeVirt
    kubevirt:
      baseDomain: gdfkube.gov.local
  services:
    - service: APIServer
      servicePublishingStrategy: { type: LoadBalancer }
  nodePools:
    - name: workers
      replicas: {{ vars.nodeCount }}
      platform: { type: KubeVirt }
`,
};

const CLUSTER_APPLICATIONSET: TemplateFile = {
  name: 'applicationset.yaml',
  content: `# ArgoCD ApplicationSet that fans out workloads to the new cluster.
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: appset-{{ meta.requesterGroupName }}-{{ vars.clusterName }}
  namespace: argocd
spec:
  generators:
    - clusters:
        selector:
          matchLabels:
            gdfkube.gov/group: {{ meta.requesterGroupName }}
            gdfkube.gov/env:   {{ vars.environment }}
  template:
    metadata:
      name: '{{ "{{name}}" }}-baseline'
    spec:
      project: {{ meta.requesterGroupName }}
      source:
        repoURL: https://git.gdfkube.gov/{{ meta.requesterGroupName }}/baseline.git
        targetRevision: HEAD
        path: overlays/{{ vars.environment }}
      destination:
        server: '{{ "{{server}}" }}'
        namespace: kube-system
`,
};

const CLUSTER_MANAGEDCLUSTER: TemplateFile = {
  name: 'managedcluster.yaml',
  content: `# RHACM ManagedCluster registration.
apiVersion: cluster.open-cluster-management.io/v1
kind: ManagedCluster
metadata:
  name: {{ vars.clusterName }}
  labels:
    gdfkube.gov/group: {{ meta.requesterGroupName }}
    gdfkube.gov/env:   {{ vars.environment }}
spec:
  hubAcceptsClient: true
`,
};

const NAMESPACE_NAMESPACE: TemplateFile = {
  name: 'namespace.yaml',
  content: `apiVersion: v1
kind: Namespace
metadata:
  name: {{ vars.namespaceName }}
  labels:
    gdfkube.gov/group: {{ meta.requesterGroupName }}
`,
};

const NAMESPACE_RESOURCEQUOTA: TemplateFile = {
  name: 'resourcequota.yaml',
  content: `apiVersion: v1
kind: ResourceQuota
metadata:
  name: default-quota
  namespace: {{ vars.namespaceName }}
spec:
  hard:
    requests.cpu: "{{ vars.cpuQuota }}"
    requests.memory: "{{ vars.memQuotaGi }}Gi"
`,
};

const SCALE_NODEPOOL: TemplateFile = {
  name: 'nodepool.yaml',
  content: `# Patch applied to the existing NodePool.
apiVersion: hypershift.openshift.io/v1beta1
kind: NodePool
metadata:
  name: {{ vars.clusterName }}-workers
  namespace: clusters
spec:
  replicas: {{ vars.newNodeCount }}
`,
};

export const DEFAULT_TEMPLATES: Record<string, TemplateFile[]> = {
  'cluster-request': [CLUSTER_HOSTEDCLUSTER, CLUSTER_APPLICATIONSET, CLUSTER_MANAGEDCLUSTER],
  'namespace-request': [NAMESPACE_NAMESPACE, NAMESPACE_RESOURCEQUOTA],
  'scale-request': [SCALE_NODEPOOL],
};
