// Types for the ITSM portal demo. This file exports types only — no runtime values.

export type Role = 'operator' | 'admin';

export type User = {
  id: string;
  name: string;
  fullName?: string;
  email: string;
  role: Role;
  group?: string;
  status?: 'active' | 'disabled';
  username?: string;
  mfa?: string;
  active?: boolean;
  last?: string;
};

export type RouteName =
  | 'home'
  | 'catalog'
  | 'new-request'
  | 'requests'
  | 'request-detail'
  | 'approvals'
  | 'admin-forms'
  | 'admin-users'
  | 'settings';

export type RouteParams = {
  formId?: string;
  id?: string;
  submitted?: boolean;
};

export type Org = {
  id: string;
  name: string;
  group: string;
  fullName?: string;
};

export type Env = 'production' | 'staging' | 'development';

export type RequestStatus = 'approval' | 'provisioning' | 'ready' | 'failed';

export type PolicyCheck = {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
};

export type ApprovalDecision = {
  actor: string;
  action: 'approved' | 'rejected' | 'requested_changes';
  comment?: string;
  at: string;
};

export type Request = {
  id: string;
  formId: string;
  env: Env;
  requester: User;
  requesterGroupName: string;
  status: RequestStatus;
  stage: number;
  submittedAt: string;
  justification?: string;
  vars: Record<string, unknown>;
  meta: Record<string, unknown>;
  policyChecks: PolicyCheck[];
  approvalChain?: ApprovalDecision[];
  reason?: string;
  // Optional display extras carried through from the seed bundle.
  formLabel?: string;
  progress?: number;
  waiting?: string;
  estCost?: string;
  requestId?: string;
};

export type PipelineStage = {
  id: string;
  label: string;
  description?: string;
  sub?: string;
  icon?: string;
};

export type KPI = {
  id: string;
  label: string;
  value: string | number;
  delta?: string;
  accent?: string;
  trend?: 'up' | 'down';
};

export type ActivityEntry = {
  id: string;
  at: string;
  actor: string;
  verb: string;
  objectId?: string;
  detail?: string;
  type?: 'info' | 'ok' | 'warn' | 'err';
};

export type LogEntry = {
  ts: string;
  lvl: 'info' | 'ok' | 'warn' | 'err';
  msg: string;
};

export type Cluster = {
  name: string;
  org: string;
  env: Env;
  nodes: number;
  version: string;
  age: string;
  health: 'provisioning' | 'healthy' | 'degraded' | 'failed';
  region: string;
};

export type Group = {
  id: string;
  name: string;
  fullName: string;
  users: number;
  forms: number;
  repo: string;
  clusters: number | null;
};

export type CatalogItem = {
  formId: string;
  featured?: boolean;
};

export type FieldType = 'text' | 'textarea' | 'number' | 'select' | 'checkbox';
export type FieldBucket = 'meta' | 'vars';
export type FieldDisplayAs = 'dropdown' | 'radio-cards';

export type Field = {
  key: string;
  label: string;
  type: FieldType;
  bucket: FieldBucket;
  required?: boolean;
  help?: string;
  prefix?: string;
  placeholder?: string;
  validation?: string;
  min?: number;
  max?: number;
  options?: string;
  displayAs?: FieldDisplayAs;
  // Numeric id from the seed bundle (used as a stable React key during reorder).
  id?: number;
};

export type FormDef = {
  id: string;
  name: string;
  topic: string;
  description?: string;
  status: 'active' | 'disabled';
  lastEdited?: string;
  submissions?: number;
  // Bundle-only display extras.
  fieldCount?: number;
  updated?: string;
};

export type TemplateFile = {
  name: string;
  content: string;
};

export type Tweaks = {
  density: 'compact' | 'comfortable';
  theme: 'light' | 'dark';
  sidebarCollapsed: boolean;
  pipelineSpeed: number;
  showDemoBanner: boolean;
};

export type SelectOption = {
  value: string;
  label: string;
  description?: string;
  dotColor?: string;
};
