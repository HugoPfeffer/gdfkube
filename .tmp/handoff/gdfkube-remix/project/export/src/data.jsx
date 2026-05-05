// Seed data for the gdfkube ITSM portal
const ORGS = [
  { id: "saude",          name: "Saúde",          full: "Department of Health" },
  { id: "educacao",       name: "Educação",       full: "Department of Education" },
  { id: "transportes",    name: "Transportes",    full: "Department of Transportation" },
  { id: "fazenda",        name: "Fazenda",        full: "Department of Finance" },
  { id: "agricultura",    name: "Agricultura",    full: "Department of Agriculture" },
  { id: "seguranca",      name: "Segurança",      full: "Department of Public Safety" },
];

const ENVS = ["development", "staging", "production"];

const REQUESTS = [
  {
    id: "REQ0010247",
    requestId: "01HQ3K5M7N8P9Q0R1S2T3U4V5W",
    cluster: "vacinacao",
    org: "saude",
    env: "production",
    nodes: 3,
    requester: "joao.silva",
    requesterFull: "João Silva",
    submitted: "2026-04-27 09:14:22",
    status: "provisioning",
    stage: 4, // currently on Camel
    progress: 58,
  },
  {
    id: "REQ0010244",
    requestId: "01HQ3J2K8L9M0N1P2Q3R4S5T6U",
    cluster: "matricula-portal",
    org: "educacao",
    env: "staging",
    nodes: 2,
    requester: "maria.costa",
    requesterFull: "Maria Costa",
    submitted: "2026-04-27 08:42:01",
    status: "ready",
    stage: 7,
    progress: 100,
  },
  {
    id: "REQ0010241",
    requestId: "01HQ3H8N9P0Q1R2S3T4U5V6W7X",
    cluster: "tracking-frota",
    org: "transportes",
    env: "production",
    nodes: 5,
    requester: "carlos.mendes",
    requesterFull: "Carlos Mendes",
    submitted: "2026-04-26 16:08:55",
    status: "ready",
    stage: 7,
    progress: 100,
  },
  {
    id: "REQ0010238",
    requestId: "01HQ3F1G2H3J4K5L6M7N8P9Q0R",
    cluster: "tributos-api",
    org: "fazenda",
    env: "development",
    nodes: 1,
    requester: "ana.rodrigues",
    requesterFull: "Ana Rodrigues",
    submitted: "2026-04-26 11:30:12",
    status: "approval",
    stage: 0,
    progress: 5,
    form: "cluster-request",
    formLabel: "OpenShift Cluster",
    justification: "Pilot for new tax-collection API. Dev cluster only — will be torn down at end of Q3.",
    waiting: "2h 14m",
    estCost: "R$ 412/mo",
    policyChecks: [
      { label: "RHACM governance baseline", ok: true },
      { label: "Naming convention (hc-fazenda-*)", ok: true },
      { label: "Image registry allowlist", ok: true },
    ],
  },
  {
    id: "REQ0010249",
    requestId: "01HQ3M9P2Q3R4S5T6U7V8W9X0Y",
    cluster: "agendamento-v2",
    org: "saude",
    env: "production",
    nodes: 4,
    requester: "joao.silva",
    requesterFull: "João Silva",
    submitted: "2026-04-27 10:02:18",
    status: "approval",
    stage: 0,
    progress: 3,
    form: "cluster-request",
    formLabel: "OpenShift Cluster",
    justification: "Replace legacy agendamento cluster ahead of vaccination campaign in May. Production traffic ~12k req/s peak.",
    waiting: "26m",
    estCost: "R$ 2,180/mo",
    policyChecks: [
      { label: "RHACM governance baseline", ok: true },
      { label: "Naming convention (hc-saude-*)", ok: true },
      { label: "Production change window", ok: true },
    ],
  },
  {
    id: "REQ0010251",
    requestId: "01HQ3N4R5S6T7U8V9W0X1Y2Z3A",
    cluster: "transito-realtime",
    org: "transportes",
    env: "staging",
    nodes: 2,
    requester: "carlos.mendes",
    requesterFull: "Carlos Mendes",
    submitted: "2026-04-27 11:48:55",
    status: "approval",
    stage: 0,
    progress: 2,
    form: "scale",
    formLabel: "Cluster Scale Change",
    justification: "Scale tracking-frota staging from 2 → 5 nodes for load-test next week.",
    waiting: "8m",
    estCost: "+R$ 640/mo",
    policyChecks: [
      { label: "RHACM governance baseline", ok: true },
      { label: "Scale guardrail (max 8 nodes)", ok: true },
    ],
  },
  {
    id: "REQ0010235",
    requestId: "01HQ3D4E5F6G7H8J9K0L1M2N3P",
    cluster: "safra-monitor",
    org: "agricultura",
    env: "production",
    nodes: 4,
    requester: "pedro.almeida",
    requesterFull: "Pedro Almeida",
    submitted: "2026-04-25 14:20:48",
    status: "failed",
    stage: 5, // failed at Git push
    progress: 70,
  },
  {
    id: "REQ0010230",
    requestId: "01HQ3A6B7C8D9E0F1G2H3J4K5L",
    cluster: "ocorrencias",
    org: "seguranca",
    env: "staging",
    nodes: 2,
    requester: "lucia.fernandes",
    requesterFull: "Lúcia Fernandes",
    submitted: "2026-04-25 09:05:31",
    status: "ready",
    stage: 7,
    progress: 100,
  },
];

const PIPELINE_STAGES = [
  { key: "form",       label: "Form",       sub: "Express",   icon: "form" },
  { key: "mongo",      label: "MongoDB",    sub: "replica",   icon: "db" },
  { key: "debezium",   label: "Debezium",   sub: "CDC",       icon: "cdc" },
  { key: "kafka",      label: "Kafka",      sub: "topic",     icon: "stream" },
  { key: "camel",      label: "Camel",      sub: "consumer",  icon: "gears" },
  { key: "git",        label: "Git",        sub: "Gitea",     icon: "git" },
  { key: "argocd",     label: "ArgoCD",     sub: "+ HyperShift", icon: "cluster" },
];

const ACTIVITY_LOG = [
  { ts: "09:14:22.103", lvl: "info", msg: "POST /requests received from operator joao.silva@saude" },
  { ts: "09:14:22.118", lvl: "info", msg: "Document inserted into mongodb://gdfkube/requests, _id=66edf8aa12..." },
  { ts: "09:14:22.142", lvl: "info", msg: "Debezium captured CDC event op=c, publishing to dbz.gdfkube.requests" },
  { ts: "09:14:22.156", lvl: "info", msg: "Kafka producer ack offset=24871 partition=0" },
  { ts: "09:14:22.201", lvl: "info", msg: "Camel route 'request-router' invoked, formId=cluster-request" },
  { ts: "09:14:22.214", lvl: "info", msg: "Org 'saude' lookup → existing customer repo gdfkube-saude" },
  { ts: "09:14:22.305", lvl: "info", msg: "Rendering 5 cluster templates (HostedCluster, NodePool, ManagedCluster…)" },
  { ts: "09:14:22.488", lvl: "ok",   msg: "git push origin main → gdfkube-saude/clusters/vacinacao/ (6 files, +412 lines)" },
  { ts: "09:14:22.501", lvl: "info", msg: "Awaiting ArgoCD ApplicationSet directory generator…" },
];

const KPIS = [
  { label: "Active Clusters",      value: "47",  delta: "+5 this week",          accent: "var(--civic-500)", trend: "up" },
  { label: "Pending Provisioning", value: "3",   delta: "avg 2m 14s",            accent: "var(--amber-500)" },
  { label: "Failed Last 30d",      value: "2",   delta: "-3 vs prev. period",    accent: "var(--red-500)",   trend: "down" },
];

const RECENT_ACTIVITY = [
  { time: "2 min ago", txt: "REQ0010247 entered Camel processing", who: "system", type: "info" },
  { time: "8 min ago", txt: "REQ0010244 cluster matricula-portal ready", who: "ArgoCD", type: "ok" },
  { time: "1h ago",    txt: "REQ0010241 awaiting approval from M. Costa", who: "approver", type: "warn" },
  { time: "2h ago",    txt: "REQ0010238 submitted by ana.rodrigues@fazenda", who: "joao.silva", type: "info" },
  { time: "yesterday", txt: "REQ0010235 failed at Git push (auth error)", who: "Camel", type: "err" },
];

const CATALOG_ITEMS = [
  { id: "cluster",      title: "OpenShift Cluster",        desc: "Provision a HyperShift hosted control plane cluster for your team.",                  icon: "cluster",  meta: ["~1m 47s", "GitOps"], featured: true },
  { id: "namespace",    title: "Namespace Onboarding",     desc: "Request a namespace on a shared cluster with RBAC and quotas.",                       icon: "ns",       meta: ["~5 min", "Self-service"] },
  { id: "scale",        title: "Cluster Scale Change",     desc: "Adjust node count or instance type for an existing hosted cluster.",                  icon: "scale",    meta: ["~3 min", "Approval"] },
];

const CLUSTERS = [
  { name: "vacinacao",       org: "saude",       env: "production", nodes: 3, version: "4.16.7",  age: "creating",  health: "provisioning", region: "br-east-1" },
  { name: "matricula-portal",org: "educacao",    env: "staging",    nodes: 2, version: "4.16.7",  age: "1h 12m",    health: "healthy",      region: "br-east-1" },
  { name: "tracking-frota",  org: "transportes", env: "production", nodes: 5, version: "4.16.5",  age: "18h",       health: "healthy",      region: "br-east-1" },
  { name: "ocorrencias",     org: "seguranca",   env: "staging",    nodes: 2, version: "4.16.7",  age: "2d 4h",     health: "healthy",      region: "br-south-1" },
  { name: "epidemiologia",   org: "saude",       env: "production", nodes: 4, version: "4.16.5",  age: "12d",       health: "degraded",     region: "br-east-1" },
  { name: "merenda",         org: "educacao",    env: "production", nodes: 3, version: "4.16.5",  age: "21d",       health: "healthy",      region: "br-east-1" },
  { name: "rodovias",        org: "transportes", env: "development",nodes: 1, version: "4.16.7",  age: "3d",        health: "healthy",      region: "br-east-1" },
  { name: "iptu-cobranca",   org: "fazenda",     env: "production", nodes: 4, version: "4.16.5",  age: "32d",       health: "healthy",      region: "br-east-1" },
];

window.GDF_DATA = {
  ORGS, ENVS, REQUESTS, PIPELINE_STAGES, ACTIVITY_LOG, KPIS, RECENT_ACTIVITY, CATALOG_ITEMS, CLUSTERS
};
