export type StageName = 'form' | 'mongo' | 'debezium' | 'kafka' | 'camel' | 'git' | 'argocd';
export const STAGE_NAMES: StageName[] = ['form', 'mongo', 'debezium', 'kafka', 'camel', 'git', 'argocd'];

export interface StageEvent {
  requestId: string;
  stage: number;
  stageName: StageName;
  status: 'ok' | 'fail';
  at: string;
  detail?: string;
}

export function validateStageEvent(p: unknown): p is StageEvent {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  return typeof o.requestId === 'string'
    && typeof o.stage === 'number' && o.stage >= 0 && o.stage <= 6
    && typeof o.stageName === 'string' && STAGE_NAMES.includes(o.stageName as StageName)
    && (o.status === 'ok' || o.status === 'fail')
    && typeof o.at === 'string';
}
