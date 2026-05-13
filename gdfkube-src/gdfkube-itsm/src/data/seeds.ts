// Seed data for the gdfkube ITSM portal, ported verbatim from the
// design bundle's data.jsx. Values are typed against src/types.ts.

import type {
  ActivityEntry,
  CatalogItem,
  Cluster,
  Env,
  KPI,
  LogEntry,
  Org,
  PipelineStage,
  PolicyCheck,
  Request,
  User,
} from '../types';

export const ORGS: Org[] = [
  { id: 'saude', name: 'Saúde', group: 'saude', fullName: 'Department of Health' },
  { id: 'educacao', name: 'Educação', group: 'educacao', fullName: 'Department of Education' },
  {
    id: 'transportes',
    name: 'Transportes',
    group: 'transportes',
    fullName: 'Department of Transportation',
  },
  { id: 'fazenda', name: 'Fazenda', group: 'fazenda', fullName: 'Department of Finance' },
  {
    id: 'agricultura',
    name: 'Agricultura',
    group: 'agricultura',
    fullName: 'Department of Agriculture',
  },
  {
    id: 'seguranca',
    name: 'Segurança',
    group: 'seguranca',
    fullName: 'Department of Public Safety',
  },
];

export const ENVS: Env[] = ['development', 'staging', 'production'];

// Slugify a policy-check label so we can synthesize a stable PolicyCheck.id.
function policyId(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function makeChecks(items: { label: string; ok: boolean; detail?: string }[]): PolicyCheck[] {
  return items.map((c) => ({ id: policyId(c.label), label: c.label, ok: c.ok, detail: c.detail }));
}

// Form id used by the bundle for un-tagged cluster requests (status: provisioning/ready/failed).
const CLUSTER_FORM_ID = 'cluster-request';

// Map of usernames whose role differs from the default 'operator'. Add
// entries here when seed data introduces a new admin user. Keeping this
// alongside `buildRequester` (rather than importing the server's DEMO_USERS)
// keeps the frontend seed data self-contained.
const KNOWN_ROLES: Record<string, 'operator' | 'admin'> = {
  'maria.costa': 'admin',
};

function buildRequester(username: string, fullName: string, group: string): User {
  return {
    id: username,
    username,
    name: username,
    fullName,
    email: `${username}@${group}.gov`,
    role: KNOWN_ROLES[username] ?? 'operator',
    group,
  };
}

// Map of bundle "form" tag -> canonical form id.
const FORM_MAP: Record<string, string> = {
  'cluster-request': 'cluster-request',
  'namespace-request': 'namespace-request',
  scale: 'scale-request',
};

type RawRequest = {
  id: string;
  requestId: string;
  cluster: string;
  org: string;
  env: Env;
  nodes: number;
  requester: string;
  requesterFull: string;
  submitted: string;
  status: Request['status'];
  stage: number;
  progress: number;
  form?: string;
  formLabel?: string;
  justification?: string;
  waiting?: string;
  estCost?: string;
  policyChecks?: { label: string; ok: boolean }[];
};

const RAW_REQUESTS: RawRequest[] = [
  {
    id: 'REQ0010247C',
    requestId: '01HQ3K5M7N8P9Q0R1S2T3U4V5W',
    cluster: 'vacinacao',
    org: 'saude',
    env: 'production',
    nodes: 3,
    requester: 'joao.silva',
    requesterFull: 'João Silva',
    submitted: '2026-04-27 09:14:22',
    status: 'provisioning',
    stage: 4,
    progress: 58,
  },
  {
    id: 'REQ0010244C',
    requestId: '01HQ3J2K8L9M0N1P2Q3R4S5T6U',
    cluster: 'matricula-portal',
    org: 'educacao',
    env: 'staging',
    nodes: 2,
    requester: 'maria.costa',
    requesterFull: 'Maria Costa',
    submitted: '2026-04-27 08:42:01',
    status: 'ready',
    stage: 7,
    progress: 100,
  },
  {
    id: 'REQ0010241C',
    requestId: '01HQ3H8N9P0Q1R2S3T4U5V6W7X',
    cluster: 'tracking-frota',
    org: 'transportes',
    env: 'production',
    nodes: 5,
    requester: 'carlos.mendes',
    requesterFull: 'Carlos Mendes',
    submitted: '2026-04-26 16:08:55',
    status: 'ready',
    stage: 7,
    progress: 100,
  },
  {
    id: 'REQ0010238C',
    requestId: '01HQ3F1G2H3J4K5L6M7N8P9Q0R',
    cluster: 'tributos-api',
    org: 'fazenda',
    env: 'development',
    nodes: 1,
    requester: 'ana.rodrigues',
    requesterFull: 'Ana Rodrigues',
    submitted: '2026-04-26 11:30:12',
    status: 'approval',
    stage: 0,
    progress: 5,
    form: 'cluster-request',
    formLabel: 'OpenShift Cluster',
    justification:
      'Pilot for new tax-collection API. Dev cluster only — will be torn down at end of Q3.',
    waiting: '2h 14m',
    estCost: 'R$ 412/mo',
    policyChecks: [
      { label: 'RHACM governance baseline', ok: true },
      { label: 'Naming convention (hc-fazenda-*)', ok: true },
      { label: 'Image registry allowlist', ok: true },
    ],
  },
  {
    id: 'REQ0010249C',
    requestId: '01HQ3M9P2Q3R4S5T6U7V8W9X0Y',
    cluster: 'agendamento-v2',
    org: 'saude',
    env: 'production',
    nodes: 4,
    requester: 'joao.silva',
    requesterFull: 'João Silva',
    submitted: '2026-04-27 10:02:18',
    status: 'approval',
    stage: 0,
    progress: 3,
    form: 'cluster-request',
    formLabel: 'OpenShift Cluster',
    justification:
      'Replace legacy agendamento cluster ahead of vaccination campaign in May. Production traffic ~12k req/s peak.',
    waiting: '26m',
    estCost: 'R$ 2,180/mo',
    policyChecks: [
      { label: 'RHACM governance baseline', ok: true },
      { label: 'Naming convention (hc-saude-*)', ok: true },
      { label: 'Production change window', ok: true },
    ],
  },
  {
    id: 'REQ0010251C',
    requestId: '01HQ3N4R5S6T7U8V9W0X1Y2Z3A',
    cluster: 'transito-realtime',
    org: 'transportes',
    env: 'staging',
    nodes: 2,
    requester: 'carlos.mendes',
    requesterFull: 'Carlos Mendes',
    submitted: '2026-04-27 11:48:55',
    status: 'approval',
    stage: 0,
    progress: 2,
    form: 'scale',
    formLabel: 'Cluster Scale Change',
    justification: 'Scale tracking-frota staging from 2 → 5 nodes for load-test next week.',
    waiting: '8m',
    estCost: '+R$ 640/mo',
    policyChecks: [
      { label: 'RHACM governance baseline', ok: true },
      { label: 'Scale guardrail (max 8 nodes)', ok: true },
    ],
  },
  {
    id: 'REQ0010235C',
    requestId: '01HQ3D4E5F6G7H8J9K0L1M2N3P',
    cluster: 'safra-monitor',
    org: 'agricultura',
    env: 'production',
    nodes: 4,
    requester: 'pedro.almeida',
    requesterFull: 'Pedro Almeida',
    submitted: '2026-04-25 14:20:48',
    status: 'failed',
    stage: 5,
    progress: 70,
  },
];

export const REQUESTS: Request[] = RAW_REQUESTS.map((r) => {
  const formId = r.form ? (FORM_MAP[r.form] ?? r.form) : CLUSTER_FORM_ID;
  return {
    id: r.id,
    formId,
    env: r.env,
    requester: buildRequester(r.requester, r.requesterFull, r.org),
    requesterGroupName: r.org,
    status: r.status,
    stage: r.stage,
    submittedAt: r.submitted,
    justification: r.justification,
    vars: {
      clusterName: r.cluster,
      environment: r.env,
      nodeCount: r.nodes,
    },
    meta: {
      requestId: r.requestId,
      requesterGroupName: r.org,
      requesterUsername: r.requester,
      requesterFullName: r.requesterFull,
      formId,
      submittedAt: r.submitted,
    },
    policyChecks: r.policyChecks ? makeChecks(r.policyChecks) : [],
    formLabel: r.formLabel,
    progress: r.progress,
    waiting: r.waiting,
    estCost: r.estCost,
    requestId: r.requestId,
  };
});

export const PIPELINE_STAGES: PipelineStage[] = [
  { id: 'form', label: 'Form', sub: 'Express', icon: 'form' },
  { id: 'mongo', label: 'MongoDB', sub: 'replica', icon: 'db' },
  { id: 'debezium', label: 'Debezium', sub: 'CDC', icon: 'cdc' },
  { id: 'kafka', label: 'Kafka', sub: 'topic', icon: 'stream' },
  { id: 'camel', label: 'Camel', sub: 'consumer', icon: 'gears' },
  { id: 'git', label: 'Git', sub: 'Gitea', icon: 'git' },
  { id: 'argocd', label: 'ArgoCD', sub: '+ HyperShift', icon: 'cluster' },
];

export const ACTIVITY_LOG: LogEntry[] = [
  { ts: '09:14:22.103', lvl: 'info', msg: 'POST /requests received from operator joao.silva@saude' },
  {
    ts: '09:14:22.118',
    lvl: 'info',
    msg: 'Document inserted into mongodb://gdfkube/requests, _id=66edf8aa12...',
  },
  {
    ts: '09:14:22.142',
    lvl: 'info',
    msg: 'Debezium captured CDC event op=c, publishing to dbz.gdfkube.requests',
  },
  { ts: '09:14:22.156', lvl: 'info', msg: 'Kafka producer ack offset=24871 partition=0' },
  {
    ts: '09:14:22.201',
    lvl: 'info',
    msg: "Camel route 'request-router' invoked, formId=cluster-request",
  },
  {
    ts: '09:14:22.214',
    lvl: 'info',
    msg: "Org 'saude' lookup → existing customer repo gdfkube-saude",
  },
  {
    ts: '09:14:22.305',
    lvl: 'info',
    msg: 'Rendering 5 cluster templates (HostedCluster, NodePool, ManagedCluster…)',
  },
  {
    ts: '09:14:22.488',
    lvl: 'ok',
    msg: 'git push origin main → gdfkube-saude/clusters/vacinacao/ (6 files, +412 lines)',
  },
  { ts: '09:14:22.501', lvl: 'info', msg: 'Awaiting ArgoCD ApplicationSet directory generator…' },
];

export const KPIS: KPI[] = [
  {
    id: 'active-clusters',
    label: 'Active Clusters',
    value: '47',
    delta: '+5 this week',
    accent: 'var(--civic-500)',
    trend: 'up',
  },
  {
    id: 'pending-provisioning',
    label: 'Pending Provisioning',
    value: '3',
    delta: 'avg 2m 14s',
    accent: 'var(--amber-500)',
  },
  {
    id: 'failed-30d',
    label: 'Failed Last 30d',
    value: '2',
    delta: '-3 vs prev. period',
    accent: 'var(--red-500)',
    trend: 'down',
  },
];

export const RECENT_ACTIVITY: ActivityEntry[] = [
  {
    id: 'a1',
    at: '2 min ago',
    actor: 'system',
    verb: 'entered Camel processing',
    objectId: 'REQ0010247C',
    detail: 'REQ0010247C entered Camel processing',
    type: 'info',
  },
  {
    id: 'a2',
    at: '8 min ago',
    actor: 'ArgoCD',
    verb: 'cluster matricula-portal ready',
    objectId: 'REQ0010244C',
    detail: 'REQ0010244C cluster matricula-portal ready',
    type: 'ok',
  },
  {
    id: 'a3',
    at: '1h ago',
    actor: 'system',
    verb: 'awaiting approval from M. Costa',
    objectId: 'REQ0010241C',
    detail: 'REQ0010241C awaiting approval from M. Costa',
    type: 'warn',
  },
  {
    id: 'a4',
    at: '2h ago',
    actor: 'joao.silva',
    verb: 'submitted by ana.rodrigues@fazenda',
    objectId: 'REQ0010238C',
    detail: 'REQ0010238C submitted by ana.rodrigues@fazenda',
    type: 'info',
  },
  {
    id: 'a5',
    at: 'yesterday',
    actor: 'Camel',
    verb: 'failed at Git push (auth error)',
    objectId: 'REQ0010235C',
    detail: 'REQ0010235C failed at Git push (auth error)',
    type: 'err',
  },
];

// CatalogItem in the TS spec only carries { formId, featured? } — title/icon/desc
// live in a per-page lookup map (Task 8).
export const CATALOG_ITEMS: CatalogItem[] = [
  { formId: 'cluster-request', featured: true },
  { formId: 'namespace-request' },
  { formId: 'scale-request' },
];

export const CLUSTERS: Cluster[] = [
  {
    name: 'vacinacao',
    org: 'saude',
    env: 'production',
    nodes: 3,
    version: '4.16.7',
    age: 'creating',
    health: 'provisioning',
    region: 'br-east-1',
  },
  {
    name: 'matricula-portal',
    org: 'educacao',
    env: 'staging',
    nodes: 2,
    version: '4.16.7',
    age: '1h 12m',
    health: 'healthy',
    region: 'br-east-1',
  },
  {
    name: 'tracking-frota',
    org: 'transportes',
    env: 'production',
    nodes: 5,
    version: '4.16.5',
    age: '18h',
    health: 'healthy',
    region: 'br-east-1',
  },
  {
    name: 'ocorrencias',
    org: 'seguranca',
    env: 'staging',
    nodes: 2,
    version: '4.16.7',
    age: '2d 4h',
    health: 'healthy',
    region: 'br-south-1',
  },
  {
    name: 'epidemiologia',
    org: 'saude',
    env: 'production',
    nodes: 4,
    version: '4.16.5',
    age: '12d',
    health: 'degraded',
    region: 'br-east-1',
  },
  {
    name: 'merenda',
    org: 'educacao',
    env: 'production',
    nodes: 3,
    version: '4.16.5',
    age: '21d',
    health: 'healthy',
    region: 'br-east-1',
  },
  {
    name: 'rodovias',
    org: 'transportes',
    env: 'development',
    nodes: 1,
    version: '4.16.7',
    age: '3d',
    health: 'healthy',
    region: 'br-east-1',
  },
  {
    name: 'iptu-cobranca',
    org: 'fazenda',
    env: 'production',
    nodes: 4,
    version: '4.16.5',
    age: '32d',
    health: 'healthy',
    region: 'br-east-1',
  },
];

export const GDF_DATA = {
  ORGS,
  ENVS,
  REQUESTS,
  PIPELINE_STAGES,
  ACTIVITY_LOG,
  KPIS,
  RECENT_ACTIVITY,
  CATALOG_ITEMS,
  CLUSTERS,
} as const;

export type GdfData = typeof GDF_DATA;
