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
};

export type RouteName =
  | 'home'
  | 'catalog'
  | 'new-request'
  | 'requests'
  | 'request-detail'
  | 'approvals'
  | 'admin-forms'
  | 'admin-users';

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
};

export type PipelineStage = {
  id: string;
  label: string;
  description?: string;
};

export type KPI = {
  id: string;
  label: string;
  value: string | number;
  delta?: string;
};

export type ActivityEntry = {
  id: string;
  at: string;
  actor: string;
  verb: string;
  objectId?: string;
  detail?: string;
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
};

export type FormDef = {
  id: string;
  name: string;
  topic: string;
  description?: string;
  status: 'active' | 'disabled';
  lastEdited?: string;
  submissions?: number;
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
